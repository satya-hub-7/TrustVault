import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      trustUser?: User;
    }
  }
}

export const requireTrustVaultUser: RequestHandler = async (
  req,
  res,
  next,
) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkId))
      .limit(1);

    if (!user) {
      const identity = await clerkClient.users.getUser(clerkId);
      const email =
        identity.emailAddresses.find(
          (address) => address.id === identity.primaryEmailAddressId,
        )?.emailAddress ?? identity.emailAddresses[0]?.emailAddress;
      if (!email) {
        res.status(403).json({ error: "A verified email is required" });
        return;
      }

      const name =
        [identity.firstName, identity.lastName]
          .filter((part): part is string => Boolean(part))
          .join(" ") ||
        email.split("@")[0] ||
        "TrustVault member";
      [user] = await db
        .insert(usersTable)
        .values({ clerkId, name, email: email.toLowerCase() })
        .onConflictDoUpdate({
          target: usersTable.clerkId,
          set: { name, email: email.toLowerCase(), updatedAt: new Date() },
        })
        .returning();
    }

    req.trustUser = user;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Could not resolve TrustVault user");
    next(error);
  }
};

export const requireTrustVaultAdmin: RequestHandler = (req, res, next) => {
  if (req.trustUser?.role !== "admin") {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
};
