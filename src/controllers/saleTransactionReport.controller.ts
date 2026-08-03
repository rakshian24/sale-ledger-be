import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { PurchaseProduct } from "../models/PurchaseProduct.model";
import { SaleTransaction } from "../models/SaleTransaction.model";
import { getRetailUnit, quantityToRetailUnits } from "../utils/productUnits";

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((range) => range.from <= range.to, { message: "from must be before or equal to to" });

const MARGIN = 32;
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 42;

type ReportItem = {
  productId: unknown; productName: string; categoryName: string; quantity: number;
  unit: string; costPrice: number; sellingPrice: number; lineCost: number;
  lineTotal: number; lineProfit: number;
};
type ReportSale = {
  _id: unknown; saleDate: string; saleNumber: number; customerName?: string;
  customerPhone?: string; paymentMode: string; totalCost: number;
  totalAmount: number; totalProfit: number; cashAmount: number; upiAmount: number;
  items: ReportItem[];
};
type CategoryRow = { name: string; revenue: number; cost: number; profit: number; saleCount: number; entries: number; color: string };
type ProductRow = { name: string; unit: string; quantity: number; entries: number; revenue: number; cost: number; profit: number };
type ReportData = { from: string; to: string; sales: ReportSale[]; categories: CategoryRow[]; products: ProductRow[] };

const money = (value: number) => `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value || 0)}`;
const number = (value: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value || 0);
const reportDate = (value: string) => {
  const [year, month, day] = value.split("-");
  const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1];
  return `${day}-${name}-${year}`;
};
const hslToHex = (h: number, s: number, l: number) => {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
};
const categoryColor = (index: number) => hslToHex(Math.round((index * 137.508) % 360), 62 + (index % 3) * 7, 43 + (Math.floor(index / 3) % 3) * 6);

const addPage = (doc: PDFKit.PDFDocument) => { doc.addPage(); return MARGIN; };
const ensure = (doc: PDFKit.PDFDocument, y: number, height: number) => y + height > CONTENT_BOTTOM ? addPage(doc) : y;
const sectionTitle = (doc: PDFKit.PDFDocument, y: number, title: string) => {
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827").text(title, MARGIN, y);
  return y + 24;
};
const tableHeader = (doc: PDFKit.PDFDocument, y: number, labels: string[], widths: number[]) => {
  doc.rect(MARGIN, y, CONTENT_WIDTH, 24).fill("#eef2f7");
  let x = MARGIN;
  labels.forEach((label, index) => {
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#475569").text(label.toUpperCase(), x + 6, y + 8, { width: widths[index] - 12, lineBreak: false, ellipsis: true });
    x += widths[index];
  });
  return y + 24;
};
const footer = (doc: PDFKit.PDFDocument) => {
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(index);
    const footerY = PAGE_HEIGHT - 44;
    doc.font("Helvetica").fontSize(7).fillColor("#94a3b8")
      .text("Sale Ledger - Sales Register", MARGIN, footerY, { width: CONTENT_WIDTH / 2, lineBreak: false })
      .text(`Page ${index + 1} of ${pages.count}`, PAGE_WIDTH / 2, footerY, { width: CONTENT_WIDTH / 2, align: "right", lineBreak: false });
  }
};

export const renderSalesRegisterPdf = (doc: PDFKit.PDFDocument, data: ReportData) => {
  const totalRevenue = data.sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const totalCost = data.sales.reduce((sum, sale) => sum + sale.totalCost, 0);
  const totalProfit = data.sales.reduce((sum, sale) => sum + sale.totalProfit, 0);
  const cash = data.sales.reduce((sum, sale) => sum + sale.cashAmount, 0);
  const upi = data.sales.reduce((sum, sale) => sum + sale.upiAmount, 0);
  const credit = data.sales.filter((sale) => sale.paymentMode === "credit").reduce((sum, sale) => sum + sale.totalAmount, 0);

  let y = MARGIN;
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#111827").text("Sales Register Report", MARGIN, y);
  doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(`${reportDate(data.from)} to ${reportDate(data.to)}`, MARGIN, y + 30);
  y += 54;
  const cards = [
    ["Customer sales", String(data.sales.length)], ["Revenue", money(totalRevenue)], ["Cost of goods", money(totalCost)],
    ["Gross profit", money(totalProfit)], ["Cash / UPI", `${money(cash)} / ${money(upi)}`], ["Credit sales", money(credit)],
  ];
  const gap = 9; const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;
  cards.forEach(([label, value], index) => {
    const row = Math.floor(index / 3); const column = index % 3; const x = MARGIN + column * (cardWidth + gap); const cardY = y + row * 58;
    doc.roundedRect(x, cardY, cardWidth, 48, 7).fillAndStroke("#ffffff", "#dbe2ea");
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#64748b").text(label, x + 9, cardY + 8, { width: cardWidth - 18 });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(label === "Gross profit" ? "#16a34a" : "#111827").text(value, x + 9, cardY + 25, { width: cardWidth - 18, lineBreak: false, ellipsis: true });
  });
  y += 128;

  y = sectionTitle(doc, y, "Detailed customer sales");
  const saleWidths = [72, 50, 86, 58, 130, 54, 58, 58, 58, 65, 68];
  y = tableHeader(doc, y, ["Date", "Sale", "Customer", "Payment", "Product", "Qty", "Cost/unit", "Sell/unit", "Cost", "Total", "Profit"], saleWidths);
  for (const sale of data.sales) {
    for (let itemIndex = 0; itemIndex < sale.items.length; itemIndex += 1) {
      y = ensure(doc, y, 19);
      if (y === MARGIN) y = tableHeader(doc, y, ["Date", "Sale", "Customer", "Payment", "Product", "Qty", "Cost/unit", "Sell/unit", "Cost", "Total", "Profit"], saleWidths);
      const item = sale.items[itemIndex];
      const values = [itemIndex === 0 ? reportDate(sale.saleDate) : "", itemIndex === 0 ? `#${sale.saleNumber}` : "", itemIndex === 0 ? (sale.customerName || "Walk-in") : "", itemIndex === 0 ? sale.paymentMode.toUpperCase() : "", item.productName, `${number(item.quantity)} ${item.unit}`, money(item.costPrice), money(item.sellingPrice), money(item.lineCost), money(item.lineTotal), money(item.lineProfit)];
      if (itemIndex % 2 === 1) doc.rect(MARGIN, y, CONTENT_WIDTH, 18).fill("#f8fafc");
      let x = MARGIN;
      values.forEach((value, index) => { doc.font(index === 10 ? "Helvetica-Bold" : "Helvetica").fontSize(6.2).fillColor(index === 10 && item.lineProfit >= 0 ? "#16a34a" : "#111827").text(value, x + 5, y + 5, { width: saleWidths[index] - 10, lineBreak: false, ellipsis: true }); x += saleWidths[index]; });
      doc.moveTo(MARGIN, y + 18).lineTo(MARGIN + CONTENT_WIDTH, y + 18).strokeColor("#e2e8f0").stroke();
      y += 18;
    }
  }

  y = addPage(doc);
  y = sectionTitle(doc, y, "Sales by category");
  const chartX = 145; const chartY = y + 120; const radius = 82;
  let angle = -90;
  const firstPageCategories = data.categories.slice(0, 12);
  firstPageCategories.forEach((category) => {
    const degrees = totalRevenue ? (category.revenue / totalRevenue) * 360 : 0;
    doc.save().moveTo(chartX, chartY);
    const steps = Math.max(2, Math.ceil(degrees / 3));
    for (let step = 0; step <= steps; step += 1) {
      const pointAngle = angle + (degrees * step) / steps;
      doc.lineTo(
        chartX + Math.cos((pointAngle * Math.PI) / 180) * radius,
        chartY + Math.sin((pointAngle * Math.PI) / 180) * radius,
      );
    }
    doc.closePath().fill(category.color).restore();
    angle += degrees;
  });
  doc.circle(chartX, chartY, 46).fill("#ffffff");
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827").text(money(totalRevenue), chartX - 44, chartY - 7, { width: 88, align: "center", lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(7).fillColor("#64748b").text("total revenue", chartX - 44, chartY + 12, { width: 88, align: "center" });
  const categoryX = 275; const categoryWidths = [125, 80, 75, 75, 55, 55, 55];
  let categoryY = tableHeaderAt(doc, categoryX, y + 18, ["Category", "Revenue", "Cost", "Profit", "Sales", "Entries", "Share"], categoryWidths);
  data.categories.forEach((category) => {
    doc.circle(categoryX + 8, categoryY + 10, 4).fill(category.color);
    const values = [category.name, money(category.revenue), money(category.cost), money(category.profit), String(category.saleCount), String(category.entries), `${totalRevenue ? Math.round((category.revenue / totalRevenue) * 100) : 0}%`];
    let x = categoryX;
    values.forEach((value, index) => { doc.font(index === 3 ? "Helvetica-Bold" : "Helvetica").fontSize(7).fillColor(index === 3 && category.profit >= 0 ? "#16a34a" : "#111827").text(value, x + (index === 0 ? 16 : 5), categoryY + 6, { width: categoryWidths[index] - (index === 0 ? 20 : 10), lineBreak: false, ellipsis: true }); x += categoryWidths[index]; });
    doc.moveTo(categoryX, categoryY + 21).lineTo(categoryX + categoryWidths.reduce((sum, width) => sum + width, 0), categoryY + 21).strokeColor("#e2e8f0").stroke(); categoryY += 21;
  });
  y = Math.max(chartY + radius + 28, categoryY + 18);

  if (data.categories.length > firstPageCategories.length) {
    y = addPage(doc);
    y = sectionTitle(doc, y, "Sales by category (continued)");
    const continuedWidths = [200, 105, 100, 100, 80, 80, 92];
    const labels = ["Category", "Revenue", "Cost", "Profit", "Sales", "Entries", "Share"];
    y = tableHeader(doc, y, labels, continuedWidths);
    data.categories.slice(firstPageCategories.length).forEach((category, index) => {
      y = ensure(doc, y, 24);
      if (y === MARGIN) y = tableHeader(doc, y, labels, continuedWidths);
      if (index % 2 === 1) doc.rect(MARGIN, y, CONTENT_WIDTH, 23).fill("#f8fafc");
      doc.circle(MARGIN + 11, y + 11, 4).fill(category.color);
      const values = [category.name, money(category.revenue), money(category.cost), money(category.profit), String(category.saleCount), String(category.entries), `${totalRevenue ? Math.round((category.revenue / totalRevenue) * 100) : 0}%`];
      let x = MARGIN;
      values.forEach((value, column) => {
        doc.font(column === 3 ? "Helvetica-Bold" : "Helvetica").fontSize(7.4).fillColor(column === 3 && category.profit >= 0 ? "#16a34a" : "#111827").text(value, x + (column === 0 ? 20 : 7), y + 7, { width: continuedWidths[column] - (column === 0 ? 27 : 14), lineBreak: false, ellipsis: true });
        x += continuedWidths[column];
      });
      doc.moveTo(MARGIN, y + 23).lineTo(MARGIN + CONTENT_WIDTH, y + 23).strokeColor("#e2e8f0").stroke();
      y += 23;
    });
    y += 18;
  }

  y = ensure(doc, y, 80); y = sectionTitle(doc, y, "Sales performance highlights");
  const top = data.products[0]; const mostProfitable = [...data.sales].sort((a, b) => b.totalProfit - a.totalProfit)[0];
  const highlights = [["Top quantity sold", top ? top.name : "-", top ? `${number(top.quantity)} ${top.unit}` : "No sales"], ["Most profitable sale", mostProfitable ? `#${mostProfitable.saleNumber} - ${money(mostProfitable.totalProfit)}` : "-", mostProfitable ? reportDate(mostProfitable.saleDate) : "No sales"], ["Period profit", money(totalProfit), `${money(totalRevenue)} revenue`]];
  highlights.forEach(([label, value, meta], index) => { const x = MARGIN + index * (cardWidth + gap); doc.roundedRect(x, y, cardWidth, 58, 7).fillAndStroke("#ffffff", "#dbe2ea"); doc.font("Helvetica-Bold").fontSize(7).fillColor("#64748b").text(label, x + 10, y + 9); doc.font("Helvetica-Bold").fontSize(12).fillColor(label === "Period profit" ? "#16a34a" : "#111827").text(value, x + 10, y + 27, { width: cardWidth - 20, lineBreak: false, ellipsis: true }); doc.font("Helvetica-Bold").fontSize(7).fillColor("#64748b").text(meta, x + 10, y + 45); });
  y += 76;

  y = ensure(doc, y, 70); y = sectionTitle(doc, y, "Products sold in selected period");
  const productWidths = [210, 120, 80, 115, 115, 117];
  y = tableHeader(doc, y, ["Product", "Quantity sold", "Sale entries", "Revenue", "Cost", "Profit"], productWidths);
  data.products.forEach((product, index) => {
    y = ensure(doc, y, 24); if (y === MARGIN) y = tableHeader(doc, y, ["Product", "Quantity sold", "Sale entries", "Revenue", "Cost", "Profit"], productWidths);
    if (index % 2 === 1) doc.rect(MARGIN, y, CONTENT_WIDTH, 23).fill("#f8fafc");
    const values = [product.name, `${number(product.quantity)} ${product.unit}`, String(product.entries), money(product.revenue), money(product.cost), money(product.profit)]; let x = MARGIN;
    values.forEach((value, column) => { doc.font(column === 0 || column === 5 ? "Helvetica-Bold" : "Helvetica").fontSize(7.4).fillColor(column === 5 && product.profit >= 0 ? "#16a34a" : "#111827").text(value, x + 7, y + 7, { width: productWidths[column] - 14, lineBreak: false, ellipsis: true }); x += productWidths[column]; });
    doc.moveTo(MARGIN, y + 23).lineTo(MARGIN + CONTENT_WIDTH, y + 23).strokeColor("#e2e8f0").stroke(); y += 23;
  });
  footer(doc);
};

const tableHeaderAt = (doc: PDFKit.PDFDocument, x: number, y: number, labels: string[], widths: number[]) => {
  const width = widths.reduce((sum, value) => sum + value, 0); doc.rect(x, y, width, 23).fill("#eef2f7"); let cursor = x;
  labels.forEach((label, index) => { doc.font("Helvetica-Bold").fontSize(6.2).fillColor("#475569").text(label.toUpperCase(), cursor + 5, y + 8, { width: widths[index] - 10, lineBreak: false, ellipsis: true }); cursor += widths[index]; }); return y + 23;
};

export const downloadSalesRegisterReportPdf = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) throw new Error("User not available in request");
    const range = rangeSchema.parse({ from: req.query.from, to: req.query.to });
    const sales = await SaleTransaction.find({ userId: req.user.id, saleDate: { $gte: range.from, $lte: range.to } }).sort({ saleDate: 1, saleNumber: 1 }).lean() as unknown as ReportSale[];
    const products = await PurchaseProduct.find({ userId: req.user.id }).lean();
    const productById = new Map(products.map((product) => [String(product._id), product]));
    const categoryMap = new Map<string, { name: string; revenue: number; cost: number; profit: number; entries: number; sales: Set<string> }>();
    const productMap = new Map<string, ProductRow>();
    sales.forEach((sale) => sale.items.forEach((item) => {
      const category = categoryMap.get(item.categoryName) || { name: item.categoryName, revenue: 0, cost: 0, profit: 0, entries: 0, sales: new Set<string>() };
      category.revenue += item.lineTotal; category.cost += item.lineCost; category.profit += item.lineProfit; category.entries += 1; category.sales.add(String(sale._id)); categoryMap.set(item.categoryName, category);
      const productConfig = productById.get(String(item.productId)); const id = String(item.productId);
      const product = productMap.get(id) || { name: item.productName, unit: productConfig ? getRetailUnit(productConfig) : item.unit, quantity: 0, entries: 0, revenue: 0, cost: 0, profit: 0 };
      product.quantity += productConfig ? quantityToRetailUnits(item.quantity, item.unit, productConfig) : item.quantity; product.entries += 1; product.revenue += item.lineTotal; product.cost += item.lineCost; product.profit += item.lineProfit; productMap.set(id, product);
    }));
    const categories = [...categoryMap.values()].sort((a, b) => b.revenue - a.revenue).map((category, index) => ({ ...category, saleCount: category.sales.size, color: categoryColor(index) }));
    const productRows = [...productMap.values()].sort((a, b) => b.quantity - a.quantity);
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }, bufferPages: true, autoFirstPage: true });
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="Sales-Register-${range.from}-to-${range.to}.pdf"`);
    doc.pipe(res); renderSalesRegisterPdf(doc, { ...range, sales, categories, products: productRows }); doc.end();
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to generate Sales Register report" });
  }
};
