import { Router } from "express";
import { createInventoryAdjustment, deleteInventoryAdjustment, getInventoryAnalytics } from "../controllers/inventory.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();
router.use(protect);
router.get("/", getInventoryAnalytics);
router.post("/adjustments", createInventoryAdjustment);
router.delete("/adjustments/:id", deleteInventoryAdjustment);
export default router;
