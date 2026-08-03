import mongoose, { InferSchemaType } from "mongoose";

const saleItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseProduct",
      required: true,
    },
    productName: { type: String, required: true, trim: true, maxlength: 120 },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseCategory",
      required: true,
    },
    categoryName: { type: String, required: true, trim: true, maxlength: 120 },
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, required: true, trim: true, lowercase: true, maxlength: 30 },
    costPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    lineCost: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    lineProfit: { type: Number, required: true },
  },
  { _id: true },
);

const saleTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    saleDate: {
      type: String,
      required: [true, "Sale date is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format"],
      index: true,
    },
    saleNumber: { type: Number, required: true, min: 1 },
    items: {
      type: [saleItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "At least one sale item is required",
      },
    },
    paymentMode: {
      type: String,
      required: true,
      enum: ["cash", "upi", "mixed", "credit"],
    },
    cashAmount: { type: Number, required: true, min: 0, default: 0 },
    upiAmount: { type: Number, required: true, min: 0, default: 0 },
    customerName: { type: String, trim: true, maxlength: 120, default: "" },
    customerPhone: { type: String, trim: true, maxlength: 20, default: "" },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    itemCount: { type: Number, required: true, min: 1 },
    totalQuantity: { type: Number, required: true, min: 0.001 },
    totalCost: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    totalProfit: { type: Number, required: true },
  },
  { timestamps: true },
);

saleTransactionSchema.index(
  { userId: 1, saleDate: 1, saleNumber: 1 },
  { unique: true },
);
saleTransactionSchema.index({ userId: 1, saleDate: -1, createdAt: -1 });
saleTransactionSchema.index({ userId: 1, "items.productId": 1, saleDate: 1 });

export type SaleTransactionSchema = InferSchemaType<
  typeof saleTransactionSchema
>;

export const SaleTransaction = mongoose.model(
  "SaleTransaction",
  saleTransactionSchema,
);
