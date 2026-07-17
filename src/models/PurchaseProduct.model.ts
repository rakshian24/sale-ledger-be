import mongoose, { InferSchemaType } from "mongoose";

const purchaseProductSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseCategory",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: 120,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
    },
    defaultUnit: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 30,
      default: "kg",
    },
  },
  { timestamps: true },
);

purchaseProductSchema.index(
  { userId: 1, normalizedName: 1 },
  { unique: true },
);

purchaseProductSchema.pre("validate", function normalizeProductName(next) {
  this.name = this.name?.trim();
  this.normalizedName = this.name?.toLocaleLowerCase("en-IN");
  next();
});

export type PurchaseProductSchema = InferSchemaType<typeof purchaseProductSchema>;

export const PurchaseProduct = mongoose.model(
  "PurchaseProduct",
  purchaseProductSchema,
);
