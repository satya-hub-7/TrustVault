import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";
import { usersTable } from "./users";

export const documentAccessLevelEnum = pgEnum("document_access_level", [
  "view",
  "download",
]);

export const documentPermissionsTable = pgTable(
  "document_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    accessLevel: documentAccessLevelEnum("access_level").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("permissions_document_idx").on(table.documentId, table.revokedAt),
    index("permissions_user_idx").on(table.userId, table.revokedAt),
    uniqueIndex("permissions_active_unique")
      .on(table.documentId, table.userId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

export type DocumentPermission = typeof documentPermissionsTable.$inferSelect;
export type NewDocumentPermission =
  typeof documentPermissionsTable.$inferInsert;
