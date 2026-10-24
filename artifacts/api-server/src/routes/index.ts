import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trustVaultRouter from "./trustvault";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trustVaultRouter);

export default router;
