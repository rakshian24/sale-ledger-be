import { Request, Response } from "express";
import { z } from "zod";
import { FixedMonthlyExpense } from "../models/FixedMonthlyExpense.model";

const fixedExpenseSchema = z.object({
  shopRent: z.number().nonnegative().default(5000),
  shopkeeperSalary: z.number().nonnegative().default(10000),
  electricityBill: z.number().nonnegative().default(0),
});

const getUserId = (req: Request) => {
  if (!req.user?.id) {
    throw new Error("User not available in request");
  }

  return req.user.id;
};

const getMonthYearFromQuery = (req: Request) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (!month || !year) {
    throw new Error("month and year query params are required");
  }

  return { month, year };
};

export const getFixedMonthlyExpense = async (req: Request, res: Response) => {
  const userId = getUserId(req);

  try {
    const { month, year } = getMonthYearFromQuery(req);

    const fixedExpense = await FixedMonthlyExpense.findOne({
      userId,
      month,
      year,
    });

    if (!fixedExpense) {
      res.json({
        fixedExpense: {
          month,
          year,
          shopRent: 5000,
          shopkeeperSalary: 10000,
          electricityBill: 0,
          totalFixedExpense: 15000,
          isDefault: true,
        },
      });
      return;
    }

    res.json({
      fixedExpense,
    });
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Unable to get fixed monthly expense",
    });
  }
};

export const upsertFixedMonthlyExpense = async (
  req: Request,
  res: Response,
) => {
  const userId = getUserId(req);

  try {
    const { month, year } = getMonthYearFromQuery(req);
    const data = fixedExpenseSchema.parse(req.body);

    const totalFixedExpense =
      data.shopRent + data.shopkeeperSalary + data.electricityBill;

    const fixedExpense = await FixedMonthlyExpense.findOneAndUpdate(
      {
        userId,
        month,
        year,
      },
      {
        userId,
        month,
        year,
        ...data,
        totalFixedExpense,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    res.json({
      fixedExpense,
    });
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Unable to save fixed monthly expense",
    });
  }
};
