import { Router } from "express";
import {
  createEntry,
  deleteEntry,
  downloadMonthlyEntriesPdf,
  getEntries,
  getEntryById,
  getMonthlySummary,
  getYearlySummary,
  updateEntry,
} from "../controllers/entry.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

router.use(protect);

router.get("/", getEntries);
router.post("/", createEntry);
router.get("/summary/monthly", getMonthlySummary);
router.get("/summary/yearly", getYearlySummary);
router.get("/report/pdf", downloadMonthlyEntriesPdf);
router.get("/:id", getEntryById);
router.put("/:id", updateEntry);
router.delete("/:id", deleteEntry);

export default router;
