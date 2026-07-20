import PDFDocument from "pdfkit";
import { Request, Response } from "express";
import { z } from "zod";
import { Purchase } from "../models/Purchase.model";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const rangeSchema = z
  .object({
    from: z.string().regex(datePattern, "from must use YYYY-MM-DD format"),
    to: z.string().regex(datePattern, "to must use YYYY-MM-DD format"),
  })
  .refine((range) => range.from <= range.to, {
    message: "from must be before or equal to to",
  });

type PurchaseReportRow = {
  purchaseDate: string;
  productId: unknown;
  categoryId: unknown;
  productName: string;
  categoryName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  supplier?: string;
};

type ProductTotal = {
  productName: string;
  unit: string;
  quantity: number;
  totalAmount: number;
  entryCount: number;
};

type CategoryTotal = {
  categoryName: string;
  totalAmount: number;
  entryCount: number;
  products: ProductTotal[];
};

const PAGE_MARGIN = 36;
const FOOTER_SPACE = 34;
const CONTENT_BOTTOM = 841.89 - PAGE_MARGIN - FOOTER_SPACE;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

const getUserId = (req: Request) => {
  if (!req.user?.id) throw new Error("User not available in request");
  return req.user.id;
};

const formatMoney = (value: number) =>
  `Rs. ${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}`;

const formatReportDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const monthName = [
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
  ][month - 1];
  return `${String(day).padStart(2, "0")} ${monthName} ${year}`;
};

const getDairyLitres = (
  categoryName: string,
  productName: string,
  quantity: number,
  unit: string,
) => {
  if (
    categoryName.trim().toLocaleLowerCase("en-IN") !== "dairy" ||
    unit.trim().toLocaleLowerCase("en-IN") !== "packets"
  ) {
    return null;
  }

  const volumeMatch = productName.match(/\b(250|500)\s*ml\b/i);
  if (!volumeMatch) return null;

  return quantity * (Number(volumeMatch[1]) / 1000);
};

const formatLitres = (value: number) =>
  `${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 3,
  }).format(value)} L`;

const getDatesInRange = (from: string, to: string) => {
  const dates: string[] = [];
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

const addPage = (doc: PDFKit.PDFDocument) => {
  doc.addPage();
  return PAGE_MARGIN;
};

const ensureSpace = (
  doc: PDFKit.PDFDocument,
  y: number,
  requiredHeight: number,
) => (y + requiredHeight > CONTENT_BOTTOM ? addPage(doc) : y);

const drawSectionTitle = (
  doc: PDFKit.PDFDocument,
  y: number,
  title: string,
) => {
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text(title, PAGE_MARGIN, y, { lineBreak: false });
  return y + 22;
};

const drawSummary = (
  doc: PDFKit.PDFDocument,
  y: number,
  data: {
    totalAmount: number;
    entryCount: number;
    highestCategory?: CategoryTotal;
  },
) => {
  const gap = 10;
  const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;
  const cards = [
    {
      label: "Total purchased",
      value: formatMoney(data.totalAmount),
      meta: "",
    },
    { label: "Purchase entries", value: String(data.entryCount), meta: "" },
    {
      label: "Highest-spend category",
      value: data.highestCategory?.categoryName ?? "-",
      meta: data.highestCategory
        ? formatMoney(data.highestCategory.totalAmount)
        : "No purchases",
    },
  ];

  cards.forEach((card, index) => {
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 62, 8).fillAndStroke("#ffffff", "#dbe2ea");
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#64748b")
      .text(card.label, x + 10, y + 9, { width: cardWidth - 20 });
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#111827")
      .text(card.value, x + 10, y + 29, {
        width: cardWidth - 20,
        lineBreak: false,
        ellipsis: true,
      });
    if (card.meta) {
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#64748b")
        .text(card.meta, x + 10, y + 47, { width: cardWidth - 20 });
    }
  });
  return y + 76;
};

const drawDaysPurchased = (
  doc: PDFKit.PDFDocument,
  y: number,
  dates: string[],
  purchasedDates: Set<string>,
) => {
  const columns = 15;
  const rows = Math.ceil(dates.length / columns);
  const height = 29 + rows * 25;
  y = ensureSpace(doc, y, height + 8);
  const purchasedCount = dates.filter((date) =>
    purchasedDates.has(date),
  ).length;

  doc
    .roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, height, 9)
    .fillAndStroke("#ffffff", "#dbe2ea");
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#64748b")
    .text("Days purchased", PAGE_MARGIN + 12, y + 10);
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text(`${purchasedCount}/${dates.length}`, PAGE_MARGIN + 12, y + 8, {
      width: CONTENT_WIDTH - 24,
      align: "right",
    });

  const cellWidth = (CONTENT_WIDTH - 24) / columns;
  dates.forEach((date, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const centerX = PAGE_MARGIN + 12 + column * cellWidth + cellWidth / 2;
    const centerY = y + 36 + row * 25;
    const purchased = purchasedDates.has(date);
    doc.circle(centerX, centerY, 8).fill(purchased ? "#f97316" : "#22c55e");
    doc
      .font("Helvetica-Bold")
      .fontSize(5.8)
      .fillColor("#ffffff")
      .text(String(Number(date.slice(8, 10))), centerX - 8, centerY - 3, {
        width: 16,
        align: "center",
        lineBreak: false,
      });
  });
  return y + height + 16;
};

const drawCategoryBreakdown = (
  doc: PDFKit.PDFDocument,
  startY: number,
  categories: CategoryTotal[],
) => {
  let y = startY;
  const productColumns = [263, 130, 130];

  for (const category of categories) {
    y = ensureSpace(doc, y, 70);
    doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 34, 7).fill("#f1f5f9");
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#111827")
      .text(category.categoryName, PAGE_MARGIN + 10, y + 7, {
        width: 280,
        lineBreak: false,
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .fillColor("#64748b")
      .text(`${category.entryCount} entries`, PAGE_MARGIN + 10, y + 20);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#111827")
      .text(formatMoney(category.totalAmount), PAGE_MARGIN + 300, y + 11, {
        width: CONTENT_WIDTH - 310,
        align: "right",
        lineBreak: false,
      });
    y += 38;

    const drawProductHeader = () => {
      const headers = ["Product", "Quantity", "Total"];
      let x = PAGE_MARGIN;
      headers.forEach((header, index) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .fillColor("#64748b")
          .text(header, x + 6, y + 7, {
            width: productColumns[index] - 12,
            align: index === 2 ? "right" : "left",
          });
        x += productColumns[index];
      });
      y += 22;
    };
    drawProductHeader();

    for (const product of category.products) {
      const dairyLitres = getDairyLitres(
        category.categoryName,
        product.productName,
        product.quantity,
        product.unit,
      );
      const rowHeight = dairyLitres === null ? 29 : 33;

      if (y + rowHeight > CONTENT_BOTTOM) {
        y = addPage(doc);
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#111827")
          .text(`${category.categoryName} (continued)`, PAGE_MARGIN, y);
        y += 18;
        drawProductHeader();
      }
      const values = [
        `${product.productName}\n${product.entryCount} entries`,
        `${product.quantity} ${product.unit}`,
        formatMoney(product.totalAmount),
      ];
      let x = PAGE_MARGIN;
      values.forEach((value, index) => {
        if (index === 1 && dairyLitres !== null) {
          doc
            .font("Helvetica-Bold")
            .fontSize(8)
            .fillColor("#111827")
            .text(value, x + 6, y + 5, {
              width: productColumns[index] - 12,
              lineBreak: false,
            });
          doc
            .font("Helvetica-Bold")
            .fontSize(6.3)
            .fillColor("#16a34a")
            .text(formatLitres(dairyLitres), x + 6, y + 17, {
              width: productColumns[index] - 12,
              lineBreak: false,
            });
          x += productColumns[index];
          return;
        }

        doc
          .font(index === 0 || index === 2 ? "Helvetica-Bold" : "Helvetica")
          .fontSize(index === 0 ? 7.5 : 8)
          .fillColor("#111827")
          .text(value, x + 6, y + 6, {
            width: productColumns[index] - 12,
            align: index === 2 ? "right" : "left",
            lineGap: 1,
          });
        x += productColumns[index];
      });
      doc
        .moveTo(PAGE_MARGIN, y + rowHeight)
        .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + rowHeight)
        .strokeColor("#e2e8f0")
        .lineWidth(0.5)
        .stroke();
      y += rowHeight;
    }
    y += 14;
  }
  return y;
};

const drawEntriesTable = (
  doc: PDFKit.PDFDocument,
  startY: number,
  purchases: PurchaseReportRow[],
  totalAmount: number,
) => {
  let y = startY;
  const widths = [67, 102, 82, 65, 66, 66, 75];
  const headers = [
    "Date",
    "Product",
    "Category",
    "Quantity",
    "Unit price",
    "Total",
    "Supplier",
  ];

  const drawHeader = () => {
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 26).fill("#f1f5f9");
    let x = PAGE_MARGIN;
    headers.forEach((header, index) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(6.3)
        .fillColor("#475569")
        .text(header, x + 5, y + 9, {
          width: widths[index] - 10,
          align: index >= 4 && index <= 5 ? "right" : "left",
          lineBreak: false,
        });
      x += widths[index];
    });
    y += 26;
  };

  y = ensureSpace(doc, y, 56);
  drawHeader();
  for (const purchase of purchases) {
    if (y + 28 > CONTENT_BOTTOM) {
      y = addPage(doc);
      drawHeader();
    }
    const values = [
      formatReportDate(purchase.purchaseDate),
      purchase.productName,
      purchase.categoryName,
      `${purchase.quantity} ${purchase.unit}`,
      formatMoney(purchase.unitPrice),
      formatMoney(purchase.totalAmount),
      purchase.supplier?.trim() || "-",
    ];
    let x = PAGE_MARGIN;
    values.forEach((value, index) => {
      doc
        .font(index === 5 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7)
        .fillColor("#111827")
        .text(value, x + 5, y + 9, {
          width: widths[index] - 10,
          align: index >= 4 && index <= 5 ? "right" : "left",
          lineBreak: false,
          ellipsis: true,
        });
      x += widths[index];
    });
    doc
      .moveTo(PAGE_MARGIN, y + 28)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + 28)
      .strokeColor("#e2e8f0")
      .lineWidth(0.5)
      .stroke();
    y += 28;
  }
  if (y + 30 > CONTENT_BOTTOM) {
    y = addPage(doc);
    drawHeader();
  }
  doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 30).fill("#f8fafc");
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#111827")
    .text("Total", PAGE_MARGIN + 5, y + 10);
  doc.text(`${purchases.length} entries`, PAGE_MARGIN + widths[0] + 5, y + 10);
  doc.text(formatMoney(totalAmount), PAGE_MARGIN, y + 10, {
    width: widths.slice(0, 6).reduce((sum, width) => sum + width, 0) - 5,
    align: "right",
  });
};

const drawFooter = (doc: PDFKit.PDFDocument) => {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#64748b")
      .text(
        `Generated by Sale Ledger - Page ${index + 1} of ${range.count}`,
        PAGE_MARGIN,
        doc.page.height - PAGE_MARGIN - 10,
        { width: CONTENT_WIDTH, align: "center", lineBreak: false },
      );
  }
};

export const downloadPurchaseReportPdf = async (
  req: Request,
  res: Response,
) => {
  try {
    const range = rangeSchema.parse({ from: req.query.from, to: req.query.to });
    const purchases = (await Purchase.find({
      userId: getUserId(req),
      purchaseDate: { $gte: range.from, $lte: range.to },
    })
      .sort({ purchaseDate: 1, totalAmount: -1, createdAt: 1 })
      .lean()) as PurchaseReportRow[];

    if (purchases.length === 0) {
      res
        .status(404)
        .json({ message: "No purchases found for the selected date range" });
      return;
    }

    const categoryMap = new Map<string, CategoryTotal>();
    for (const purchase of purchases) {
      const categoryKey = String(purchase.categoryId);
      const category = categoryMap.get(categoryKey) ?? {
        categoryName: purchase.categoryName,
        totalAmount: 0,
        entryCount: 0,
        products: [],
      };
      category.totalAmount += purchase.totalAmount;
      category.entryCount += 1;
      let product = category.products.find(
        (item) =>
          `${item.productName}-${item.unit}` ===
          `${purchase.productName}-${purchase.unit}`,
      );
      if (!product) {
        product = {
          productName: purchase.productName,
          unit: purchase.unit,
          quantity: 0,
          totalAmount: 0,
          entryCount: 0,
        };
        category.products.push(product);
      }
      product.quantity += purchase.quantity;
      product.totalAmount += purchase.totalAmount;
      product.entryCount += 1;
      categoryMap.set(categoryKey, category);
    }
    const categories = [...categoryMap.values()].sort(
      (first, second) => second.totalAmount - first.totalAmount,
    );
    categories.forEach((category) =>
      category.products.sort(
        (first, second) => second.totalAmount - first.totalAmount,
      ),
    );
    const totalAmount = purchases.reduce(
      (total, purchase) => total + purchase.totalAmount,
      0,
    );
    const dates = getDatesInRange(range.from, range.to);
    const purchasedDates = new Set(
      purchases.map((purchase) => purchase.purchaseDate),
    );

    const fileName = `purchase-report-${range.from}-to-${range.to}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE_MARGIN,
      bufferPages: true,
    });
    doc.pipe(res);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#111827")
      .text("Purchase Report", {
        align: "center",
      });

    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#475569")
      .text(`${formatReportDate(range.from)} - ${formatReportDate(range.to)}`, {
        align: "center",
      });

    let y = doc.y + 24;
    y = drawSectionTitle(doc, y, "Summary");
    y = drawSummary(doc, y, {
      totalAmount,
      entryCount: purchases.length,
      highestCategory: categories[0],
    });
    y = drawDaysPurchased(doc, y, dates, purchasedDates);

    y = ensureSpace(doc, y, 50);
    y = drawSectionTitle(doc, y, "Spending by category");
    y = drawCategoryBreakdown(doc, y, categories);

    y = ensureSpace(doc, y + 8, 58);
    y = drawSectionTitle(doc, y, "Purchase entries");
    drawEntriesTable(doc, y, purchases, totalAmount);

    drawFooter(doc);
    doc.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Unable to create purchase report",
      });
    }
  }
};
