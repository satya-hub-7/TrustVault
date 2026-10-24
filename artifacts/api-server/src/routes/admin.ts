import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import {
  ListUsersResponse,
  UpdateUserRoleBody,
  UpdateUserRoleParams,
  UpdateUserRoleResponse,
} from "@workspace/api-zod";
import { auditEventsTable, db, usersTable } from "@workspace/db";
import { requireTrustVaultAdmin } from "../middlewares/trustvault-auth";

const router: IRouter = Router();

router.use("/admin", requireTrustVaultAdmin);

router.get("/admin/users", async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(asc(usersTable.name));
  res.json(ListUsersResponse.parse(users));
});

router.patch("/admin/users/:id/role", async (req, res): Promise<void> => {
  const params = UpdateUserRoleParams.safeParse(req.params);
  const body = UpdateUserRoleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid role update" });
    return;
  }
  if (
    params.data.id === req.trustUser!.id &&
    body.data.role !== req.trustUser!.role
  ) {
    res.status(400).json({ error: "Administrators cannot change their own role" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ role: body.data.role, updatedAt: new Date() })
    .where(eq(usersTable.id, params.data.id))
    .returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.insert(auditEventsTable).values({
    actorUserId: req.trustUser!.id,
    actorName: req.trustUser!.name,
    actorEmail: req.trustUser!.email,
    action: "user.role_changed",
    outcome: "success",
    context: `Application role changed to ${body.data.role} for ${user.email}`,
  });
  res.json(UpdateUserRoleResponse.parse(user));
});

export default router;
