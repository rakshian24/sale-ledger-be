import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import mongoose from "mongoose";
import { z } from "zod";
import { Purchase } from "../models/Purchase.model";
import { getDairyLitres } from "../utils/dairy";

const queryInput = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  categoryId: z.string().optional(),
  months: z
    .string()
    .regex(/^(?:[1-9]|1[0-2])(?:,(?:[1-9]|1[0-2]))*$/)
    .optional(),
  fields: z
    .string()
    .regex(
      /^(?:quantity|averagePrice|cost)(?:,(?:quantity|averagePrice|cost))*$/,
    )
    .optional(),
});

type MonthlyValue = { quantity: number; cost: number; averagePrice: number };
export type MonthlyPurchaseRow = {
  categoryId: string;
  categoryName: string;
  productId: string;
  productName: string;
  unit: string;
  months: Record<string, MonthlyValue>;
  totalQuantity: number;
  totalCost: number;
};

const getUserId = (req: Request) => {
  if (!req.user?.id) throw new Error("User not available in request");
  return req.user.id;
};

const readQuery = (req: Request) => {
  const query = queryInput.parse(req.query);
  if (query.categoryId && !mongoose.isValidObjectId(query.categoryId)) {
    throw new Error("Invalid category");
  }
  return {
    ...query,
    months: query.months
      ? [...new Set(query.months.split(",").map(Number))].sort((a, b) => a - b)
      : undefined,
    fields: query.fields
      ? ([...new Set(query.fields.split(","))] as Array<
          "quantity" | "averagePrice" | "cost"
        >)
      : undefined,
  };
};

export const buildMonthlyPurchaseReport = async (
  userId: string,
  year: number,
  categoryId?: string,
) => {
  const match: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(userId),
    purchaseDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
  };
  if (categoryId) match.categoryId = new mongoose.Types.ObjectId(categoryId);

  const [groups, availableYears] = await Promise.all([
    Purchase.aggregate<{
      _id: {
        categoryId: mongoose.Types.ObjectId;
        productId: mongoose.Types.ObjectId;
        unit: string;
        month: string;
      };
      categoryName: string;
      productName: string;
      quantity: number;
      cost: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: {
            categoryId: "$categoryId",
            productId: "$productId",
            unit: "$unit",
            month: { $substrBytes: ["$purchaseDate", 5, 2] },
          },
          categoryName: { $first: "$categoryName" },
          productName: { $first: "$productName" },
          quantity: { $sum: "$quantity" },
          cost: { $sum: "$totalAmount" },
        },
      },
      {
        $sort: {
          categoryName: 1,
          productName: 1,
          "_id.unit": 1,
          "_id.month": 1,
        },
      },
    ]),
    Purchase.aggregate<{ _id: string }>([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: { $substrBytes: ["$purchaseDate", 0, 4] } } },
      { $sort: { _id: -1 } },
    ]),
  ]);

  const rowsByKey = new Map<string, MonthlyPurchaseRow>();
  for (const group of groups) {
    const key = `${group._id.productId}-${group._id.unit}`;
    const row = rowsByKey.get(key) ?? {
      categoryId: String(group._id.categoryId),
      categoryName: group.categoryName,
      productId: String(group._id.productId),
      productName: group.productName,
      unit: group._id.unit,
      months: {},
      totalQuantity: 0,
      totalCost: 0,
    };
    row.months[group._id.month] = {
      quantity: group.quantity,
      cost: group.cost,
      averagePrice: group.quantity ? group.cost / group.quantity : 0,
    };
    row.totalQuantity += group.quantity;
    row.totalCost += group.cost;
    rowsByKey.set(key, row);
  }

  return {
    year,
    availableYears: availableYears.map((item) => Number(item._id)),
    rows: [...rowsByKey.values()],
  };
};

export const getMonthlyPurchaseReport = async (req: Request, res: Response) => {
  try {
    const query = readQuery(req);
    res.json(
      await buildMonthlyPurchaseReport(
        getUserId(req),
        query.year,
        query.categoryId,
      ),
    );
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Unable to get monthly purchase report",
    });
  }
};

const money = (value: number) =>
  `Rs. ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value: number) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const LITRE_DISPLAY_PRODUCTS = new Set([
  "milk 500ml",
  "curd 500ml",
  "curd 200ml",
]);
const quantity = (row: MonthlyPurchaseRow, value: number) => {
  const normalizedProduct = row.productName.trim().toLocaleLowerCase("en-IN");
  const litres = LITRE_DISPLAY_PRODUCTS.has(normalizedProduct)
    ? getDairyLitres(row.categoryName, row.productName, value, row.unit)
    : null;
  const originalQuantity = `${number(value)} ${row.unit}`;
  return litres === null
    ? originalQuantity
    : `${originalQuantity}\n${number(litres)} L`;
};
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const downloadMonthlyPurchaseReportPdf = async (
  req: Request,
  res: Response,
) => {
  try {
    const query = readQuery(req);
    const report = await buildMonthlyPurchaseReport(
      getUserId(req),
      query.year,
      query.categoryId,
    );
    if (!report.rows.length) {
      res
        .status(404)
        .json({ message: "No purchases found for the selected year" });
      return;
    }

    const latestDataMonth = Math.max(
      0,
      ...report.rows.flatMap((row) => Object.keys(row.months).map(Number)),
    );
    const monthLimit =
      query.year === new Date().getFullYear()
        ? Math.max(new Date().getMonth() + 1, latestDataMonth)
        : 12;
    const months =
      query.months?.map((month) => month - 1) ??
      Array.from({ length: monthLimit }, (_, index) => index);
    const fields = query.fields ?? ["quantity", "averagePrice", "cost"];
    const widths = [
      92,
      105,
      ...Array(months.length * fields.length).fill(51),
      82,
      82,
    ];
    const tableWidth = widths.reduce((total, width) => total + width, 0);
    const pageWidth = tableWidth + 56;
    const pageHeight = 595.28;
    const contentBottom = pageHeight - 48;
    const doc = new PDFDocument({
      size: [pageWidth, pageHeight],
      margin: 28,
      bufferPages: true,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="monthly-purchase-report-${query.year}.pdf"`,
    );
    doc.pipe(res);

    const headers = [
      "Category",
      "Product",
      ...months.flatMap((month) =>
        fields.map(
          (field) =>
            `${MONTHS[month]} ${field === "quantity" ? "Qty" : field === "averagePrice" ? "Avg" : "Cost"}`,
        ),
      ),
      "Total Qty",
      "Total Cost",
    ];
    const selectedTotalCost = (row: MonthlyPurchaseRow) =>
      months.reduce(
        (total, month) =>
          total + (row.months[String(month + 1).padStart(2, "0")]?.cost ?? 0),
        0,
      );
    const selectedTotalQuantity = (row: MonthlyPurchaseRow) =>
      months.reduce(
        (total, month) =>
          total +
          (row.months[String(month + 1).padStart(2, "0")]?.quantity ?? 0),
        0,
      );

    const drawPageHeader = () => {
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#111827")
        .text(`Monthly Purchase Report - ${query.year}`, 28, 24);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#64748b")
        .text(
          `Months: ${months.map((month) => MONTHS[month]).join(", ")} | Average price = total cost / total quantity`,
          28,
          48,
        );
      const headerY = 70;
      doc.rect(28, headerY, tableWidth, 30).fill("#111827");
      let headerX = 28;
      headers.forEach((header, index) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(7)
          .fillColor("#ffffff")
          .text(header, headerX + 3, headerY + 10, {
            width: widths[index] - 6,
            height: 10,
            lineBreak: false,
            align: index >= 2 ? "right" : "left",
          });
        headerX += widths[index];
      });
      return headerY + 30;
    };

    let y = drawPageHeader();
    for (const [rowIndex, row] of [...report.rows]
      .sort(
        (a, b) =>
          selectedTotalCost(b) - selectedTotalCost(a) ||
          a.productName.localeCompare(b.productName),
      )
      .entries()) {
      const cells = [
        row.categoryName,
        row.productName,
        ...months.flatMap((month) => {
          const value = row.months[String(month + 1).padStart(2, "0")];
          return fields.map((field) => {
            if (!value) return "-";
            if (field === "quantity") return quantity(row, value.quantity);
            if (field === "averagePrice")
              return `${money(value.averagePrice)}/${row.unit}`;
            return money(value.cost);
          });
        }),
        quantity(row, selectedTotalQuantity(row)),
        money(selectedTotalCost(row)),
      ];
      if (y + 28 > contentBottom) {
        doc.addPage({ size: [pageWidth, pageHeight], margin: 28 });
        y = drawPageHeader();
      }
      doc
        .rect(28, y, tableWidth, 28)
        .fill(rowIndex % 2 === 0 ? "#f8fafc" : "#ffffff");
      let x = 28;
      cells.forEach((cell, index) => {
        const lines = cell.split("\n");
        const font = index >= cells.length - 2 ? "Helvetica-Bold" : "Helvetica";
        doc
          .font(font)
          .fontSize(6.8)
          .fillColor("#1f2937")
          .text(lines[0], x + 3, y + (lines.length > 1 ? 5 : 9), {
            width: widths[index] - 6,
            height: 9,
            lineBreak: false,
            align: index >= 2 ? "right" : "left",
            ellipsis: true,
          });
        if (lines[1]) {
          doc
            .font("Helvetica-Bold")
            .fontSize(8)
            .fillColor("#16a34a")
            .text(lines[1], x + 3, y + 14, {
              width: widths[index] - 6,
              height: 10,
              lineBreak: false,
              align: index >= 2 ? "right" : "left",
              ellipsis: true,
            });
        }
        x += widths[index];
      });
      y += 28;
    }
    const pageRange = doc.bufferedPageRange();
    for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#64748b")
        .text(
          `All selected columns shown together | Page ${pageIndex + 1} of ${pageRange.count}`,
          28,
          pageHeight - 40,
          { width: pageWidth - 56, align: "right", lineBreak: false },
        );
    }
    doc.end();
  } catch (error) {
    if (!res.headersSent)
      res.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Unable to create monthly purchase report",
      });
  }
};
