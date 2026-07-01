import mongoose, { InferSchemaType } from "mongoose";

const fixedMonthlyExpenseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      min: 2020,
    },
    shopRent: {
      type: Number,
      required: true,
      default: 5000,
      min: 0,
    },
    shopkeeperSalary: {
      type: Number,
      required: true,
      default: 10000,
      min: 0,
    },
    electricityBill: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalFixedExpense: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

fixedMonthlyExpenseSchema.index(
  { userId: 1, month: 1, year: 1 },
  { unique: true },
);

fixedMonthlyExpenseSchema.pre("validate", function calculateFixedTotal(next) {
  this.shopRent = Number(this.shopRent) || 0;
  this.shopkeeperSalary = Number(this.shopkeeperSalary) || 0;
  this.electricityBill = Number(this.electricityBill) || 0;

  this.totalFixedExpense =
    this.shopRent + this.shopkeeperSalary + this.electricityBill;

  next();
});

export type FixedMonthlyExpenseSchema = InferSchemaType<
  typeof fixedMonthlyExpenseSchema
>;

export const FixedMonthlyExpense = mongoose.model(
  "FixedMonthlyExpense",
  fixedMonthlyExpenseSchema,
);
