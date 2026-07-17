import mongoose from "mongoose";
import { Request, Response } from "express";
import { z } from "zod";
import { Purchase } from "../models/Purchase.model";
import { PurchaseProduct } from "../models/PurchaseProduct.model";
import { PurchaseCategory } from "../models/PurchaseCategory.model";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const purchaseInput = z.object({
  purchaseDate: z.string().regex(datePattern, "Date must use YYYY-MM-DD format"),
  productId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1).max(30),
  unitPrice: z.number().nonnegative(),
  supplier: z.string().trim().max(120).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
});

const rangeInput = z
  .object({
    from: z.string().regex(datePattern).optional(),
    to: z.string().regex(datePattern).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must be before or equal to to",
  });

const getUserId = (req: Request) => {
  if (!req.user?.id) throw new Error("User not available in request");
  return req.user.id;
};

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const getDateFilter = (req: Request) => {
  const range = rangeInput.parse({ from: req.query.from, to: req.query.to });
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { $gte: range.from } : {}),
    ...(range.to ? { $lte: range.to } : {}),
  };
};

const buildPurchaseData = async (req: Request) => {
  const userId = getUserId(req);
  const data = purchaseInput.parse(req.body);
  const product = await PurchaseProduct.findOne({
    _id: data.productId,
    userId,
  });
  if (!product) throw new Error("Product not found");
  const category = await PurchaseCategory.findOne({
    _id: product.categoryId,
    userId,
  });
  if (!category) throw new Error("Product category not found");
  return {
    userId,
    purchaseDate: data.purchaseDate,
    productId: product._id,
    categoryId: category._id,
    productName: product.name,
    categoryName: category.name,
    quantity: data.quantity,
    unit: data.unit,
    unitPrice: data.unitPrice,
    totalAmount: data.quantity * data.unitPrice,
    supplier: data.supplier,
    note: data.note,
  };
};

export const getPurchases = async (req: Request, res: Response) => {
  try {
    const filter: Record<string, unknown> = { userId: getUserId(req) };
    const dateFilter = getDateFilter(req);
    if (dateFilter) filter.purchaseDate = dateFilter;
    if (req.query.productId) filter.productId = String(req.query.productId);
    if (req.query.categoryId) filter.categoryId = String(req.query.categoryId);
    const purchases = await Purchase.find(filter)
      .sort({ purchaseDate: -1, createdAt: -1 })
      .lean();
    res.json({ purchases });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to get purchases") });
  }
};

export const createPurchase = async (req: Request, res: Response) => {
  try {
    const purchase = await Purchase.create(await buildPurchaseData(req));
    res.status(201).json({ purchase });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to create purchase") });
  }
};

export const updatePurchase = async (req: Request, res: Response) => {
  try {
    const data = await buildPurchaseData(req);
    const purchase = await Purchase.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      data,
      { new: true, runValidators: true },
    );
    if (!purchase) {
      res.status(404).json({ message: "Purchase not found" });
      return;
    }
    res.json({ purchase });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to update purchase") });
  }
};

export const deletePurchase = async (req: Request, res: Response) => {
  try {
    const purchase = await Purchase.findOneAndDelete({
      _id: req.params.id,
      userId: getUserId(req),
    });
    if (!purchase) {
      res.status(404).json({ message: "Purchase not found" });
      return;
    }
    res.json({ message: "Purchase deleted" });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to delete purchase") });
  }
};

export const getPurchaseSummary = async (req: Request, res: Response) => {
  try {
    const match: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(getUserId(req)),
    };
    const dateFilter = getDateFilter(req);
    if (dateFilter) match.purchaseDate = dateFilter;
    const [result] = await Purchase.aggregate([
      { $match: match },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalSpent: { $sum: "$totalAmount" },
                purchaseCount: { $sum: 1 },
                totalQuantity: { $sum: "$quantity" },
              },
            },
          ],
          dailyTotals: [
            { $group: { _id: "$purchaseDate", totalSpent: { $sum: "$totalAmount" } } },
            { $sort: { _id: 1 } },
          ],
          categoryTotals: [
            {
              $group: {
                _id: "$categoryId",
                categoryName: { $first: "$categoryName" },
                totalSpent: { $sum: "$totalAmount" },
                purchaseCount: { $sum: 1 },
              },
            },
            { $sort: { totalSpent: -1 } },
          ],
        },
      },
    ]);
    res.json({
      summary: result?.totals[0] ?? {
        totalSpent: 0,
        purchaseCount: 0,
        totalQuantity: 0,
      },
      dailyTotals: result?.dailyTotals ?? [],
      categoryTotals: result?.categoryTotals ?? [],
    });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to get purchase summary") });
  }
};

export const getProductPurchaseHistory = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const product = await PurchaseProduct.findOne({
      _id: req.params.productId,
      userId,
    }).lean();
    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    const filter: Record<string, unknown> = {
      userId,
      productId: product._id,
    };
    const dateFilter = getDateFilter(req);
    if (dateFilter) filter.purchaseDate = dateFilter;
    const purchases = await Purchase.find(filter)
      .sort({ purchaseDate: 1, createdAt: 1 })
      .lean();
    const totalSpent = purchases.reduce((sum, row) => sum + row.totalAmount, 0);
    const totalQuantity = purchases.reduce((sum, row) => sum + row.quantity, 0);
    const prices = purchases.map((row) => row.unitPrice);
    res.json({
      product,
      summary: {
        totalSpent,
        totalQuantity,
        purchaseCount: purchases.length,
        averageUnitPrice: totalQuantity ? totalSpent / totalQuantity : 0,
        lowestUnitPrice: prices.length ? Math.min(...prices) : 0,
        highestUnitPrice: prices.length ? Math.max(...prices) : 0,
      },
      priceHistory: purchases,
    });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to get product history") });
  }
};
