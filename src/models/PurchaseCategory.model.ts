import mongoose, { InferSchemaType } from "mongoose";

const purchaseCategorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      maxlength: 80,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

purchaseCategorySchema.index(
  { userId: 1, normalizedName: 1 },
  { unique: true },
);

purchaseCategorySchema.pre("validate", function normalizeCategoryName(next) {
  this.name = this.name?.trim();
  this.normalizedName = this.name?.toLocaleLowerCase("en-IN");
  next();
});

export type PurchaseCategorySchema = InferSchemaType<
  typeof purchaseCategorySchema
>;

export const PurchaseCategory = mongoose.model(
  "PurchaseCategory",
  purchaseCategorySchema,
);
