import { Router } from "express";
import {
  createEntry,
  deleteEntry,
  downloadMonthlyEntriesPdf,
  downloadYearlyEntriesPdf,
  getEntries,
  getEntryById,
  getMonthlySummary,
  updateEntry,
} from "../controllers/entry.controller";
import { getYearlySummary } from "../controllers/yearlySummary.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

router.use(protect);

router.get("/", getEntries);
router.post("/", createEntry);

router.get("/summary/monthly", getMonthlySummary);
router.get("/summary/yearly", getYearlySummary);

router.get("/report/pdf", downloadMonthlyEntriesPdf);
router.get("/report/yearly", downloadYearlyEntriesPdf);

/*
 * Keep dynamic ID routes below all named routes.
 */
router.get("/:id", getEntryById);
router.put("/:id", updateEntry);
router.delete("/:id", deleteEntry);

export default router;
