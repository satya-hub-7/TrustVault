import { db, auditEventsTable, type User } from "@workspace/db";

export async function appendAuditEvent({
  actor,
  action,
  outcome = "success",
  documentId = null,
  documentName = null,
  context = null,
}: {
  actor: User;
  action: string;
  outcome?: "success" | "denied";
  documentId?: string | null;
  documentName?: string | null;
  context?: string | null;
}): Promise<void> {
  await db.insert(auditEventsTable).values({
    actorUserId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    action,
    outcome,
    documentId,
    documentName,
    context,
  });
}
