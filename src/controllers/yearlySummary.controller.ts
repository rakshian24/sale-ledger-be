import mongoose from "mongoose";
import type { Request, Response } from "express";
import { Entry } from "../models/Entry.model";
import { FixedMonthlyExpense } from "../models/FixedMonthlyExpense.model";

type EntryMonthlyAggregation = {
  _id: number;
  entryCount: number;
  totalSales: number;
  totalCash: number;
  totalPhonePe: number;
  totalCollection: number;
  totalExpense: number;
  totalProfit: number;
};

type FixedExpenseRow = {
  month: number;
  year: number;
  shopRent: number;
  shopkeeperSalary: number;
  electricityBill: number;
  totalFixedExpense: number;
};

type YearlyMonthSummary = {
  month: number;
  monthName: string;
  hasEntries: boolean;
  entryCount: number;
  totalSales: number;
  totalCash: number;
  totalPhonePe: number;
  totalCollection: number;
  totalExpense: number;
  totalProfit: number;
  shopRent: number;
  shopkeeperSalary: number;
  electricityBill: number;
  totalFixedExpense: number;
  netProfit: number;
};

type YearlySummary = {
  totalSales: number;
  totalCash: number;
  totalPhonePe: number;
  totalCollection: number;
  totalExpense: number;
  totalProfit: number;
  totalFixedExpense: number;
  netProfit: number;
};

const DEFAULT_FIXED_EXPENSE = {
  shopRent: 5000,
  shopkeeperSalary: 10000,
  electricityBill: 0,
};

const getUserId = (req: Request) => {
  if (!req.user?.id) {
    throw new Error("User not available in request");
  }

  return req.user.id;
};

const getYearRange = (year: number) => {
  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year + 1, 0, 1));

  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
};

const getMonthName = (month: number) => {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
  }).format(new Date(Date.UTC(2026, month - 1, 1)));
};

const createEmptySummary = (): YearlySummary => ({
  totalSales: 0,
  totalCash: 0,
  totalPhonePe: 0,
  totalCollection: 0,
  totalExpense: 0,
  totalProfit: 0,
  totalFixedExpense: 0,
  netProfit: 0,
});

const buildYearlyRows = (
  entryRows: EntryMonthlyAggregation[],
  fixedExpenseRows: FixedExpenseRow[],
): YearlyMonthSummary[] => {
  const entryMap = new Map<number, EntryMonthlyAggregation>(
    entryRows.map((row) => [Number(row._id), row]),
  );

  const fixedExpenseMap = new Map<number, FixedExpenseRow>(
    fixedExpenseRows.map((row) => [Number(row.month), row]),
  );

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;

    const entryRow = entryMap.get(month);
    const fixedExpenseRow = fixedExpenseMap.get(month);

    const entryCount = entryRow?.entryCount ?? 0;
    const hasEntries = entryCount > 0;

    /*
     * Months without daily entries are returned with hasEntries=false.
     * Your EntryTable already hides months without entries.
     */
    if (!hasEntries) {
      return {
        month,
        monthName: getMonthName(month),
        hasEntries: false,
        entryCount: 0,
        totalSales: 0,
        totalCash: 0,
        totalPhonePe: 0,
        totalCollection: 0,
        totalExpense: 0,
        totalProfit: 0,
        shopRent: 0,
        shopkeeperSalary: 0,
        electricityBill: 0,
        totalFixedExpense: 0,
        netProfit: 0,
      };
    }

    /*
     * Use the saved fixed-expense values for this specific month.
     * When no record exists, use the application's defaults.
     */
    const shopRent =
      fixedExpenseRow?.shopRent ?? DEFAULT_FIXED_EXPENSE.shopRent;

    const shopkeeperSalary =
      fixedExpenseRow?.shopkeeperSalary ??
      DEFAULT_FIXED_EXPENSE.shopkeeperSalary;

    const electricityBill =
      fixedExpenseRow?.electricityBill ?? DEFAULT_FIXED_EXPENSE.electricityBill;

    /*
     * Calculate the total from the individual values so that a stale
     * totalFixedExpense stored in the database cannot cause an error.
     */
    const totalFixedExpense = shopRent + shopkeeperSalary + electricityBill;

    const totalProfit = entryRow?.totalProfit ?? 0;
    const netProfit = totalProfit - totalFixedExpense;

    return {
      month,
      monthName: getMonthName(month),
      hasEntries: true,
      entryCount,
      totalSales: entryRow?.totalSales ?? 0,
      totalCash: entryRow?.totalCash ?? 0,
      totalPhonePe: entryRow?.totalPhonePe ?? 0,
      totalCollection: entryRow?.totalCollection ?? 0,
      totalExpense: entryRow?.totalExpense ?? 0,
      totalProfit,
      shopRent,
      shopkeeperSalary,
      electricityBill,
      totalFixedExpense,
      netProfit,
    };
  });
};

const calculateYearlySummary = (
  months: YearlyMonthSummary[],
): YearlySummary => {
  return months.reduce((summary, month) => {
    if (!month.hasEntries) {
      return summary;
    }

    summary.totalSales += month.totalSales;
    summary.totalCash += month.totalCash;
    summary.totalPhonePe += month.totalPhonePe;
    summary.totalCollection += month.totalCollection;
    summary.totalExpense += month.totalExpense;
    summary.totalProfit += month.totalProfit;
    summary.totalFixedExpense += month.totalFixedExpense;
    summary.netProfit += month.netProfit;

    return summary;
  }, createEmptySummary());
};

export const getYearlySummary = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const year = Number(req.query.year);

    if (!Number.isInteger(year) || year < 2020) {
      res.status(400).json({
        message: "A valid year query param is required",
      });
      return;
    }

    const objectUserId = new mongoose.Types.ObjectId(userId);
    const { start, end } = getYearRange(year);

    /*
     * Fetch entry totals and all fixed-expense documents for the selected
     * year in parallel.
     */
    const [entryRows, fixedExpenseRows] = await Promise.all([
      Entry.aggregate<EntryMonthlyAggregation>([
        {
          $match: {
            userId: objectUserId,
            date: {
              $gte: start,
              $lt: end,
            },
          },
        },
        {
          $project: {
            month: {
              $toInt: {
                $substr: ["$date", 5, 2],
              },
            },
            salesCount: 1,
            cash: 1,
            phonePe: 1,
            total: 1,
            expense: 1,
            profit: 1,
          },
        },
        {
          $group: {
            _id: "$month",
            entryCount: {
              $sum: 1,
            },
            totalSales: {
              $sum: "$salesCount",
            },
            totalCash: {
              $sum: "$cash",
            },
            totalPhonePe: {
              $sum: "$phonePe",
            },
            totalCollection: {
              $sum: "$total",
            },
            totalExpense: {
              $sum: "$expense",
            },
            totalProfit: {
              $sum: "$profit",
            },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]),

      FixedMonthlyExpense.find({
        userId: objectUserId,
        year,
      })
        .select({
          _id: 0,
          month: 1,
          year: 1,
          shopRent: 1,
          shopkeeperSalary: 1,
          electricityBill: 1,
          totalFixedExpense: 1,
        })
        .lean<FixedExpenseRow[]>(),
    ]);

    const months = buildYearlyRows(entryRows, fixedExpenseRows);
    const summary = calculateYearlySummary(months);

    res.json({
      year,
      summary,
      months,
    });
  } catch (error) {
    res.status(500).json({
      message:
        error instanceof Error ? error.message : "Unable to get yearly summary",
    });
  }
};
