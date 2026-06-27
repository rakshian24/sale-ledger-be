import mongoose, { InferSchemaType } from "mongoose";

const entrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: [true, "Date is required"],
      index: true,
    },
    salesCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    cash: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    phonePe: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      default: 0,
    },
    expense: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    profit: {
      type: Number,
      required: true,
      default: 0,
    },
    isHoliday: {
      type: Boolean,
      default: false,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

entrySchema.index({ userId: 1, date: 1 }, { unique: true });

entrySchema.pre("validate", function calculateTotals(next) {
  this.salesCount = Number(this.salesCount) || 0;
  this.cash = Number(this.cash) || 0;
  this.phonePe = Number(this.phonePe) || 0;
  this.expense = Number(this.expense) || 0;

  if (this.isHoliday) {
    this.salesCount = 0;
    this.cash = 0;
    this.phonePe = 0;
    this.expense = 0;
  }

  this.total = this.cash + this.phonePe;
  this.profit = this.total - this.expense;

  next();
});

export type EntrySchema = InferSchemaType<typeof entrySchema>;

export const Entry = mongoose.model("Entry", entrySchema);
