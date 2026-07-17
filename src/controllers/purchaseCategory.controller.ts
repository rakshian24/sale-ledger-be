import { Request, Response } from "express";
import { z } from "zod";
import { Purchase } from "../models/Purchase.model";
import { PurchaseCategory } from "../models/PurchaseCategory.model";
import { PurchaseProduct } from "../models/PurchaseProduct.model";

const categoryInput = z.object({
  name: z.string().trim().min(1).max(80),
});

const getUserId = (req: Request) => {
  if (!req.user?.id) throw new Error("User not available in request");
  return req.user.id;
};

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const getPurchaseCategories = async (req: Request, res: Response) => {
  try {
    const categories = await PurchaseCategory.find({ userId: getUserId(req) })
      .sort({ name: 1 })
      .lean();
    res.json({ categories });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to get categories") });
  }
};

export const createPurchaseCategory = async (req: Request, res: Response) => {
  try {
    const data = categoryInput.parse(req.body);
    const category = await PurchaseCategory.create({
      userId: getUserId(req),
      name: data.name,
      normalizedName: data.name.toLocaleLowerCase("en-IN"),
    });
    res.status(201).json({ category });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to create category") });
  }
};

export const updatePurchaseCategory = async (req: Request, res: Response) => {
  try {
    const data = categoryInput.parse(req.body);
    const category = await PurchaseCategory.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      { name: data.name, normalizedName: data.name.toLocaleLowerCase("en-IN") },
      { new: true, runValidators: true },
    );
    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }
    res.json({ category });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to update category") });
  }
};

export const deletePurchaseCategory = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const category = await PurchaseCategory.findOne({
      _id: req.params.id,
      userId,
    });
    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }
    const [productCount, purchaseCount] = await Promise.all([
      PurchaseProduct.countDocuments({ userId, categoryId: category._id }),
      Purchase.countDocuments({ userId, categoryId: category._id }),
    ]);
    if (productCount || purchaseCount) {
      res.status(409).json({
        message: "Category is in use and cannot be deleted",
      });
      return;
    }
    await category.deleteOne();
    res.json({ message: "Category deleted" });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to delete category") });
  }
};
