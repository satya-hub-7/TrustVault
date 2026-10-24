import { Router, type IRouter } from "express";
import { GetCurrentUserResponse } from "@workspace/api-zod";
import { appendAuditEvent } from "../lib/audit";

const router: IRouter = Router();

router.get("/auth/user", async (req, res): Promise<void> => {
  const user = req.trustUser!;
  await appendAuditEvent({
    actor: user,
    action: "auth.session_verified",
    context: "Authenticated application session verified",
  });

  res.json(
    GetCurrentUserResponse.parse({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }),
  );
});

export default router;
