import mongoose, { InferSchemaType } from "mongoose";

const inventoryAdjustmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseProduct", required: true, index: true },
    adjustmentDate: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format"],
      index: true,
    },
    quantity: { type: Number, required: true },
    baseUnit: { type: String, required: true, trim: true, lowercase: true },
    reason: {
      type: String,
      required: true,
      enum: ["opening_stock", "correction", "spoilage", "personal_use", "return"],
    },
    note: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true },
);

inventoryAdjustmentSchema.index({ userId: 1, productId: 1, adjustmentDate: 1 });

export type InventoryAdjustmentSchema = InferSchemaType<typeof inventoryAdjustmentSchema>;
export const InventoryAdjustment = mongoose.model("InventoryAdjustment", inventoryAdjustmentSchema);
