import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import { Request, Response } from "express";
import { z } from "zod";
import { Entry } from "../models/Entry.model";

type SummaryTotals = {
  totalSales: number;
  totalCash: number;
  totalPhonePe: number;
  totalCollection: number;
  totalExpense: number;
  totalProfit: number;
};

type YearlyMonthSummary = SummaryTotals & {
  month: number;
  monthName: string;
};

type AverageEntry = {
  salesCount?: number;
  cash?: number;
  phonePe?: number;
  total?: number;
  expense?: number;
  profit?: number;
  isHoliday?: boolean;
};

type AverageTotals = {
  salesCount: number;
  cash: number;
  phonePe: number;
  total: number;
  expense: number;
  profit: number;
};

type MonthlyAveragesForPdf = AverageTotals & {
  workingDaysCount: number;
};

const entrySchema = z.object({
  date: z.string().min(1, "Date is required"),
  salesCount: z.number().int().nonnegative().default(0),
  cash: z.number().nonnegative().default(0),
  phonePe: z.number().nonnegative().default(0),
  expense: z.number().nonnegative().default(0),
  isHoliday: z.boolean().default(false),
  note: z.string().optional().default(""),
});

const updateEntrySchema = entrySchema.partial().extend({
  date: z.string().min(1, "Date is required").optional(),
});

const getUserId = (req: Request) => {
  if (!req.user?.id) {
    throw new Error("User not available in request");
  }

  return req.user.id;
};

const getMonthRange = (month: number, year: number) => {
  const monthIndex = month - 1;

  const startDate = new Date(Date.UTC(year, monthIndex, 1));
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 1));

  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  return { start, end };
};

const getMonthName = (month: number) => {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
  }).format(new Date(Date.UTC(2026, month - 1, 1)));
};

const formatDateForPdf = (date: string) => {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
};

const formatMoneyForPdf = (value: number) => {
  return `Rs. ${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)}`;
};

const getAverageForPdf = (total: number, count: number) => {
  if (count === 0) {
    return 0;
  }

  return Math.round(total / count);
};

const calculateMonthlyAveragesForPdf = (
  entries: AverageEntry[],
): MonthlyAveragesForPdf => {
  const workingEntries = entries.filter((entry) => !entry.isHoliday);
  const workingDaysCount = workingEntries.length;

  const totals = workingEntries.reduce<AverageTotals>(
    (acc, entry) => {
      acc.salesCount += entry.salesCount ?? 0;
      acc.cash += entry.cash ?? 0;
      acc.phonePe += entry.phonePe ?? 0;
      acc.total += entry.total ?? 0;
      acc.expense += entry.expense ?? 0;
      acc.profit += entry.profit ?? 0;

      return acc;
    },
    {
      salesCount: 0,
      cash: 0,
      phonePe: 0,
      total: 0,
      expense: 0,
      profit: 0,
    },
  );

  return {
    workingDaysCount,
    salesCount: getAverageForPdf(totals.salesCount, workingDaysCount),
    cash: getAverageForPdf(totals.cash, workingDaysCount),
    phonePe: getAverageForPdf(totals.phonePe, workingDaysCount),
    total: getAverageForPdf(totals.total, workingDaysCount),
    expense: getAverageForPdf(totals.expense, workingDaysCount),
    profit: getAverageForPdf(totals.profit, workingDaysCount),
  };
};

const drawTableRow = (
  doc: PDFKit.PDFDocument,
  y: number,
  row: string[],
  options?: {
    bold?: boolean;
    fillColor?: string;
    textColor?: string;
  },
) => {
  const startX = 40;

  const columnWidths = [76, 44, 78, 78, 78, 78, 78, 110];

  let currentX = startX;

  if (options?.fillColor) {
    doc
      .rect(
        startX,
        y - 6,
        columnWidths.reduce((sum, width) => sum + width, 0),
        26,
      )
      .fill(options.fillColor);
  }

  doc
    .fillColor(options?.textColor || "#111827")
    .font(options?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(8);

  row.forEach((cell, index) => {
    doc.text(cell, currentX + 4, y, {
      width: columnWidths[index] - 8,
      align: index === 0 || index === 7 ? "left" : "right",
      lineBreak: false,
    });

    currentX += columnWidths[index];
  });

  doc
    .moveTo(startX, y + 20)
    .lineTo(
      startX + columnWidths.reduce((sum, width) => sum + width, 0),
      y + 20,
    )
    .strokeColor("#e5e7eb")
    .lineWidth(0.5)
    .stroke();
};

const drawAverageSection = (
  doc: PDFKit.PDFDocument,
  y: number,
  averages: {
    workingDaysCount: number;
    salesCount: number;
    cash: number;
    phonePe: number;
    total: number;
    expense: number;
    profit: number;
  },
) => {
  const startX = 40;
  const sectionWidth = doc.page.width - 80;

  const sectionPadding = 10;
  const gap = 8;

  const headingHeight = 38;
  const cardHeight = 38;

  const sectionHeight =
    sectionPadding +
    headingHeight +
    gap +
    cardHeight +
    gap +
    cardHeight +
    sectionPadding;

  const innerWidth = sectionWidth - sectionPadding * 2;
  const cardWidth = (innerWidth - gap * 2) / 3;

  doc
    .roundedRect(startX, y, sectionWidth, sectionHeight, 10)
    .fillAndStroke("#f8fbff", "#bfdbfe");

  // Title row
  doc
    .roundedRect(
      startX + sectionPadding,
      y + sectionPadding,
      innerWidth,
      headingHeight,
      8,
    )
    .fill("#eff6ff");

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#16a34a")
    .text(
      "Daily Averages",
      startX + sectionPadding + 10,
      y + sectionPadding + 8,
      {
        width: innerWidth - 20,
        lineBreak: false,
      },
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor("#64748b")
    .text(
      `Based on ${averages.workingDaysCount} working days`,
      startX + sectionPadding + 10,
      y + sectionPadding + 22,
      {
        width: innerWidth - 20,
        lineBreak: false,
      },
    );

  const averageItems = [
    ["Avg Sales", String(averages.salesCount)],
    ["Avg Cash", formatMoneyForPdf(averages.cash)],
    ["Avg PhonePe", formatMoneyForPdf(averages.phonePe)],
    ["Avg Total", formatMoneyForPdf(averages.total)],
    ["Avg Expense", formatMoneyForPdf(averages.expense)],
    ["Avg Profit", formatMoneyForPdf(averages.profit)],
  ] as const;

  const firstCardRowY = y + sectionPadding + headingHeight + gap;
  const secondCardRowY = firstCardRowY + cardHeight + gap;

  averageItems.forEach(([label, value], index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;

    const x = startX + sectionPadding + column * (cardWidth + gap);
    const cardY = row === 0 ? firstCardRowY : secondCardRowY;

    doc
      .roundedRect(x, cardY, cardWidth, cardHeight, 8)
      .fillAndStroke("#ffffff", "#e2e8f0");

    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#475569")
      .text(label, x + 8, cardY + 8, {
        width: cardWidth - 16,
        align: "center",
        lineBreak: false,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(
        label === "Avg Profit" && averages.profit < 0
          ? "#dc2626"
          : label === "Avg Profit"
            ? "#16a34a"
            : "#111827",
      )
      .text(value, x + 8, cardY + 21, {
        width: cardWidth - 16,
        align: "center",
        lineBreak: false,
      });
  });

  return y + sectionHeight + 22;
};

const drawPdfFooter = (doc: PDFKit.PDFDocument) => {
  const pageCount = doc.bufferedPageRange().count;

  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748b")
      .text(
        `Generated by Sale Ledger • Page ${i + 1} of ${pageCount}`,
        40,
        doc.page.height - 35,
        {
          align: "center",
          width: doc.page.width - 80,
        },
      );
  }
};

export const createEntry = async (req: Request, res: Response) => {
  const data = entrySchema.parse(req.body);
  const userId = getUserId(req);

  const entry = await Entry.create({
    ...data,
    userId,
  });

  res.status(201).json({
    entry,
  });
};

export const getEntries = async (req: Request, res: Response) => {
  const userId = getUserId(req);

  const month = req.query.month ? Number(req.query.month) : undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;

  const filter: Record<string, unknown> = {
    userId,
  };

  if (month && year) {
    const { start, end } = getMonthRange(month, year);

    filter.date = {
      $gte: start,
      $lt: end,
    };
  }

  const entries = await Entry.find(filter).sort({ date: 1 });

  res.json({
    entries,
  });
};

export const getEntryById = async (req: Request, res: Response) => {
  const userId = getUserId(req);

  const entry = await Entry.findOne({
    _id: req.params.id,
    userId,
  });

  if (!entry) {
    res.status(404).json({
      message: "Entry not found",
    });
    return;
  }

  res.json({
    entry,
  });
};

export const updateEntry = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const data = updateEntrySchema.parse(req.body);

  const entry = await Entry.findOne({
    _id: req.params.id,
    userId,
  });

  if (!entry) {
    res.status(404).json({
      message: "Entry not found",
    });
    return;
  }

  Object.assign(entry, data);

  await entry.save();

  res.json({
    entry,
  });
};

export const deleteEntry = async (req: Request, res: Response) => {
  const userId = getUserId(req);

  const entry = await Entry.findOneAndDelete({
    _id: req.params.id,
    userId,
  });

  if (!entry) {
    res.status(404).json({
      message: "Entry not found",
    });
    return;
  }

  res.json({
    message: "Entry deleted successfully",
  });
};

export const getMonthlySummary = async (req: Request, res: Response) => {
  const userId = getUserId(req);

  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (!month || !year) {
    res.status(400).json({
      message: "month and year query params are required",
    });
    return;
  }

  const { start, end } = getMonthRange(month, year);

  const [summary] = await Entry.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        date: {
          $gte: start,
          $lt: end,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: "$salesCount" },
        totalCash: { $sum: "$cash" },
        totalPhonePe: { $sum: "$phonePe" },
        totalCollection: { $sum: "$total" },
        totalExpense: { $sum: "$expense" },
        totalProfit: { $sum: "$profit" },
      },
    },
  ]);

  res.json({
    month,
    year,
    totalSales: summary?.totalSales ?? 0,
    totalCash: summary?.totalCash ?? 0,
    totalPhonePe: summary?.totalPhonePe ?? 0,
    totalCollection: summary?.totalCollection ?? 0,
    totalExpense: summary?.totalExpense ?? 0,
    totalProfit: summary?.totalProfit ?? 0,
  });
};

export const downloadMonthlyEntriesPdf = async (
  req: Request,
  res: Response,
) => {
  const userId = getUserId(req);

  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (!month || !year) {
    res.status(400).json({
      message: "month and year query params are required",
    });
    return;
  }

  const { start, end } = getMonthRange(month, year);

  const entries = await Entry.find({
    userId,
    date: {
      $gte: start,
      $lt: end,
    },
  }).sort({ date: 1 });

  if (entries.length === 0) {
    res.status(404).json({
      message: "No entries found for the selected month and year",
    });
    return;
  }

  const totals = entries.reduce(
    (acc, entry) => {
      acc.salesCount += entry.salesCount ?? 0;
      acc.cash += entry.cash ?? 0;
      acc.phonePe += entry.phonePe ?? 0;
      acc.total += entry.total ?? 0;
      acc.expense += entry.expense ?? 0;
      acc.profit += entry.profit ?? 0;

      return acc;
    },
    {
      salesCount: 0,
      cash: 0,
      phonePe: 0,
      total: 0,
      expense: 0,
      profit: 0,
    },
  );

  const averages = calculateMonthlyAveragesForPdf(entries);

  const monthName = getMonthName(month);
  const fileName = `sale-ledger-${monthName}-${year}-report.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
  });

  doc.pipe(res);

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#111827")
    .text(`Sale Ledger Monthly Report`, {
      align: "center",
    });

  doc
    .moveDown(0.3)
    .font("Helvetica")
    .fontSize(14)
    .fillColor("#475569")
    .text(`${monthName} ${year}`, {
      align: "center",
    });

  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Summary");

  doc.moveDown(0.5);

  const summaryY = doc.y;

  const summaryItems = [
    ["Total Sales", String(totals.salesCount)],
    ["Total Cash", formatMoneyForPdf(totals.cash)],
    ["Total PhonePe", formatMoneyForPdf(totals.phonePe)],
    ["Total Collection", formatMoneyForPdf(totals.total)],
    ["Total Expense", formatMoneyForPdf(totals.expense)],
    ["Total Profit", formatMoneyForPdf(totals.profit)],
  ];

  summaryItems.forEach((item, index) => {
    const x = 40 + (index % 3) * 170;
    const y = summaryY + Math.floor(index / 3) * 44;

    doc.roundedRect(x, y, 155, 34, 8).fillAndStroke("#f8fafc", "#e2e8f0");

    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#64748b")
      .text(item[0], x + 10, y + 6, {
        width: 135,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(
        item[0] === "Total Profit" && totals.profit < 0 ? "#dc2626" : "#111827",
      )
      .text(item[1], x + 10, y + 18, {
        width: 135,
      });
  });

  doc.y = summaryY + 96;

  doc.x = 42;

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text("Sales Report");

  doc.moveDown(0.6);

  let y = doc.y;

  y = drawAverageSection(doc, y, averages);

  const headers = [
    "Date",
    "Sales",
    "Cash",
    "PhonePe",
    "Total",
    "Expense",
    "Profit",
    "Note",
  ];

  drawTableRow(doc, y, headers, {
    bold: true,
    fillColor: "#f1f5f9",
    textColor: "#334155",
  });

  y += 24;

  entries.forEach((entry) => {
    if (y > 740) {
      doc.addPage();
      y = 50;

      drawTableRow(doc, y, headers, {
        bold: true,
        fillColor: "#f1f5f9",
        textColor: "#334155",
      });

      y += 24;
    }

    drawTableRow(doc, y, [
      formatDateForPdf(entry.date),
      String(entry.salesCount ?? 0),
      formatMoneyForPdf(entry.cash),
      formatMoneyForPdf(entry.phonePe),
      formatMoneyForPdf(entry.total),
      formatMoneyForPdf(entry.expense),
      formatMoneyForPdf(entry.profit),
      entry.note || "-",
    ]);

    y += 24;
  });

  if (y > 730) {
    doc.addPage();
    y = 50;
  }

  drawTableRow(
    doc,
    y,
    [
      "Totals",
      String(totals.salesCount),
      formatMoneyForPdf(totals.cash),
      formatMoneyForPdf(totals.phonePe),
      formatMoneyForPdf(totals.total),
      formatMoneyForPdf(totals.expense),
      formatMoneyForPdf(totals.profit),
      "",
    ],
    {
      bold: true,
      fillColor: "#f8fafc",
      textColor: "#111827",
    },
  );

  drawPdfFooter(doc);

  doc.end();
};