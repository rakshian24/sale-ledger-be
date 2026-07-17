import { Router } from "express";
import {
  createPurchaseCategory,
  deletePurchaseCategory,
  getPurchaseCategories,
  updatePurchaseCategory,
} from "../controllers/purchaseCategory.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

router.use(protect);
router.get("/", getPurchaseCategories);
router.post("/", createPurchaseCategory);
router.put("/:id", updatePurchaseCategory);
router.delete("/:id", deletePurchaseCategory);

export default router;
