import { Router } from "express";
import {
  createPurchaseProduct,
  deletePurchaseProduct,
  getPurchaseProducts,
  updatePurchaseProduct,
} from "../controllers/purchaseProduct.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

router.use(protect);
router.get("/", getPurchaseProducts);
router.post("/", createPurchaseProduct);
router.put("/:id", updatePurchaseProduct);
router.delete("/:id", deletePurchaseProduct);

export default router;
