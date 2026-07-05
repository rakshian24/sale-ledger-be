import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import { Request, Response } from "express";
import { z } from "zod";
import { Entry } from "../models/Entry.model";
import { FixedMonthlyExpense } from "../models/FixedMonthlyExpense.model";

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

type FixedExpensePdfData = {
  shopRent: number;
  shopkeeperSalary: number;
  electricityBill: number;
  totalFixedExpense: number;
};

type PdfTableRowOptions = {
  bold?: boolean;
  fillColor?: string;
  textColor?: string;
  isHeader?: boolean;
  minimumHeight?: number;
  isHoliday?: boolean;
  weekdayName?: string;
  weekendDay?: "Saturday" | "Sunday" | null;
};

type PdfWeekdayInfo = {
  weekdayName: string;
  weekendDay: "Saturday" | "Sunday" | null;
};

type AnnualEntryAggregation = {
  _id: number;
  entryCount: number;
  totalSales: number;
  totalCash: number;
  totalPhonePe: number;
  totalCollection: number;
  totalExpense: number;
  totalProfit: number;
};

type AnnualMonthPdfRow = {
  month: number;
  monthName: string;
  entryCount: number;
  totalSales: number;
  totalCash: number;
  totalPhonePe: number;
  totalCollection: number;
  totalExpense: number;
  totalProfit: number;
  shopRent: number;
  shopkeeperSalary: number;
  electricityBill: number;
  totalFixedExpense: number;
  netProfit: number;
};

type AnnualPdfTotals = {
  totalSales: number;
  totalCash: number;
  totalPhonePe: number;
  totalCollection: number;
  totalExpense: number;
  totalProfit: number;
  totalFixedExpense: number;
  netProfit: number;
};

type AnnualTableRowOptions = {
  bold?: boolean;
  fillColor?: string;
  textColor?: string;
  isHeader?: boolean;
  minimumHeight?: number;
};

const DEFAULT_FIXED_EXPENSE: FixedExpensePdfData = {
  shopRent: 5000,
  shopkeeperSalary: 10000,
  electricityBill: 0,
  totalFixedExpense: 15000,
};

const PDF_PAGE_START_Y = 50;
const PDF_FOOTER_RESERVED_HEIGHT = 42;

const PDF_TABLE_START_X = 40;

const PDF_TABLE_COLUMN_WIDTHS = [
  66, // Date
  34, // Sales
  55, // Cash
  58, // PhonePe
  55, // Total
  58, // Expense
  58, // Profit
  131, // Note
];

const PDF_TABLE_WIDTH = PDF_TABLE_COLUMN_WIDTHS.reduce(
  (total, width) => total + width,
  0,
);

const ANNUAL_TABLE_START_X = 30;
const ANNUAL_PAGE_START_Y = 40;

/*
 * Landscape A4 printable width:
 * approximately 842 - 30 - 30 = 782 points.
 *
 * Total width below = 781 points.
 */
const ANNUAL_TABLE_COLUMN_WIDTHS = [
  70, // Month
  45, // Sales
  75, // Cash
  75, // PhonePe
  80, // Total
  80, // Expense
  180, // Fixed expenses
  80, // Profit
  96, // Net profit
];

const ANNUAL_TABLE_WIDTH = ANNUAL_TABLE_COLUMN_WIDTHS.reduce(
  (total, width) => total + width,
  0,
);

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

  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
};

const getMonthName = (month: number) => {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, month - 1, 1)));
};

const formatDateForPdf = (date: string) => {
  const dateOnlyMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    const parsedDate = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(parsedDate);
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
};

const getPdfWeekdayInfo = (date: string): PdfWeekdayInfo => {
  const dateOnlyMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})/);

  let parsedDate: Date;

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    parsedDate = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );
  } else {
    parsedDate = new Date(date);
  }

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      weekdayName: "",
      weekendDay: null,
    };
  }

  const fullWeekdayName = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    timeZone: "UTC",
  }).format(parsedDate);

  const weekdayName = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  }).format(parsedDate);

  let weekendDay: "Saturday" | "Sunday" | null = null;

  if (fullWeekdayName === "Saturday") {
    weekendDay = "Saturday";
  } else if (fullWeekdayName === "Sunday") {
    weekendDay = "Sunday";
  }

  return {
    weekdayName,
    weekendDay,
  };
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

const getPdfContentBottom = (doc: PDFKit.PDFDocument) => {
  return doc.page.height - doc.page.margins.bottom - PDF_FOOTER_RESERVED_HEIGHT;
};

const ensurePdfSpace = (
  doc: PDFKit.PDFDocument,
  y: number,
  requiredHeight: number,
) => {
  if (y + requiredHeight <= getPdfContentBottom(doc)) {
    return y;
  }

  doc.addPage();

  return PDF_PAGE_START_Y;
};

const getPdfTableRowHeight = (
  doc: PDFKit.PDFDocument,
  row: string[],
  options: PdfTableRowOptions = {},
) => {
  const fontName = options.bold ? "Helvetica-Bold" : "Helvetica";
  const fontSize = options.isHeader ? 7.3 : 8;

  const horizontalPadding = 8;
  const verticalPadding = options.isHeader ? 14 : 12;

  doc.font(fontName).fontSize(fontSize);

  const cellHeights = row.map((rawCell, index) => {
    const cell = rawCell || "-";
    const columnWidth = PDF_TABLE_COLUMN_WIDTHS[index];
    const availableWidth = columnWidth - horizontalPadding;

    const isDateColumn = index === 0;
    const isNoteColumn = index === 7;

    if (isDateColumn && !options.isHeader) {
      const dateHeight = doc.heightOfString(cell, {
        width: availableWidth,
        align: "left",
        lineBreak: false,
      });

      doc.font("Helvetica-Bold").fontSize(6.3);

      const weekdayHeight = options.weekdayName
        ? doc.heightOfString(options.weekdayName, {
            width: availableWidth,
            align: "left",
            lineBreak: false,
          })
        : 0;

      const weekdayGap = options.weekdayName ? 3 : 0;
      const holidayBadgeHeight = options.isHoliday ? 11 : 0;
      const holidayBadgeGap = options.isHoliday ? 4 : 0;

      doc.font(fontName).fontSize(fontSize);

      return (
        dateHeight +
        weekdayGap +
        weekdayHeight +
        holidayBadgeGap +
        holidayBadgeHeight
      );
    }

    if (isNoteColumn) {
      return doc.heightOfString(cell, {
        width: availableWidth,
        align: "left",
        lineGap: 1.5,
      });
    }

    return doc.heightOfString(cell, {
      width: availableWidth,
      align: isDateColumn ? "left" : "right",
      lineBreak: false,
    });
  });

  return Math.max(
    options.minimumHeight ?? (options.isHeader ? 28 : 24),
    Math.max(...cellHeights) + verticalPadding,
  );
};

const drawTableRow = (
  doc: PDFKit.PDFDocument,
  y: number,
  row: string[],
  options: PdfTableRowOptions = {},
) => {
  const rowHeight = getPdfTableRowHeight(doc, row, options);

  const fontName = options.bold ? "Helvetica-Bold" : "Helvetica";
  const fontSize = options.isHeader ? 7.3 : 8;
  const defaultTextColor = options.textColor || "#111827";

  const rowFillColor = options.isHoliday
    ? "#fefce8"
    : options.weekendDay === "Sunday"
      ? "#fff7ed"
      : options.weekendDay === "Saturday"
        ? "#f5f3ff"
        : options.fillColor;

  if (rowFillColor) {
    doc
      .rect(PDF_TABLE_START_X, y, PDF_TABLE_WIDTH, rowHeight)
      .fill(rowFillColor);
  }

  doc.font(fontName).fontSize(fontSize).fillColor(defaultTextColor);

  let currentX = PDF_TABLE_START_X;

  row.forEach((rawCell, index) => {
    const cell = rawCell || "-";
    const columnWidth = PDF_TABLE_COLUMN_WIDTHS[index];
    const cellWidth = columnWidth - 8;

    const isDateColumn = index === 0;
    const isNoteColumn = index === 7;

    if (isDateColumn && !options.isHeader) {
      doc.font(fontName).fontSize(fontSize);

      const dateHeight = doc.heightOfString(cell, {
        width: cellWidth,
        align: "left",
        lineBreak: false,
      });

      doc.font("Helvetica-Bold").fontSize(6.3);

      const weekdayHeight = options.weekdayName
        ? doc.heightOfString(options.weekdayName, {
            width: cellWidth,
            align: "left",
            lineBreak: false,
          })
        : 0;

      const weekdayGap = options.weekdayName ? 3 : 0;
      const badgeGap = options.isHoliday ? 4 : 0;
      const badgeHeight = options.isHoliday ? 11 : 0;

      const contentHeight =
        dateHeight + weekdayGap + weekdayHeight + badgeGap + badgeHeight;

      const contentStartY = y + Math.max(5, (rowHeight - contentHeight) / 2);

      doc
        .font(options.isHoliday ? "Helvetica-Bold" : fontName)
        .fontSize(fontSize)
        .fillColor("#111827")
        .text(cell, currentX + 4, contentStartY, {
          width: cellWidth,
          align: "left",
          lineBreak: false,
          ellipsis: true,
        });

      let nextContentY = contentStartY + dateHeight;

      if (options.weekdayName) {
        nextContentY += weekdayGap;

        const weekdayColor = options.isHoliday
          ? "#854d0e"
          : options.weekendDay === "Sunday"
            ? "#ea580c"
            : options.weekendDay === "Saturday"
              ? "#7c3aed"
              : "#64748b";

        doc
          .font("Helvetica-Bold")
          .fontSize(6.3)
          .fillColor(weekdayColor)
          .text(options.weekdayName, currentX + 4, nextContentY, {
            width: cellWidth,
            align: "left",
            lineBreak: false,
          });

        nextContentY += weekdayHeight;
      }

      if (options.isHoliday) {
        const badgeX = currentX + 4;
        const badgeY = nextContentY + badgeGap;
        const badgeWidth = 34;
        const holidayBadgeHeight = 11;

        doc
          .roundedRect(
            badgeX,
            badgeY,
            badgeWidth,
            holidayBadgeHeight,
            holidayBadgeHeight / 2,
          )
          .fill("#facc15");

        doc
          .font("Helvetica-Bold")
          .fontSize(5.8)
          .fillColor("#713f12")
          .text("Holiday", badgeX, badgeY + 2.1, {
            width: badgeWidth,
            align: "center",
            lineBreak: false,
          });
      }

      doc.font(fontName).fontSize(fontSize).fillColor(defaultTextColor);

      currentX += columnWidth;
      return;
    }

    if (isNoteColumn) {
      const noteHeight = doc.heightOfString(cell, {
        width: cellWidth,
        align: "left",
        lineGap: 1.5,
      });

      const noteY = y + Math.max(6, (rowHeight - noteHeight) / 2);

      doc
        .font(fontName)
        .fontSize(fontSize)
        .fillColor(defaultTextColor)
        .text(cell, currentX + 4, noteY, {
          width: cellWidth,
          align: "left",
          lineGap: 1.5,
        });
    } else {
      const alignment = isDateColumn ? "left" : "right";

      const textHeight = doc.heightOfString(cell, {
        width: cellWidth,
        align: alignment,
        lineBreak: false,
      });

      const textY = y + Math.max(5, (rowHeight - textHeight) / 2);

      doc
        .font(fontName)
        .fontSize(fontSize)
        .fillColor(defaultTextColor)
        .text(cell, currentX + 4, textY, {
          width: cellWidth,
          align: alignment,
          lineBreak: false,
          ellipsis: true,
        });
    }

    currentX += columnWidth;
  });

  const rowBorderColor = options.isHoliday
    ? "#fde68a"
    : options.weekendDay === "Saturday"
      ? "#ddd6fe"
      : options.weekendDay === "Sunday"
        ? "#fed7aa"
        : "#e5e7eb";

  doc
    .moveTo(PDF_TABLE_START_X, y + rowHeight)
    .lineTo(PDF_TABLE_START_X + PDF_TABLE_WIDTH, y + rowHeight)
    .strokeColor(rowBorderColor)
    .lineWidth(0.5)
    .stroke();

  return rowHeight;
};

const drawAverageSection = (
  doc: PDFKit.PDFDocument,
  y: number,
  averages: MonthlyAveragesForPdf,
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
    const rowIndex = Math.floor(index / 3);
    const columnIndex = index % 3;

    const x = startX + sectionPadding + columnIndex * (cardWidth + gap);

    const cardY = rowIndex === 0 ? firstCardRowY : secondCardRowY;

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

const drawSummarySection = (
  doc: PDFKit.PDFDocument,
  y: number,
  data: {
    totals: {
      salesCount: number;
      cash: number;
      phonePe: number;
      total: number;
      expense: number;
      profit: number;
    };
    fixedExpense: FixedExpensePdfData;
    netProfit: number;
  },
) => {
  const startX = 40;
  const sectionWidth = doc.page.width - 80;

  const columns = 4;
  const gap = 8;
  const cardHeight = 44;
  const cardWidth = (sectionWidth - gap * (columns - 1)) / columns;

  const items = [
    {
      label: "Total Sales",
      value: String(data.totals.salesCount),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      meta: "",
    },
    {
      label: "Total Cash",
      value: formatMoneyForPdf(data.totals.cash),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      meta: "",
    },
    {
      label: "Total PhonePe",
      value: formatMoneyForPdf(data.totals.phonePe),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      meta: "",
    },
    {
      label: "Total Collection",
      value: formatMoneyForPdf(data.totals.total),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      meta: "",
    },
    {
      label: "Total Expense",
      value: formatMoneyForPdf(data.totals.expense),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      meta: "",
    },
    {
      label: "Fixed Monthly Expenses",
      value: formatMoneyForPdf(data.fixedExpense.totalFixedExpense),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      meta: `Rent ${formatMoneyForPdf(
        data.fixedExpense.shopRent,
      )} • Salary ${formatMoneyForPdf(
        data.fixedExpense.shopkeeperSalary,
      )} • EB ${formatMoneyForPdf(data.fixedExpense.electricityBill)}`,
    },
    {
      label: "Sales Profit",
      value: formatMoneyForPdf(data.totals.profit),
      background: data.totals.profit >= 0 ? "#f0fdf4" : "#fef2f2",
      border: data.totals.profit >= 0 ? "#86efac" : "#fca5a5",
      valueColor: data.totals.profit >= 0 ? "#16a34a" : "#dc2626",
      meta: "",
    },
    {
      label: "Net Profit After Fixed Expenses",
      value: formatMoneyForPdf(data.netProfit),
      background: data.netProfit >= 0 ? "#f0fdf4" : "#fef2f2",
      border: data.netProfit >= 0 ? "#86efac" : "#fca5a5",
      valueColor: data.netProfit >= 0 ? "#16a34a" : "#dc2626",
      meta: "",
    },
  ];

  items.forEach((item, index) => {
    const rowIndex = Math.floor(index / columns);
    const columnIndex = index % columns;

    const x = startX + columnIndex * (cardWidth + gap);
    const cardY = y + rowIndex * (cardHeight + gap);

    doc
      .roundedRect(x, cardY, cardWidth, cardHeight, 8)
      .fillAndStroke(item.background, item.border);

    doc
      .font("Helvetica-Bold")
      .fontSize(6.7)
      .fillColor("#64748b")
      .text(item.label, x + 8, cardY + 7, {
        width: cardWidth - 16,
        lineBreak: false,
        ellipsis: true,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(item.valueColor)
      .text(item.value, x + 8, cardY + 21, {
        width: cardWidth - 16,
        lineBreak: false,
        ellipsis: true,
      });

    if (item.meta) {
      doc
        .font("Helvetica-Bold")
        .fontSize(4.6)
        .fillColor("#64748b")
        .text(item.meta, x + 8, cardY + 34, {
          width: cardWidth - 16,
          lineBreak: false,
          ellipsis: true,
        });
    }
  });

  return y + cardHeight * 2 + gap + 20;
};

const drawFixedExpenseSection = (
  doc: PDFKit.PDFDocument,
  y: number,
  fixedExpense: FixedExpensePdfData,
) => {
  const startX = 40;
  const sectionWidth = doc.page.width - 80;
  const sectionHeight = 72;

  const horizontalPadding = 14;
  const itemsY = y + 36;

  doc
    .roundedRect(startX, y, sectionWidth, sectionHeight, 10)
    .fillAndStroke("#f0fdf4", "#86efac");

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#16a34a")
    .text(
      "Fixed Expenses (Monthly Breakdown)",
      startX + horizontalPadding,
      y + 10,
      {
        width: sectionWidth - horizontalPadding * 2,
        lineBreak: false,
      },
    );

  const items = [
    {
      label: "Rent",
      value: fixedExpense.shopRent,
      isTotal: false,
    },
    {
      label: "Salary",
      value: fixedExpense.shopkeeperSalary,
      isTotal: false,
    },
    {
      label: "Electricity",
      value: fixedExpense.electricityBill,
      isTotal: false,
    },
    {
      label: "Total",
      value: fixedExpense.totalFixedExpense,
      isTotal: true,
    },
  ];

  const innerWidth = sectionWidth - horizontalPadding * 2;
  const itemWidth = innerWidth / items.length;

  items.forEach((item, index) => {
    const itemX = startX + horizontalPadding + index * itemWidth;

    if (item.isTotal) {
      doc
        .moveTo(itemX, itemsY - 4)
        .lineTo(itemX, y + sectionHeight - 10)
        .strokeColor("#94a3b8")
        .lineWidth(0.5)
        .stroke();
    }

    const textX = itemX + (item.isTotal ? 16 : 8);

    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#475569")
      .text(item.label, textX, itemsY, {
        width: itemWidth - 20,
        lineBreak: false,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(item.isTotal ? "#16a34a" : "#111827")
      .text(formatMoneyForPdf(item.value), textX, itemsY + 14, {
        width: itemWidth - 20,
        lineBreak: false,
      });
  });

  return y + sectionHeight + 22;
};

const drawBusinessSummarySection = (
  doc: PDFKit.PDFDocument,
  y: number,
  data: {
    salesProfit: number;
    fixedExpense: number;
    netProfit: number;
  },
) => {
  const startX = 40;
  const sectionWidth = doc.page.width - 80;

  const sectionPadding = 12;
  const headingHeight = 18;
  const gap = 10;
  const cardHeight = 88;

  const cardWidth = (sectionWidth - sectionPadding * 2 - gap * 2) / 3;

  const sectionHeight =
    sectionPadding + headingHeight + 8 + cardHeight + sectionPadding;

  doc
    .roundedRect(startX, y, sectionWidth, sectionHeight, 10)
    .fillAndStroke("#ffffff", "#e2e8f0");

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#334155")
    .text(
      "BUSINESS SUMMARY AFTER FIXED EXPENSES",
      startX + sectionPadding,
      y + sectionPadding,
      {
        width: sectionWidth - sectionPadding * 2,
        characterSpacing: 0.35,
        lineBreak: false,
      },
    );

  const cards = [
    {
      title: "Sales Profit\n(All Entries)",
      value: data.salesProfit,
      description: "Sum of Sales Profit\ncolumn above",
      background: "#f0fdf4",
      border: "#86efac",
      color: data.salesProfit >= 0 ? "#16a34a" : "#dc2626",
    },
    {
      title: "Fixed Monthly\nExpense",
      value: data.fixedExpense,
      description: "Rent + Salary +\nElectricity",
      background: "#f8fbff",
      border: "#bfdbfe",
      color: "#334155",
    },
    {
      title: "Net Profit After\nFixed Expenses",
      value: data.netProfit,
      description: "Sales Profit - Fixed\nMonthly Expense",
      background: data.netProfit >= 0 ? "#f0fdf4" : "#fef2f2",
      border: data.netProfit >= 0 ? "#86efac" : "#fca5a5",
      color: data.netProfit >= 0 ? "#16a34a" : "#dc2626",
    },
  ];

  const cardsY = y + sectionPadding + headingHeight + 8;

  cards.forEach((card, index) => {
    const cardX = startX + sectionPadding + index * (cardWidth + gap);

    const contentX = cardX + 14;
    const contentWidth = cardWidth - 28;

    doc
      .roundedRect(cardX, cardsY, cardWidth, cardHeight, 9)
      .fillAndStroke(card.background, card.border);

    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(card.color)
      .text(card.title, contentX, cardsY + 11, {
        width: contentWidth,
        lineGap: 0.5,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .fillColor(card.color)
      .text(formatMoneyForPdf(card.value), contentX, cardsY + 39, {
        width: contentWidth,
        lineBreak: false,
        ellipsis: true,
      });

    doc
      .moveTo(contentX, cardsY + 59)
      .lineTo(cardX + cardWidth - 14, cardsY + 59)
      .strokeColor(card.color)
      .lineWidth(0.5)
      .stroke();

    doc
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .fillColor("#475569")
      .text(card.description, contentX, cardsY + 67, {
        width: contentWidth,
        lineGap: 0.5,
      });
  });

  return y + sectionHeight + 18;
};

const getAnnualTableRowHeight = (
  doc: PDFKit.PDFDocument,
  row: string[],
  options: AnnualTableRowOptions = {},
) => {
  const fontName = options.bold ? "Helvetica-Bold" : "Helvetica";
  const fontSize = options.isHeader ? 7 : 8;

  doc.font(fontName).fontSize(fontSize);

  const cellHeights = row.map((rawCell, index) => {
    const cell = rawCell || "-";
    const availableWidth = ANNUAL_TABLE_COLUMN_WIDTHS[index] - 10;

    const align = index === 0 || index === 6 ? "left" : "right";

    return doc.heightOfString(cell, {
      width: availableWidth,
      align,
      lineGap: index === 6 ? 1.5 : 0,
    });
  });

  return Math.max(
    options.minimumHeight ?? (options.isHeader ? 30 : 42),
    Math.max(...cellHeights) + 14,
  );
};

const drawAnnualTableRow = (
  doc: PDFKit.PDFDocument,
  y: number,
  row: string[],
  options: AnnualTableRowOptions = {},
) => {
  const rowHeight = getAnnualTableRowHeight(doc, row, options);

  if (options.fillColor) {
    doc
      .rect(ANNUAL_TABLE_START_X, y, ANNUAL_TABLE_WIDTH, rowHeight)
      .fill(options.fillColor);
  }

  const fontName = options.bold ? "Helvetica-Bold" : "Helvetica";
  const fontSize = options.isHeader ? 7 : 8;

  doc
    .font(fontName)
    .fontSize(fontSize)
    .fillColor(options.textColor ?? "#111827");

  let currentX = ANNUAL_TABLE_START_X;

  row.forEach((rawCell, index) => {
    const cell = rawCell || "-";
    const columnWidth = ANNUAL_TABLE_COLUMN_WIDTHS[index];
    const cellWidth = columnWidth - 10;

    const align = index === 0 || index === 6 ? "left" : "right";

    const lineGap = index === 6 ? 1.5 : 0;

    const textHeight = doc.heightOfString(cell, {
      width: cellWidth,
      align,
      lineGap,
    });

    const textY = y + Math.max(6, (rowHeight - textHeight) / 2);

    doc.text(cell, currentX + 5, textY, {
      width: cellWidth,
      align,
      lineGap,
    });

    currentX += columnWidth;
  });

  doc
    .moveTo(ANNUAL_TABLE_START_X, y + rowHeight)
    .lineTo(ANNUAL_TABLE_START_X + ANNUAL_TABLE_WIDTH, y + rowHeight)
    .strokeColor("#e2e8f0")
    .lineWidth(0.5)
    .stroke();

  return rowHeight;
};

const drawAnnualSummarySection = (
  doc: PDFKit.PDFDocument,
  y: number,
  totals: AnnualPdfTotals,
) => {
  const startX = 30;
  const sectionWidth = doc.page.width - 60;

  const columns = 4;
  const gap = 10;
  const cardHeight = 56;

  const cardWidth = (sectionWidth - gap * (columns - 1)) / columns;

  const items = [
    {
      label: "Total Sales",
      value: String(totals.totalSales),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      description: "",
    },
    {
      label: "Total Cash",
      value: formatMoneyForPdf(totals.totalCash),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      description: "",
    },
    {
      label: "Total PhonePe / UPI",
      value: formatMoneyForPdf(totals.totalPhonePe),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      description: "",
    },
    {
      label: "Total Collection",
      value: formatMoneyForPdf(totals.totalCollection),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      description: "",
    },
    {
      label: "Total Expense",
      value: formatMoneyForPdf(totals.totalExpense),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      description: "",
    },
    {
      label: "Total Fixed Expenses",
      value: formatMoneyForPdf(totals.totalFixedExpense),
      background: "#f8fafc",
      border: "#e2e8f0",
      valueColor: "#111827",
      description: "Only months containing entries",
    },
    {
      label: "Sales Profit",
      value: formatMoneyForPdf(totals.totalProfit),
      background: totals.totalProfit >= 0 ? "#f0fdf4" : "#fef2f2",
      border: totals.totalProfit >= 0 ? "#86efac" : "#fca5a5",
      valueColor: totals.totalProfit >= 0 ? "#16a34a" : "#dc2626",
      description: "",
    },
    {
      label: "Net Profit After Fixed Expenses",
      value: formatMoneyForPdf(totals.netProfit),
      background: totals.netProfit >= 0 ? "#f0fdf4" : "#fef2f2",
      border: totals.netProfit >= 0 ? "#86efac" : "#fca5a5",
      valueColor: totals.netProfit >= 0 ? "#16a34a" : "#dc2626",
      description: "",
    },
  ];

  items.forEach((item, index) => {
    const rowIndex = Math.floor(index / columns);
    const columnIndex = index % columns;

    const cardX = startX + columnIndex * (cardWidth + gap);

    const cardY = y + rowIndex * (cardHeight + gap);

    doc
      .roundedRect(cardX, cardY, cardWidth, cardHeight, 9)
      .fillAndStroke(item.background, item.border);

    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#64748b")
      .text(item.label, cardX + 10, cardY + 8, {
        width: cardWidth - 20,
        lineBreak: false,
        ellipsis: true,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(item.valueColor)
      .text(item.value, cardX + 10, cardY + 25, {
        width: cardWidth - 20,
        lineBreak: false,
        ellipsis: true,
      });

    if (item.description) {
      doc
        .font("Helvetica-Bold")
        .fontSize(5.4)
        .fillColor("#64748b")
        .text(item.description, cardX + 10, cardY + 43, {
          width: cardWidth - 20,
          lineBreak: false,
          ellipsis: true,
        });
    }
  });

  return y + cardHeight * 2 + gap + 24;
};

const drawAnnualBusinessSummary = (
  doc: PDFKit.PDFDocument,
  y: number,
  totals: AnnualPdfTotals,
) => {
  const startX = 30;
  const sectionWidth = doc.page.width - 60;

  const sectionPadding = 14;
  const headingHeight = 18;
  const gap = 12;
  const cardHeight = 88;

  const cardWidth = (sectionWidth - sectionPadding * 2 - gap * 2) / 3;

  const sectionHeight =
    sectionPadding + headingHeight + 10 + cardHeight + sectionPadding;

  doc
    .roundedRect(startX, y, sectionWidth, sectionHeight, 10)
    .fillAndStroke("#ffffff", "#e2e8f0");

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#334155")
    .text(
      "ANNUAL BUSINESS SUMMARY AFTER FIXED EXPENSES",
      startX + sectionPadding,
      y + sectionPadding,
      {
        width: sectionWidth - sectionPadding * 2,
        characterSpacing: 0.35,
        lineBreak: false,
      },
    );

  const cards = [
    {
      title: "Sales Profit\n(All Months)",
      value: totals.totalProfit,
      description: "Combined sales profit\nfor all listed months",
      background: totals.totalProfit >= 0 ? "#f0fdf4" : "#fef2f2",
      border: totals.totalProfit >= 0 ? "#86efac" : "#fca5a5",
      color: totals.totalProfit >= 0 ? "#16a34a" : "#dc2626",
    },
    {
      title: "Total Fixed\nExpenses",
      value: totals.totalFixedExpense,
      description: "Rent + Salary + Electricity\nfor listed months",
      background: "#f8fbff",
      border: "#bfdbfe",
      color: "#334155",
    },
    {
      title: "Net Profit After\nFixed Expenses",
      value: totals.netProfit,
      description: "Sales Profit - Total\nFixed Expenses",
      background: totals.netProfit >= 0 ? "#f0fdf4" : "#fef2f2",
      border: totals.netProfit >= 0 ? "#86efac" : "#fca5a5",
      color: totals.netProfit >= 0 ? "#16a34a" : "#dc2626",
    },
  ];

  const cardsY = y + sectionPadding + headingHeight + 10;

  cards.forEach((card, index) => {
    const cardX = startX + sectionPadding + index * (cardWidth + gap);

    const contentX = cardX + 14;
    const contentWidth = cardWidth - 28;

    doc
      .roundedRect(cardX, cardsY, cardWidth, cardHeight, 9)
      .fillAndStroke(card.background, card.border);

    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(card.color)
      .text(card.title, contentX, cardsY + 11, {
        width: contentWidth,
        lineGap: 0.5,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(card.color)
      .text(formatMoneyForPdf(card.value), contentX, cardsY + 39, {
        width: contentWidth,
        lineBreak: false,
        ellipsis: true,
      });

    doc
      .moveTo(contentX, cardsY + 59)
      .lineTo(cardX + cardWidth - 14, cardsY + 59)
      .strokeColor(card.color)
      .lineWidth(0.5)
      .stroke();

    doc
      .font("Helvetica-Bold")
      .fontSize(6.3)
      .fillColor("#475569")
      .text(card.description, contentX, cardsY + 67, {
        width: contentWidth,
        lineGap: 0.5,
      });
  });

  return y + sectionHeight + 18;
};

const drawPdfFooter = (doc: PDFKit.PDFDocument) => {
  const pageRange = doc.bufferedPageRange();
  const pageCount = pageRange.count;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    doc.switchToPage(pageRange.start + pageIndex);

    const footerY = doc.page.height - doc.page.margins.bottom - 12;

    doc.save();

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748b")
      .text(
        `Generated by Sale Ledger • Page ${pageIndex + 1} of ${pageCount}`,
        doc.page.margins.left,
        footerY,
        {
          width:
            doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: "center",
          lineBreak: false,
        },
      );

    doc.restore();
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

  const [entries, savedFixedExpense] = await Promise.all([
    Entry.find({
      userId,
      date: {
        $gte: start,
        $lt: end,
      },
    }).sort({ date: 1 }),

    FixedMonthlyExpense.findOne({
      userId,
      month,
      year,
    }).lean(),
  ]);

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

  const shopRent = Number(
    savedFixedExpense?.shopRent ?? DEFAULT_FIXED_EXPENSE.shopRent,
  );

  const shopkeeperSalary = Number(
    savedFixedExpense?.shopkeeperSalary ??
      DEFAULT_FIXED_EXPENSE.shopkeeperSalary,
  );

  const electricityBill = Number(
    savedFixedExpense?.electricityBill ?? DEFAULT_FIXED_EXPENSE.electricityBill,
  );

  const totalFixedExpense = shopRent + shopkeeperSalary + electricityBill;

  const fixedExpense: FixedExpensePdfData = {
    shopRent,
    shopkeeperSalary,
    electricityBill,
    totalFixedExpense,
  };

  const netProfit = totals.profit - fixedExpense.totalFixedExpense;

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
    .text("Sale Ledger Monthly Report", {
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

  let y = doc.y;

  y = drawSummarySection(doc, y, {
    totals,
    fixedExpense,
    netProfit,
  });

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text("Sales Report", 40, y);

  y += 24;

  y = drawAverageSection(doc, y, averages);

  y = ensurePdfSpace(doc, y, 100);
  y = drawFixedExpenseSection(doc, y, fixedExpense);

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

  const drawTableHeader = () => {
    y += drawTableRow(doc, y, headers, {
      bold: true,
      fillColor: "#f1f5f9",
      textColor: "#334155",
      isHeader: true,
      minimumHeight: 28,
    });
  };

  const initialHeaderHeight = getPdfTableRowHeight(doc, headers, {
    bold: true,
    isHeader: true,
    minimumHeight: 28,
  });

  y = ensurePdfSpace(doc, y, initialHeaderHeight + 24);

  drawTableHeader();

  entries.forEach((entry) => {
    const { weekdayName, weekendDay } = getPdfWeekdayInfo(entry.date);

    const tableRow = [
      formatDateForPdf(entry.date),
      String(entry.salesCount ?? 0),
      formatMoneyForPdf(entry.cash),
      formatMoneyForPdf(entry.phonePe),
      formatMoneyForPdf(entry.total),
      formatMoneyForPdf(entry.expense),
      formatMoneyForPdf(entry.profit),
      entry.note?.trim() || "-",
    ];

    const rowOptions: PdfTableRowOptions = {
      minimumHeight: 24,
      isHoliday: entry.isHoliday,
      weekdayName,
      weekendDay,
    };

    const requiredRowHeight = getPdfTableRowHeight(doc, tableRow, rowOptions);

    if (y + requiredRowHeight > getPdfContentBottom(doc)) {
      doc.addPage();
      y = PDF_PAGE_START_Y;
      drawTableHeader();
    }

    y += drawTableRow(doc, y, tableRow, rowOptions);
  });

  const totalsRow = [
    "Totals",
    String(totals.salesCount),
    formatMoneyForPdf(totals.cash),
    formatMoneyForPdf(totals.phonePe),
    formatMoneyForPdf(totals.total),
    formatMoneyForPdf(totals.expense),
    formatMoneyForPdf(totals.profit),
    "",
  ];

  const totalsRowHeight = getPdfTableRowHeight(doc, totalsRow, {
    bold: true,
    minimumHeight: 28,
  });

  if (y + totalsRowHeight > getPdfContentBottom(doc)) {
    doc.addPage();
    y = PDF_PAGE_START_Y;
    drawTableHeader();
  }

  y += drawTableRow(doc, y, totalsRow, {
    bold: true,
    fillColor: "#f8fafc",
    textColor: "#111827",
    minimumHeight: 28,
  });

  y += 18;
  y = ensurePdfSpace(doc, y, 160);

  drawBusinessSummarySection(doc, y, {
    salesProfit: totals.profit,
    fixedExpense: fixedExpense.totalFixedExpense,
    netProfit,
  });

  drawPdfFooter(doc);

  doc.end();
};

export const downloadYearlyEntriesPdf = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const year = Number(req.query.year);

  if (!year || !Number.isInteger(year)) {
    res.status(400).json({
      message: "A valid year query param is required",
    });
    return;
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;

  const objectUserId = new mongoose.Types.ObjectId(userId);

  const [monthlyAggregations, fixedExpenseDocuments] = await Promise.all([
    Entry.aggregate<AnnualEntryAggregation>([
      {
        $match: {
          userId: objectUserId,
          date: {
            $gte: yearStart,
            $lt: yearEnd,
          },
        },
      },
      {
        $addFields: {
          monthNumber: {
            $toInt: {
              $substrBytes: ["$date", 5, 2],
            },
          },
        },
      },
      {
        $group: {
          _id: "$monthNumber",
          entryCount: {
            $sum: 1,
          },
          totalSales: {
            $sum: "$salesCount",
          },
          totalCash: {
            $sum: "$cash",
          },
          totalPhonePe: {
            $sum: "$phonePe",
          },
          totalCollection: {
            $sum: "$total",
          },
          totalExpense: {
            $sum: "$expense",
          },
          totalProfit: {
            $sum: "$profit",
          },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
    ]),

    FixedMonthlyExpense.find({
      userId,
      year,
    }).lean(),
  ]);

  if (monthlyAggregations.length === 0) {
    res.status(404).json({
      message: `No entries found for ${year}`,
    });
    return;
  }

  const fixedExpenseByMonth = new Map(
    fixedExpenseDocuments.map((item) => [Number(item.month), item]),
  );

  const rows: AnnualMonthPdfRow[] = monthlyAggregations.map((aggregation) => {
    const month = Number(aggregation._id);

    const savedFixedExpense = fixedExpenseByMonth.get(month);

    const shopRent = Number(
      savedFixedExpense?.shopRent ?? DEFAULT_FIXED_EXPENSE.shopRent,
    );

    const shopkeeperSalary = Number(
      savedFixedExpense?.shopkeeperSalary ??
        DEFAULT_FIXED_EXPENSE.shopkeeperSalary,
    );

    const electricityBill = Number(
      savedFixedExpense?.electricityBill ??
        DEFAULT_FIXED_EXPENSE.electricityBill,
    );

    /*
     * Always recalculate to keep it consistent with the individual
     * fixed-expense components.
     */
    const totalFixedExpense = shopRent + shopkeeperSalary + electricityBill;

    const totalProfit = Number(aggregation.totalProfit) || 0;

    return {
      month,
      monthName: getMonthName(month),
      entryCount: Number(aggregation.entryCount) || 0,
      totalSales: Number(aggregation.totalSales) || 0,
      totalCash: Number(aggregation.totalCash) || 0,
      totalPhonePe: Number(aggregation.totalPhonePe) || 0,
      totalCollection: Number(aggregation.totalCollection) || 0,
      totalExpense: Number(aggregation.totalExpense) || 0,
      totalProfit,
      shopRent,
      shopkeeperSalary,
      electricityBill,
      totalFixedExpense,
      netProfit: totalProfit - totalFixedExpense,
    };
  });

  const totals = rows.reduce<AnnualPdfTotals>(
    (acc, row) => {
      acc.totalSales += row.totalSales;
      acc.totalCash += row.totalCash;
      acc.totalPhonePe += row.totalPhonePe;
      acc.totalCollection += row.totalCollection;
      acc.totalExpense += row.totalExpense;
      acc.totalProfit += row.totalProfit;
      acc.totalFixedExpense += row.totalFixedExpense;
      acc.netProfit += row.netProfit;

      return acc;
    },
    {
      totalSales: 0,
      totalCash: 0,
      totalPhonePe: 0,
      totalCollection: 0,
      totalExpense: 0,
      totalProfit: 0,
      totalFixedExpense: 0,
      netProfit: 0,
    },
  );

  const fileName = `SaleLedger_${year}_Annual_Report.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: {
      top: 30,
      right: 30,
      bottom: 40,
      left: 30,
    },
    bufferPages: true,
  });

  doc.pipe(res);

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor("#111827")
    .text("Sale Ledger Annual Report", {
      align: "center",
    });

  doc
    .moveDown(0.25)
    .font("Helvetica")
    .fontSize(14)
    .fillColor("#475569")
    .text(String(year), {
      align: "center",
    });

  doc.moveDown(0.8);

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text("Annual Summary");

  doc.moveDown(0.5);

  let y = doc.y;

  y = drawAnnualSummarySection(doc, y, totals);

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text("Monthly Summary", ANNUAL_TABLE_START_X, y);

  y += 24;

  const headers = [
    "Month",
    "Sales",
    "Cash",
    "PhonePe",
    "Total",
    "Expense",
    "Fixed Monthly Expenses",
    "Profit",
    "Net Profit",
  ];

  const drawAnnualHeader = () => {
    y += drawAnnualTableRow(doc, y, headers, {
      bold: true,
      isHeader: true,
      minimumHeight: 30,
      fillColor: "#f1f5f9",
      textColor: "#334155",
    });
  };

  drawAnnualHeader();

  rows.forEach((row) => {
    const tableRow = [
      row.monthName,
      String(row.totalSales),
      formatMoneyForPdf(row.totalCash),
      formatMoneyForPdf(row.totalPhonePe),
      formatMoneyForPdf(row.totalCollection),
      formatMoneyForPdf(row.totalExpense),
      `${formatMoneyForPdf(row.totalFixedExpense)}\nRent ${formatMoneyForPdf(
        row.shopRent,
      )} • Salary ${formatMoneyForPdf(
        row.shopkeeperSalary,
      )} • EB ${formatMoneyForPdf(row.electricityBill)}`,
      formatMoneyForPdf(row.totalProfit),
      formatMoneyForPdf(row.netProfit),
    ];

    const requiredHeight = getAnnualTableRowHeight(doc, tableRow, {
      minimumHeight: 42,
    });

    if (y + requiredHeight > getPdfContentBottom(doc)) {
      doc.addPage();
      y = ANNUAL_PAGE_START_Y;
      drawAnnualHeader();
    }

    y += drawAnnualTableRow(doc, y, tableRow, {
      minimumHeight: 42,
    });
  });

  const totalsRow = [
    "Totals",
    String(totals.totalSales),
    formatMoneyForPdf(totals.totalCash),
    formatMoneyForPdf(totals.totalPhonePe),
    formatMoneyForPdf(totals.totalCollection),
    formatMoneyForPdf(totals.totalExpense),
    formatMoneyForPdf(totals.totalFixedExpense),
    formatMoneyForPdf(totals.totalProfit),
    formatMoneyForPdf(totals.netProfit),
  ];

  const totalsRowHeight = getAnnualTableRowHeight(doc, totalsRow, {
    bold: true,
    minimumHeight: 34,
  });

  if (y + totalsRowHeight > getPdfContentBottom(doc)) {
    doc.addPage();
    y = ANNUAL_PAGE_START_Y;
    drawAnnualHeader();
  }

  y += drawAnnualTableRow(doc, y, totalsRow, {
    bold: true,
    minimumHeight: 34,
    fillColor: "#f8fafc",
    textColor: "#111827",
  });

  y += 20;

  const annualBusinessSummaryHeight = 150;

  if (y + annualBusinessSummaryHeight > getPdfContentBottom(doc)) {
    doc.addPage();
    y = ANNUAL_PAGE_START_Y;
  }

  drawAnnualBusinessSummary(doc, y, totals);

  drawPdfFooter(doc);

  doc.end();
};
