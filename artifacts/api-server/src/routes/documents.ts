import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import {
  CompleteDocumentUploadBody,
  CompleteDocumentUploadParams,
  CompleteDocumentUploadResponse,
  CreateDocumentBody,
  CreateDocumentResponse,
  DeleteDocumentParams,
  DownloadDocumentParams,
  GetDocumentParams,
  GetDocumentResponse,
  ListDocumentsQueryParams,
  ListDocumentsResponse,
  ListSharedDocumentsResponse,
} from "@workspace/api-zod";
import {
  auditEventsTable,
  db,
  documentPermissionsTable,
  documentsTable,
  usersTable,
} from "@workspace/db";
import { appendAuditEvent } from "../lib/audit";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const maxFileSizeBytes = 25 * 1024 * 1024;
const allowedContentTypes = new Set([
  "application/pdf",
  "text/plain",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function safeFilename(value: string): string {
  return value
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
}

function documentSelection() {
  return {
    id: documentsTable.id,
    name: documentsTable.name,
    contentType: documentsTable.contentType,
    sizeBytes: documentsTable.sizeBytes,
    status: documentsTable.status,
    ownerId: documentsTable.ownerId,
    ownerName: usersTable.name,
    objectPath: documentsTable.objectPath,
    createdAt: documentsTable.createdAt,
    updatedAt: documentsTable.updatedAt,
    permissionCount: sql<number>`(
      select count(*)::int
      from ${documentPermissionsTable}
      where ${documentPermissionsTable.documentId} = ${documentsTable.id}
        and ${documentPermissionsTable.revokedAt} is null
    )`,
  };
}

async function findOwnedDocument(id: string, ownerId: string) {
  const [document] = await db
    .select(documentSelection())
    .from(documentsTable)
    .innerJoin(usersTable, eq(usersTable.id, documentsTable.ownerId))
    .where(and(eq(documentsTable.id, id), eq(documentsTable.ownerId, ownerId)))
    .limit(1);
  return document;
}

async function findAccessibleDocument(id: string, userId: string) {
  const [document] = await db
    .select(documentSelection())
    .from(documentsTable)
    .innerJoin(usersTable, eq(usersTable.id, documentsTable.ownerId))
    .where(eq(documentsTable.id, id))
    .limit(1);
  if (!document) return null;
  if (document.ownerId === userId) {
    return { document, accessLevel: "owner" as const };
  }

  const [permission] = await db
    .select({ accessLevel: documentPermissionsTable.accessLevel })
    .from(documentPermissionsTable)
    .where(
      and(
        eq(documentPermissionsTable.documentId, id),
        eq(documentPermissionsTable.userId, userId),
        isNull(documentPermissionsTable.revokedAt),
      ),
    )
    .limit(1);
  if (!permission) return { document, accessLevel: null };
  return { document, accessLevel: permission.accessLevel };
}

router.get("/documents", async (req, res): Promise<void> => {
  const parsed = ListDocumentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid document list filters" });
    return;
  }
  const { search, sort } = parsed.data;
  const conditions = [eq(documentsTable.ownerId, req.trustUser!.id)];
  if (search?.trim()) conditions.push(ilike(documentsTable.name, `%${search.trim()}%`));
  const orderBy =
    sort === "oldest"
      ? documentsTable.createdAt
      : sort === "name"
        ? documentsTable.name
        : desc(documentsTable.createdAt);
  const rows = await db
    .select(documentSelection())
    .from(documentsTable)
    .innerJoin(usersTable, eq(usersTable.id, documentsTable.ownerId))
    .where(and(...conditions))
    .orderBy(orderBy);

  res.json(ListDocumentsResponse.parse(rows));
});

router.get("/documents/shared-with-me", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      ...documentSelection(),
      accessLevel: documentPermissionsTable.accessLevel,
    })
    .from(documentPermissionsTable)
    .innerJoin(
      documentsTable,
      eq(documentsTable.id, documentPermissionsTable.documentId),
    )
    .innerJoin(usersTable, eq(usersTable.id, documentsTable.ownerId))
    .where(
      and(
        eq(documentPermissionsTable.userId, req.trustUser!.id),
        isNull(documentPermissionsTable.revokedAt),
        eq(documentsTable.status, "active"),
      ),
    )
    .orderBy(desc(documentsTable.createdAt));

  res.json(ListSharedDocumentsResponse.parse(rows));
});

router.post("/documents", async (req, res): Promise<void> => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid document metadata" });
    return;
  }

  const name = safeFilename(parsed.data.name);
  const contentType = parsed.data.contentType.toLowerCase();
  if (
    !name ||
    parsed.data.sizeBytes > maxFileSizeBytes ||
    !allowedContentTypes.has(contentType)
  ) {
    res.status(400).json({
      error: "Use a supported file type no larger than 25 MB",
    });
    return;
  }

  const uploadURL = await objectStorage.getObjectEntityUploadURL();
  const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
  const [created] = await db
    .insert(documentsTable)
    .values({
      ownerId: req.trustUser!.id,
      name,
      contentType,
      sizeBytes: parsed.data.sizeBytes,
      objectPath,
      status: "pending",
    })
    .returning();
  const document = await findOwnedDocument(created.id, req.trustUser!.id);
  if (!document) {
    res.status(500).json({ error: "Could not create document" });
    return;
  }

  res.status(201).json(
    CreateDocumentResponse.parse({
      document,
      uploadURL,
    }),
  );
});

router.post(
  "/documents/:id/complete",
  async (req, res): Promise<void> => {
    const params = CompleteDocumentUploadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }
    const body = CompleteDocumentUploadBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid upload completion request" });
      return;
    }

    const document = await findOwnedDocument(
      params.data.id,
      req.trustUser!.id,
    );
    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    if (document.status === "active") {
      res.json(CompleteDocumentUploadResponse.parse(document));
      return;
    }

    const [stored] = await db
      .select({ objectPath: documentsTable.objectPath })
      .from(documentsTable)
      .where(eq(documentsTable.id, document.id))
      .limit(1);
    if (!stored) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    let file;
    try {
      file = await objectStorage.getObjectEntityFile(stored.objectPath);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(400).json({ error: "The uploaded file was not found" });
        return;
      }
      throw error;
    }
    const [metadata] = await file.getMetadata();
    if (
      Number(metadata.size) !== document.sizeBytes ||
      metadata.contentType !== document.contentType
    ) {
      await file.delete({ ignoreNotFound: true });
      res.status(400).json({ error: "Uploaded file metadata did not match" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(documentsTable)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(documentsTable.id, document.id));
      await tx.insert(auditEventsTable).values({
        actorUserId: req.trustUser!.id,
        actorName: req.trustUser!.name,
        actorEmail: req.trustUser!.email,
        action: "document.uploaded",
        outcome: "success",
        documentId: document.id,
        documentName: document.name,
        context: "Private upload verified and activated",
      });
    });

    const active = await findOwnedDocument(document.id, req.trustUser!.id);
    res.json(CompleteDocumentUploadResponse.parse(active));
  },
);

router.get("/documents/:id", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }
  const result = await findAccessibleDocument(
    params.data.id,
    req.trustUser!.id,
  );
  if (!result) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (!result.accessLevel) {
    await appendAuditEvent({
      actor: req.trustUser!,
      action: "document.access_denied",
      outcome: "denied",
      documentId: result.document.id,
      documentName: result.document.name,
      context: "Document details requested without an active grant",
    });
    res.status(403).json({ error: "You do not have access to this document" });
    return;
  }
  res.json(GetDocumentResponse.parse(result.document));
});

router.get("/documents/:id/download", async (req, res): Promise<void> => {
  const params = DownloadDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }
  const result = await findAccessibleDocument(
    params.data.id,
    req.trustUser!.id,
  );
  if (!result) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (!result.accessLevel || result.document.status !== "active") {
    await appendAuditEvent({
      actor: req.trustUser!,
      action: "document.download_denied",
      outcome: "denied",
      documentId: result.document.id,
      documentName: result.document.name,
      context: "File requested without an active grant",
    });
    res.status(403).json({ error: "Download permission is required" });
    return;
  }

  try {
    const file = await objectStorage.getObjectEntityFile(
      result.document.objectPath,
    );
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", result.document.contentType);
    res.setHeader("Content-Length", String(metadata.size));
    const disposition =
      result.accessLevel === "view" ? "inline" : "attachment";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(result.document.name)}`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.once("finish", () => {
      void appendAuditEvent({
        actor: req.trustUser!,
        action:
          result.accessLevel === "view"
            ? "document.viewed"
            : "document.downloaded",
        documentId: result.document.id,
        documentName: result.document.name,
        context:
          result.accessLevel === "view"
            ? "Authorized inline private file stream completed"
            : "Authorized private file download completed",
      }).catch((error: unknown) =>
        req.log.error({ err: error }, "Could not record document download"),
      );
    });
    file.createReadStream().on("error", (error) => {
      req.log.error({ err: error, documentId: result.document.id }, "File stream failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "Unable to download document" });
      } else {
        res.destroy(error);
      }
    }).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Document file not found" });
      return;
    }
    throw error;
  }
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const params = DeleteDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }
  const document = await findOwnedDocument(params.data.id, req.trustUser!.id);
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  try {
    const file = await objectStorage.getObjectEntityFile(
      document.objectPath,
    );
    await file.delete({ ignoreNotFound: true });
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) throw error;
  }

  await db.transaction(async (tx) => {
    await tx.insert(auditEventsTable).values({
      actorUserId: req.trustUser!.id,
      actorName: req.trustUser!.name,
      actorEmail: req.trustUser!.email,
      action: "document.deleted",
      outcome: "success",
      documentId: document.id,
      documentName: document.name,
      context: "Owner deleted the private document",
    });
    await tx.delete(documentsTable).where(eq(documentsTable.id, document.id));
  });
  res.sendStatus(204);
});

export default router;
