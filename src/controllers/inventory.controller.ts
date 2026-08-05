import { Request, Response } from "express";
import { z } from "zod";
import { InventoryAdjustment } from "../models/InventoryAdjustment.model";
import { Purchase } from "../models/Purchase.model";
import { PurchaseProduct } from "../models/PurchaseProduct.model";
import { SaleTransaction } from "../models/SaleTransaction.model";
import {
  getRetailUnit,
  getUnitsPerPurchaseUnit,
  quantityToRetailUnits,
} from "../utils/productUnits";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const rangeInput = z
  .object({
    from: z.string().regex(datePattern).optional(),
    to: z.string().regex(datePattern).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must be before or equal to to",
  });
const adjustmentInput = z.object({
  productId: z.string().min(1),
  adjustmentDate: z.string().regex(datePattern),
  quantity: z.number().positive(),
  direction: z.enum(["add", "remove"]),
  reason: z.enum([
    "opening_stock",
    "correction",
    "spoilage",
    "personal_use",
    "return",
  ]),
  note: z.string().trim().max(500).optional().default(""),
});

const getUserId = (req: Request) => {
  if (!req.user?.id) throw new Error("User not available in request");
  return req.user.id;
};
const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const getInventoryAnalytics = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const range = rangeInput.parse({ from: req.query.from, to: req.query.to });
    const inventoryDate = range.to || "9999-12-31";
    const products = await PurchaseProduct.find({ userId })
      .populate("categoryId", "name")
      .sort({ name: 1 })
      .lean();
    const [purchases, allSales, adjustments] = await Promise.all([
      Purchase.find({ userId, purchaseDate: { $lte: inventoryDate } })
        .sort({ purchaseDate: 1, createdAt: 1 })
        .lean(),
      SaleTransaction.find({ userId, saleDate: { $lte: inventoryDate } })
        .sort({ saleDate: 1, saleNumber: 1 })
        .lean(),
      InventoryAdjustment.find({
        userId,
        adjustmentDate: { $lte: inventoryDate },
      })
        .sort({ adjustmentDate: 1 })
        .lean(),
    ]);
    const productById = new Map(
      products.map((product) => [String(product._id), product]),
    );
    const inventory = new Map<
      string,
      {
        productId: string;
        productName: string;
        categoryName: string;
        baseUnit: string;
        purchasedQuantity: number;
        soldQuantity: number;
        adjustedQuantity: number;
        remainingQuantity: number;
        latestCostPerUnit: number;
        inventoryValue: number;
      }
    >();

    for (const product of products) {
      const category = product.categoryId as unknown as { name?: string };
      inventory.set(String(product._id), {
        productId: String(product._id),
        productName: product.name,
        categoryName: category?.name || "Uncategorized",
        baseUnit: getRetailUnit(product),
        purchasedQuantity: 0,
        soldQuantity: 0,
        adjustedQuantity: 0,
        remainingQuantity: 0,
        latestCostPerUnit: 0,
        inventoryValue: 0,
      });
    }

    for (const purchase of purchases) {
      const id = String(purchase.productId);
      const product = productById.get(id);
      const row = inventory.get(id);
      if (!product || !row) continue;
      row.purchasedQuantity += quantityToRetailUnits(
        purchase.quantity,
        purchase.unit,
        product,
      );
      const conversion = quantityToRetailUnits(1, purchase.unit, product);
      row.latestCostPerUnit = conversion
        ? purchase.unitPrice / conversion
        : purchase.unitPrice;
    }
    for (const sale of allSales) {
      for (const item of sale.items) {
        const id = String(item.productId);
        const product = productById.get(id);
        const row = inventory.get(id);
        if (!product || !row) continue;
        row.soldQuantity += quantityToRetailUnits(
          item.quantity,
          item.unit,
          product,
        );
      }
    }
    for (const adjustment of adjustments) {
      const row = inventory.get(String(adjustment.productId));
      if (row) row.adjustedQuantity += adjustment.quantity;
    }
    for (const row of inventory.values()) {
      row.remainingQuantity =
        row.purchasedQuantity + row.adjustedQuantity - row.soldQuantity;
      row.inventoryValue =
        Math.round(row.remainingQuantity * row.latestCostPerUnit * 100) / 100;
    }

    const periodSales = allSales.filter(
      (sale) =>
        (!range.from || sale.saleDate >= range.from) &&
        (!range.to || sale.saleDate <= range.to),
    );
    const productSales = new Map<
      string,
      {
        productId: string;
        productName: string;
        categoryName: string;
        baseUnit: string;
        quantitySold: number;
        revenue: number;
        cost: number;
        profit: number;
        saleCount: number;
      }
    >();
    for (const sale of periodSales) {
      for (const item of sale.items) {
        const id = String(item.productId);
        const product = productById.get(id);
        const category = product?.categoryId as unknown as
          | { name?: string }
          | undefined;
        const existing = productSales.get(id) || {
          productId: id,
          productName: item.productName,
          categoryName: category?.name || item.categoryName || "Uncategorized",
          baseUnit: product ? getRetailUnit(product) : item.unit,
          quantitySold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          saleCount: 0,
        };
        existing.quantitySold += product
          ? quantityToRetailUnits(item.quantity, item.unit, product)
          : item.quantity;
        existing.revenue += item.lineTotal;
        existing.cost += item.lineCost;
        existing.profit += item.lineProfit;
        existing.saleCount += 1;
        productSales.set(id, existing);
      }
    }
    const productSalesRows = [...productSales.values()].sort(
      (a, b) => b.quantitySold - a.quantitySold,
    );
    const mostProfitableSale =
      [...periodSales].sort((a, b) => b.totalProfit - a.totalProfit)[0] || null;
    res.json({
      summary: {
        saleCount: periodSales.length,
        revenue: periodSales.reduce((sum, sale) => sum + sale.totalAmount, 0),
        cost: periodSales.reduce((sum, sale) => sum + sale.totalCost, 0),
        profit: periodSales.reduce((sum, sale) => sum + sale.totalProfit, 0),
        inventoryValue: [...inventory.values()].reduce(
          (sum, row) => sum + row.inventoryValue,
          0,
        ),
        topSellingProduct: productSalesRows[0] || null,
        mostProfitableSale: mostProfitableSale
          ? {
              _id: mostProfitableSale._id,
              saleDate: mostProfitableSale.saleDate,
              saleNumber: mostProfitableSale.saleNumber,
              customerName: mostProfitableSale.customerName,
              totalAmount: mostProfitableSale.totalAmount,
              totalProfit: mostProfitableSale.totalProfit,
            }
          : null,
      },
      inventory: [...inventory.values()].sort(
        (a, b) => a.remainingQuantity - b.remainingQuantity,
      ),
      productSales: productSalesRows,
      adjustments,
    });
  } catch (error) {
    res
      .status(400)
      .json({ message: message(error, "Unable to get inventory analytics") });
  }
};

export const createInventoryAdjustment = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = getUserId(req);
    const data = adjustmentInput.parse(req.body);
    const product = await PurchaseProduct.findOne({
      _id: data.productId,
      userId,
    });
    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    const adjustment = await InventoryAdjustment.create({
      userId,
      productId: product._id,
      adjustmentDate: data.adjustmentDate,
      quantity: data.direction === "add" ? data.quantity : -data.quantity,
      baseUnit: getRetailUnit(product),
      reason: data.reason,
      note: data.note,
    });
    res.status(201).json({ adjustment });
  } catch (error) {
    res
      .status(400)
      .json({ message: message(error, "Unable to adjust inventory") });
  }
};

export const deleteInventoryAdjustment = async (
  req: Request,
  res: Response,
) => {
  try {
    const adjustment = await InventoryAdjustment.findOneAndDelete({
      _id: req.params.id,
      userId: getUserId(req),
    });
    if (!adjustment) {
      res.status(404).json({ message: "Adjustment not found" });
      return;
    }
    res.json({ message: "Adjustment deleted" });
  } catch (error) {
    res
      .status(400)
      .json({ message: message(error, "Unable to delete adjustment") });
  }
};
