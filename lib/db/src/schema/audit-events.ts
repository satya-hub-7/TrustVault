import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";
import { usersTable } from "./users";

export const auditOutcomeEnum = pgEnum("audit_outcome", [
  "success",
  "denied",
]);

export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    actorName: varchar("actor_name", { length: 255 }).notNull(),
    actorEmail: varchar("actor_email", { length: 320 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    documentId: uuid("document_id").references(() => documentsTable.id, {
      onDelete: "set null",
    }),
    documentName: varchar("document_name", { length: 255 }),
    outcome: auditOutcomeEnum("outcome").notNull(),
    context: text("context"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_document_created_idx").on(table.documentId, table.createdAt),
  ],
);

export type AuditEvent = typeof auditEventsTable.$inferSelect;
export type NewAuditEvent = typeof auditEventsTable.$inferInsert;
