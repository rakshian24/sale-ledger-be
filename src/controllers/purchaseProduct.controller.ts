import { Request, Response } from "express";
import { z } from "zod";
import { Purchase } from "../models/Purchase.model";
import { PurchaseCategory } from "../models/PurchaseCategory.model";
import { PurchaseProduct } from "../models/PurchaseProduct.model";

const productInput = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().min(1),
  defaultUnit: z.string().trim().min(1).max(30).default("kg"),
});

const getUserId = (req: Request) => {
  if (!req.user?.id) throw new Error("User not available in request");
  return req.user.id;
};

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const getPurchaseProducts = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const filter: Record<string, unknown> = { userId };
    if (req.query.categoryId) filter.categoryId = String(req.query.categoryId);
    const products = await PurchaseProduct.find(filter)
      .populate("categoryId", "name")
      .sort({ name: 1 })
      .lean();
    res.json({ products });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to get products") });
  }
};

export const createPurchaseProduct = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const data = productInput.parse(req.body);
    const category = await PurchaseCategory.findOne({
      _id: data.categoryId,
      userId,
    });
    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }
    const product = await PurchaseProduct.create({
      userId,
      categoryId: category._id,
      name: data.name,
      normalizedName: data.name.toLocaleLowerCase("en-IN"),
      defaultUnit: data.defaultUnit,
    });
    res.status(201).json({ product });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to create product") });
  }
};

export const updatePurchaseProduct = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const data = productInput.parse(req.body);
    const category = await PurchaseCategory.findOne({
      _id: data.categoryId,
      userId,
    });
    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }
    const product = await PurchaseProduct.findOneAndUpdate(
      { _id: req.params.id, userId },
      {
        name: data.name,
        normalizedName: data.name.toLocaleLowerCase("en-IN"),
        categoryId: category._id,
        defaultUnit: data.defaultUnit,
      },
      { new: true, runValidators: true },
    );
    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    res.json({ product });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to update product") });
  }
};

export const deletePurchaseProduct = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const product = await PurchaseProduct.findOne({
      _id: req.params.id,
      userId,
    });
    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    if (await Purchase.exists({ userId, productId: product._id })) {
      res.status(409).json({ message: "Product has purchase history and cannot be deleted" });
      return;
    }
    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to delete product") });
  }
};
