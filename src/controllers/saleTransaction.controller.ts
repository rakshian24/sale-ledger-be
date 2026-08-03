import { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { PurchaseCategory } from "../models/PurchaseCategory.model";
import { PurchaseProduct } from "../models/PurchaseProduct.model";
import { SaleTransaction } from "../models/SaleTransaction.model";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const money = (value: number) => Math.round(value * 100) / 100;

const saleItemInput = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1).max(30),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
});

const saleInput = z.object({
  saleDate: z.string().regex(datePattern, "Date must use YYYY-MM-DD format"),
  saleNumber: z.number().int().positive().optional(),
  items: z.array(saleItemInput).min(1).max(100),
  paymentMode: z.enum(["cash", "upi", "mixed", "credit"]),
  cashAmount: z.number().nonnegative().optional().default(0),
  upiAmount: z.number().nonnegative().optional().default(0),
  customerName: z.string().trim().max(120).optional().default(""),
  customerPhone: z.string().trim().max(20).optional().default(""),
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

const getNextSaleNumber = async (userId: string, saleDate: string) => {
  const latest = await SaleTransaction.findOne({ userId, saleDate })
    .sort({ saleNumber: -1 })
    .select("saleNumber")
    .lean();
  return (latest?.saleNumber ?? 0) + 1;
};

const buildSaleData = async (
  req: Request,
  options: { keepSaleNumber?: number } = {},
) => {
  const userId = getUserId(req);
  const data = saleInput.parse(req.body);
  const productIds = [...new Set(data.items.map((item) => item.productId))];
  const products = await PurchaseProduct.find({
    _id: { $in: productIds },
    userId,
  }).lean();

  if (products.length !== productIds.length) {
    throw new Error("One or more products were not found");
  }

  const categoryIds = [...new Set(products.map((product) => String(product.categoryId)))];
  const categories = await PurchaseCategory.find({
    _id: { $in: categoryIds },
    userId,
  }).lean();
  const categoryById = new Map(
    categories.map((category) => [String(category._id), category]),
  );
  const productById = new Map(
    products.map((product) => [String(product._id), product]),
  );

  const items = data.items.map((item) => {
    const product = productById.get(item.productId);
    if (!product) throw new Error("Product not found");
    const category = categoryById.get(String(product.categoryId));
    if (!category) throw new Error(`Category not found for ${product.name}`);
    const lineCost = money(item.quantity * item.costPrice);
    const lineTotal = money(item.quantity * item.sellingPrice);
    return {
      productId: product._id,
      productName: product.name,
      categoryId: category._id,
      categoryName: category.name,
      quantity: item.quantity,
      unit: item.unit,
      costPrice: money(item.costPrice),
      sellingPrice: money(item.sellingPrice),
      lineCost,
      lineTotal,
      lineProfit: money(lineTotal - lineCost),
    };
  });

  const totalCost = money(items.reduce((sum, item) => sum + item.lineCost, 0));
  const totalAmount = money(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const totalProfit = money(totalAmount - totalCost);
  let cashAmount = data.cashAmount;
  let upiAmount = data.upiAmount;

  if (data.paymentMode === "cash") {
    cashAmount = totalAmount;
    upiAmount = 0;
  } else if (data.paymentMode === "upi") {
    cashAmount = 0;
    upiAmount = totalAmount;
  } else if (data.paymentMode === "credit") {
    cashAmount = 0;
    upiAmount = 0;
  } else if (Math.abs(cashAmount + upiAmount - totalAmount) > 0.01) {
    throw new Error("Cash and UPI amounts must equal the sale total for mixed payment");
  }

  const saleNumber =
    options.keepSaleNumber ??
    data.saleNumber ??
    (await getNextSaleNumber(userId, data.saleDate));

  return {
    userId,
    saleDate: data.saleDate,
    saleNumber,
    items,
    paymentMode: data.paymentMode,
    cashAmount: money(cashAmount),
    upiAmount: money(upiAmount),
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    note: data.note,
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalCost,
    totalAmount,
    totalProfit,
  };
};

export const getSaleTransactions = async (req: Request, res: Response) => {
  try {
    const filter: Record<string, unknown> = { userId: getUserId(req) };
    const dateFilter = getDateFilter(req);
    if (dateFilter) filter.saleDate = dateFilter;
    const sales = await SaleTransaction.find(filter)
      .sort({ saleDate: -1, saleNumber: -1 })
      .lean();
    res.json({ sales });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to get sales") });
  }
};

export const getSaleTransactionSummary = async (req: Request, res: Response) => {
  try {
    const match: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(getUserId(req)),
    };
    const dateFilter = getDateFilter(req);
    if (dateFilter) match.saleDate = dateFilter;
    const [summary] = await SaleTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          saleCount: { $sum: 1 },
          itemCount: { $sum: "$itemCount" },
          totalQuantity: { $sum: "$totalQuantity" },
          totalCost: { $sum: "$totalCost" },
          totalRevenue: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$totalProfit" },
          cashCollected: { $sum: "$cashAmount" },
          upiCollected: { $sum: "$upiAmount" },
          creditSales: {
            $sum: { $cond: [{ $eq: ["$paymentMode", "credit"] }, "$totalAmount", 0] },
          },
        },
      },
    ]);
    res.json({
      summary: summary ?? {
        saleCount: 0,
        itemCount: 0,
        totalQuantity: 0,
        totalCost: 0,
        totalRevenue: 0,
        totalProfit: 0,
        cashCollected: 0,
        upiCollected: 0,
        creditSales: 0,
      },
    });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to get sales summary") });
  }
};

export const createSaleTransaction = async (req: Request, res: Response) => {
  try {
    const sale = await SaleTransaction.create(await buildSaleData(req));
    res.status(201).json({ sale });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to create sale") });
  }
};

export const updateSaleTransaction = async (req: Request, res: Response) => {
  try {
    const existing = await SaleTransaction.findOne({
      _id: req.params.id,
      userId: getUserId(req),
    });
    if (!existing) {
      res.status(404).json({ message: "Sale not found" });
      return;
    }
    const parsed = saleInput.parse(req.body);
    const keepSaleNumber =
      parsed.saleDate === existing.saleDate ? existing.saleNumber : undefined;
    const data = await buildSaleData(req, { keepSaleNumber });
    const sale = await SaleTransaction.findByIdAndUpdate(existing._id, data, {
      new: true,
      runValidators: true,
    });
    res.json({ sale });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to update sale") });
  }
};

export const deleteSaleTransaction = async (req: Request, res: Response) => {
  try {
    const sale = await SaleTransaction.findOneAndDelete({
      _id: req.params.id,
      userId: getUserId(req),
    });
    if (!sale) {
      res.status(404).json({ message: "Sale not found" });
      return;
    }
    res.json({ message: "Sale deleted" });
  } catch (error) {
    res.status(400).json({ message: message(error, "Unable to delete sale") });
  }
};
