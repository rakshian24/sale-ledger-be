import { Router } from "express";
import {
  createSaleTransaction,
  deleteSaleTransaction,
  getSaleTransactionSummary,
  getSaleTransactions,
  updateSaleTransaction,
} from "../controllers/saleTransaction.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

router.use(protect);
router.get("/", getSaleTransactions);
router.get("/summary", getSaleTransactionSummary);
router.post("/", createSaleTransaction);
router.put("/:id", updateSaleTransaction);
router.delete("/:id", deleteSaleTransaction);

export default router;
