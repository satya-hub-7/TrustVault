import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  ListDocumentPermissionsResponse,
  RevokeDocumentPermissionParams,
  ShareDocumentBody,
  ShareDocumentParams,
  ShareDocumentResponse,
} from "@workspace/api-zod";
import {
  auditEventsTable,
  db,
  documentPermissionsTable,
  documentsTable,
  usersTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/documents/permissions", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: documentPermissionsTable.id,
      documentId: documentsTable.id,
      documentName: documentsTable.name,
      userId: usersTable.id,
      userName: usersTable.name,
      email: usersTable.email,
      accessLevel: documentPermissionsTable.accessLevel,
      createdAt: documentPermissionsTable.createdAt,
    })
    .from(documentPermissionsTable)
    .innerJoin(
      documentsTable,
      eq(documentsTable.id, documentPermissionsTable.documentId),
    )
    .innerJoin(usersTable, eq(usersTable.id, documentPermissionsTable.userId))
    .where(
      and(
        eq(documentsTable.ownerId, req.trustUser!.id),
        isNull(documentPermissionsTable.revokedAt),
      ),
    )
    .orderBy(desc(documentPermissionsTable.createdAt));
  res.json(ListDocumentPermissionsResponse.parse(rows));
});

router.post("/documents/:id/share", async (req, res): Promise<void> => {
  const params = ShareDocumentParams.safeParse(req.params);
  const body = ShareDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid sharing request" });
    return;
  }

  const [document] = await db
    .select({
      id: documentsTable.id,
      name: documentsTable.name,
      ownerId: documentsTable.ownerId,
      status: documentsTable.status,
    })
    .from(documentsTable)
    .where(eq(documentsTable.id, params.data.id))
    .limit(1);
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (document.ownerId !== req.trustUser!.id) {
    res.status(403).json({ error: "Only the document owner can share it" });
    return;
  }
  if (document.status !== "active") {
    res.status(400).json({ error: "Upload must finish before sharing" });
    return;
  }

  const email = body.data.email.trim().toLowerCase();
  const [recipient] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (!recipient) {
    res.status(404).json({ error: "A registered TrustVault user is required" });
    return;
  }
  if (recipient.id === req.trustUser!.id) {
    res.status(400).json({ error: "You already own this document" });
    return;
  }

  const [existing] = await db
    .select({ id: documentPermissionsTable.id })
    .from(documentPermissionsTable)
    .where(
      and(
        eq(documentPermissionsTable.documentId, document.id),
        eq(documentPermissionsTable.userId, recipient.id),
        isNull(documentPermissionsTable.revokedAt),
      ),
    )
    .limit(1);

  let permissionId: string;
  await db.transaction(async (tx) => {
    if (existing) {
      const [updated] = await tx
        .update(documentPermissionsTable)
        .set({ accessLevel: body.data.accessLevel })
        .where(eq(documentPermissionsTable.id, existing.id))
        .returning({ id: documentPermissionsTable.id });
      permissionId = updated.id;
    } else {
      const [created] = await tx
        .insert(documentPermissionsTable)
        .values({
          documentId: document.id,
          userId: recipient.id,
          accessLevel: body.data.accessLevel,
        })
        .returning({ id: documentPermissionsTable.id });
      permissionId = created.id;
    }
    await tx.insert(auditEventsTable).values({
      actorUserId: req.trustUser!.id,
      actorName: req.trustUser!.name,
      actorEmail: req.trustUser!.email,
      action: existing ? "permission.updated" : "permission.granted",
      outcome: "success",
      documentId: document.id,
      documentName: document.name,
      context: `${body.data.accessLevel} access granted to ${email}`,
    });
  });

  const [result] = await db
    .select({
      id: documentPermissionsTable.id,
      documentId: documentsTable.id,
      documentName: documentsTable.name,
      userId: usersTable.id,
      userName: usersTable.name,
      email: usersTable.email,
      accessLevel: documentPermissionsTable.accessLevel,
      createdAt: documentPermissionsTable.createdAt,
    })
    .from(documentPermissionsTable)
    .innerJoin(
      documentsTable,
      eq(documentsTable.id, documentPermissionsTable.documentId),
    )
    .innerJoin(usersTable, eq(usersTable.id, documentPermissionsTable.userId))
    .where(eq(documentPermissionsTable.id, permissionId!))
    .limit(1);
  res.status(201).json(ShareDocumentResponse.parse(result));
});

router.delete(
  "/documents/permissions/:permissionId",
  async (req, res): Promise<void> => {
    const params = RevokeDocumentPermissionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid permission id" });
      return;
    }
    const [permission] = await db
      .select({
        id: documentPermissionsTable.id,
        documentId: documentsTable.id,
        documentName: documentsTable.name,
      })
      .from(documentPermissionsTable)
      .innerJoin(
        documentsTable,
        eq(documentsTable.id, documentPermissionsTable.documentId),
      )
      .where(
        and(
          eq(documentPermissionsTable.id, params.data.permissionId),
          eq(documentsTable.ownerId, req.trustUser!.id),
          isNull(documentPermissionsTable.revokedAt),
        ),
      )
      .limit(1);
    if (!permission) {
      res.status(404).json({ error: "Permission not found" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(documentPermissionsTable)
        .set({ revokedAt: new Date() })
        .where(eq(documentPermissionsTable.id, permission.id));
      await tx.insert(auditEventsTable).values({
        actorUserId: req.trustUser!.id,
        actorName: req.trustUser!.name,
        actorEmail: req.trustUser!.email,
        action: "permission.revoked",
        outcome: "success",
        documentId: permission.documentId,
        documentName: permission.documentName,
        context: "Document access revoked by owner",
      });
    });

    res.sendStatus(204);
  },
);

export default router;
