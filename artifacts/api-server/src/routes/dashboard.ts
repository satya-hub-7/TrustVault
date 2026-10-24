import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  GetDashboardSummaryResponse,
  ListAuditEventsQueryParams,
  ListAuditEventsResponse,
} from "@workspace/api-zod";
import {
  auditEventsTable,
  db,
  documentPermissionsTable,
  documentsTable,
} from "@workspace/db";

const router: IRouter = Router();

function visibleAuditWhere(user: Express.Request["trustUser"], search?: string) {
  const visibility =
    user?.role === "admin"
      ? undefined
      : or(
          eq(auditEventsTable.actorUserId, user!.id),
          inArray(
            auditEventsTable.documentId,
            db
              .select({ id: documentsTable.id })
              .from(documentsTable)
              .where(eq(documentsTable.ownerId, user!.id)),
          ),
        );
  const searchFilter = search?.trim()
    ? or(
        ilike(auditEventsTable.action, `%${search.trim()}%`),
        ilike(auditEventsTable.actorName, `%${search.trim()}%`),
        ilike(auditEventsTable.actorEmail, `%${search.trim()}%`),
        ilike(auditEventsTable.documentName, `%${search.trim()}%`),
        ilike(auditEventsTable.context, `%${search.trim()}%`),
      )
    : undefined;
  return and(visibility, searchFilter);
}

async function recentAuditEvents(user: Express.Request["trustUser"], limit: number) {
  const rows = await db
    .select({
      id: auditEventsTable.id,
      action: auditEventsTable.action,
      actorName: auditEventsTable.actorName,
      actorEmail: auditEventsTable.actorEmail,
      documentId: auditEventsTable.documentId,
      documentName: auditEventsTable.documentName,
      outcome: auditEventsTable.outcome,
      context: auditEventsTable.context,
      createdAt: auditEventsTable.createdAt,
    })
    .from(auditEventsTable)
    .where(visibleAuditWhere(user))
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(limit);
  return ListAuditEventsResponse.parse(rows);
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const userId = req.trustUser!.id;
  const [owned] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(documentsTable)
    .where(eq(documentsTable.ownerId, userId));
  const [shared] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(documentPermissionsTable)
    .innerJoin(
      documentsTable,
      eq(documentsTable.id, documentPermissionsTable.documentId),
    )
    .where(
      and(
        eq(documentPermissionsTable.userId, userId),
        eq(documentsTable.status, "active"),
        sql`${documentPermissionsTable.revokedAt} is null`,
      ),
    );
  const [permissions] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(documentPermissionsTable)
    .innerJoin(
      documentsTable,
      eq(documentsTable.id, documentPermissionsTable.documentId),
    )
    .where(
      and(
        eq(documentsTable.ownerId, userId),
        sql`${documentPermissionsTable.revokedAt} is null`,
      ),
    );
  res.json(
    GetDashboardSummaryResponse.parse({
      ownedDocuments: owned?.value ?? 0,
      sharedWithMe: shared?.value ?? 0,
      activePermissions: permissions?.value ?? 0,
      recentEvents: await recentAuditEvents(req.trustUser, 5),
    }),
  );
});

router.get("/audit", async (req, res): Promise<void> => {
  const parsed = ListAuditEventsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid audit filters" });
    return;
  }
  const rows = await db
    .select({
      id: auditEventsTable.id,
      action: auditEventsTable.action,
      actorName: auditEventsTable.actorName,
      actorEmail: auditEventsTable.actorEmail,
      documentId: auditEventsTable.documentId,
      documentName: auditEventsTable.documentName,
      outcome: auditEventsTable.outcome,
      context: auditEventsTable.context,
      createdAt: auditEventsTable.createdAt,
    })
    .from(auditEventsTable)
    .where(visibleAuditWhere(req.trustUser, parsed.data.search))
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(parsed.data.limit);
  res.json(ListAuditEventsResponse.parse(rows));
});

export default router;
