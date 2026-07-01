// routes/fixedMonthlyExpense.routes.ts
import express from "express";
import {
  getFixedMonthlyExpense,
  upsertFixedMonthlyExpense,
} from "../controllers/fixedMonthlyExpense.controller";
import { protect } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/", protect, getFixedMonthlyExpense);
router.put("/", protect, upsertFixedMonthlyExpense);

export default router;
