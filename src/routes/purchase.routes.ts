import { Router } from "express";
import {
  createPurchase,
  deletePurchase,
  getProductPurchaseHistory,
  getPurchases,
  getPurchaseSummary,
  updatePurchase,
} from "../controllers/purchase.controller";
import { protect } from "../middlewares/auth.middleware";
import { downloadPurchaseReportPdf } from "../controllers/purchaseReport.controller";

const router = Router();

router.use(protect);
router.get("/", getPurchases);
router.post("/", createPurchase);
router.get("/summary", getPurchaseSummary);
router.get("/report/pdf", downloadPurchaseReportPdf);
router.get("/products/:productId/history", getProductPurchaseHistory);
router.put("/:id", updatePurchase);
router.delete("/:id", deletePurchase);

export default router;
