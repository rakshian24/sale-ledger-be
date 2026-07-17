import mongoose, { InferSchemaType } from "mongoose";

const purchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    purchaseDate: {
      type: String,
      required: [true, "Purchase date is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format"],
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseProduct",
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseCategory",
      required: true,
      index: true,
    },
    productName: { type: String, required: true, trim: true },
    categoryName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0.001 },
    unit: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 30,
    },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    supplier: { type: String, trim: true, maxlength: 120, default: "" },
    note: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true },
);

purchaseSchema.index({ userId: 1, purchaseDate: 1 });
purchaseSchema.index({ userId: 1, productId: 1, purchaseDate: 1 });
purchaseSchema.index({ userId: 1, categoryId: 1, purchaseDate: 1 });

purchaseSchema.pre("validate", function calculatePurchaseTotal(next) {
  this.quantity = Number(this.quantity);
  this.unitPrice = Number(this.unitPrice);
  this.totalAmount = Math.round(this.quantity * this.unitPrice * 100) / 100;
  next();
});

export type PurchaseSchema = InferSchemaType<typeof purchaseSchema>;

export const Purchase = mongoose.model("Purchase", purchaseSchema);
