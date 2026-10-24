import { Router, type IRouter } from "express";
import { requireTrustVaultUser } from "../middlewares/trustvault-auth";
import accountRouter from "./account";
import adminRouter from "./admin";
import dashboardRouter from "./dashboard";
import documentsRouter from "./documents";
import permissionsRouter from "./permissions";

const router: IRouter = Router();

router.use(requireTrustVaultUser);
router.use(accountRouter);
router.use(dashboardRouter);
router.use(documentsRouter);
router.use(permissionsRouter);
router.use(adminRouter);

export default router;
