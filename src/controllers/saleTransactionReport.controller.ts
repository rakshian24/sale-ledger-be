import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import path from "path";
import { z } from "zod";
import { PurchaseProduct } from "../models/PurchaseProduct.model";
import { SaleTransaction } from "../models/SaleTransaction.model";
import { getDairyLitres } from "../utils/dairy";
import { getRetailUnit, quantityToRetailUnits } from "../utils/productUnits";

const rangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    language: z.enum(["en", "kn"]).default("en"),
  })
  .refine((range) => range.from <= range.to, {
    message: "from must be before or equal to to",
  });

const MARGIN = 32;
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 42;
type ReportLanguage = "en" | "kn";

const KANNADA_BOLD_FONT_PATH = path.resolve(
  __dirname,
  "../../assets/fonts/NotoSansKannadaCombined-Bold.ttf",
);

const kannadaLabels: Record<string, string> = {
  "Sales Register Report": "ಮಾರಾಟ ದಾಖಲಾತಿ ವರದಿ",
  "Customer sales": "ಗ್ರಾಹಕರ ಮಾರಾಟಗಳು",
  Revenue: "ಆದಾಯ",
  "Cost of goods": "ಸರಕುಗಳ ವೆಚ್ಚ",
  "Gross profit": "ಒಟ್ಟು ಲಾಭ",
  "Cash / UPI": "ನಗದು / ಯುಪಿಐ",
  "Credit sales": "ಸಾಲದ ಮಾರಾಟ",
  "Detailed customer sales": "ವಿವರವಾದ ಗ್ರಾಹಕರ ಮಾರಾಟ",
  Date: "ದಿನಾಂಕ",
  Sale: "ಮಾರಾಟ",
  Customer: "ಗ್ರಾಹಕ",
  Payment: "ಪಾವತಿ",
  Product: "ಉತ್ಪನ್ನ",
  Qty: "ಪ್ರಮಾಣ",
  "Cost/unit": "ಘಟಕ ವೆಚ್ಚ",
  "Sell/unit": "ಘಟಕ ಮಾರಾಟ ಬೆಲೆ",
  Cost: "ವೆಚ್ಚ",
  Total: "ಒಟ್ಟು",
  Profit: "ಲಾಭ",
  "Walk-in": "ನೇರ ಗ್ರಾಹಕ",
  "Sales by category": "ವರ್ಗವಾರು ಮಾರಾಟ",
  "Sales by category (continued)": "ವರ್ಗವಾರು ಮಾರಾಟ (ಮುಂದುವರಿದಿದೆ)",
  "total revenue": "ಒಟ್ಟು ಆದಾಯ",
  Category: "ವರ್ಗ",
  Sales: "ಮಾರಾಟಗಳು",
  Entries: "ನಮೂದುಗಳು",
  Share: "ಪಾಲು",
  "Sales performance highlights": "ಮಾರಾಟ ಕಾರ್ಯಕ್ಷಮತೆಯ ಮುಖ್ಯಾಂಶಗಳು",
  "Top quantity sold": "ಅತಿ ಹೆಚ್ಚು ಮಾರಾಟವಾದ ಪ್ರಮಾಣ",
  "Most profitable sale": "ಹೆಚ್ಚು ಲಾಭದಾಯಕ ಮಾರಾಟ",
  "Period profit": "ಅವಧಿಯ ಲಾಭ",
  "No sales": "ಮಾರಾಟ ಇಲ್ಲ",
  "Products sold in selected period": "ಆಯ್ದ ಅವಧಿಯಲ್ಲಿ ಮಾರಾಟವಾದ ಉತ್ಪನ್ನಗಳು",
  "Quantity sold": "ಮಾರಾಟವಾದ ಪ್ರಮಾಣ",
  "Sale entries": "ಮಾರಾಟ ನಮೂದುಗಳು",
  product: "ಉತ್ಪನ್ನ",
  products: "ಉತ್ಪನ್ನಗಳು",
  continued: "ಮುಂದುವರಿದಿದೆ",
  revenue: "ಆದಾಯ",
  "Sale Ledger - Sales Register": "ಸೇಲ್ ಲೆಡ್ಜರ್ - ಮಾರಾಟ ದಾಖಲಾತಿ",
  Page: "ಪುಟ",
  of: "ರಲ್ಲಿ",
};

const translate = (language: ReportLanguage, label: string) =>
  language === "kn" ? kannadaLabels[label] || label : label;

const translateUnit = (language: ReportLanguage, unit: string) => {
  if (language !== "kn") return unit;
  const units: Record<string, string> = {
    packet: "ಪ್ಯಾಕೆಟ್",
    packets: "ಪ್ಯಾಕೆಟ್‌ಗಳು",
    kg: "ಕೆಜಿ",
    g: "ಗ್ರಾಂ",
    bottle: "ಬಾಟಲಿ",
    bottles: "ಬಾಟಲಿಗಳು",
    case: "ಕೇಸ್",
    cases: "ಕೇಸ್‌ಗಳು",
    litre: "ಲೀಟರ್",
    litres: "ಲೀಟರ್",
    l: "ಲೀಟರ್",
    piece: "ತುಂಡು",
    pieces: "ತುಂಡುಗಳು",
    bunch: "ಕಟ್ಟು",
    bunches: "ಕಟ್ಟುಗಳು",
    item: "ವಸ್ತು",
    items: "ವಸ್ತುಗಳು",
    box: "ಪೆಟ್ಟಿಗೆ",
    boxes: "ಪೆಟ್ಟಿಗೆಗಳು",
  };
  return units[unit.trim().toLowerCase()] || unit;
};

const translatePayment = (language: ReportLanguage, mode: string) => {
  if (language !== "kn") return mode.toUpperCase();
  return (
    (
      {
        cash: "ನಗದು",
        upi: "ಯುಪಿಐ",
        mixed: "ನಗದು + ಯುಪಿಐ",
        credit: "ಸಾಲ",
      } as Record<string, string>
    )[mode.toLowerCase()] || mode
  );
};

const translateCategory = (language: ReportLanguage, category: string) => {
  if (language !== "kn") return category;
  return (
    (
      {
        dairy: "ಹಾಲು ಉತ್ಪನ್ನಗಳು",
        vegetables: "ತರಕಾರಿಗಳು",
        fruits: "ಹಣ್ಣುಗಳು",
        water: "ನೀರು",
        eggs: "ಮೊಟ್ಟೆಗಳು",
        noodles: "ನೂಡಲ್ಸ್",
        "bike petrol": "ಬೈಕ್ ಪೆಟ್ರೋಲ್",
        soppu: "ಸೊಪ್ಪು",
        "plastic covers": "ಪ್ಲಾಸ್ಟಿಕ್ ಕವರ್‌ಗಳು",
        "garbage bags": "ಕಸದ ಚೀಲಗಳು",
        uncategorized: "ವರ್ಗೀಕರಿಸದ",
      } as Record<string, string>
    )[category.trim().toLowerCase()] || category
  );
};

const kannadaProductNames: Record<string, string> = {
  "9*13 cover": "9×13 ಕವರ್",
  agarbatthi: "ಅಗರಬತ್ತಿ",
  apple: "ಸೇಬು",
  avarekayi: "ಅವರೆಕಾಯಿ",
  "avarekayi - hitaku bele": "ಅವರೆಕಾಯಿ - ಹಿತ್ಕು ಬೇಳೆ",
  "bajji chilly": "ಬಜ್ಜಿ ಮೆಣಸಿನಕಾಯಿ",
  banana: "ಬಾಳೆಹಣ್ಣು",
  beans: "ಬೀನ್ಸ್",
  beetroot: "ಬೀಟ್‌ರೂಟ್",
  "bike petrol": "ಬೈಕ್ ಪೆಟ್ರೋಲ್",
  "bitter gourd": "ಹಾಗಲಕಾಯಿ",
  "bottle gourd": "ಸೊರೆಕಾಯಿ",
  brinjal: "ಬದನೆಕಾಯಿ",
  "buttermilk 200ml": "ಮಜ್ಜಿಗೆ 200 ಮಿ.ಲೀ.",
  "button mushroom": "ಬಟನ್ ಮಶ್ರೂಮ್",
  cabbage: "ಎಲೆಕೋಸು",
  cailiflower: "ಹೂಕೋಸು",
  capsicum: "ದಪ್ಪ ಮೆಣಸಿನಕಾಯಿ",
  carrot: "ಕ್ಯಾರೆಟ್",
  chilly: "ಹಸಿಮೆಣಸಿನಕಾಯಿ",
  coconut: "ತೆಂಗಿನಕಾಯಿ",
  cucumber: "ಸೌತೆಕಾಯಿ",
  "curd 200ml": "ಮೊಸರು 200 ಮಿ.ಲೀ.",
  "curd 500ml": "ಮೊಸರು 500 ಮಿ.ಲೀ.",
  "deepa oil": "ದೀಪಾ ಎಣ್ಣೆ",
  eggs: "ಮೊಟ್ಟೆಗಳು",
  electricals: "ವಿದ್ಯುತ್ ಸಾಮಗ್ರಿಗಳು",
  "gadre tilapia fish fingers 200g": "ಗಾಡ್ರೆ ಟಿಲಾಪಿಯಾ ಫಿಶ್ ಫಿಂಗರ್ಸ್ 200 ಗ್ರಾಂ",
  "garbage bags": "ಕಸದ ಚೀಲಗಳು",
  garlic: "ಬೆಳ್ಳುಳ್ಳಿ",
  ginger: "ಶುಂಠಿ",
  "godrej yummiez chicken nuggets 500g":
    "ಗೋದ್ರೆಜ್ ಯಮ್ಮೀಸ್ ಚಿಕನ್ ನಗೆಟ್ಸ್ 500 ಗ್ರಾಂ",
  "good life 200ml": "ಗುಡ್ ಲೈಫ್ 200 ಮಿ.ಲೀ.",
  grapes: "ದ್ರಾಕ್ಷಿ",
  "ground nut": "ಕಡಲೆಕಾಯಿ",
  "kissan tomato ketchup 95g": "ಕಿಸ್ಸಾನ್ ಟೊಮ್ಯಾಟೊ ಕೆಚಪ್ 95 ಗ್ರಾಂ",
  kiwi: "ಕಿವಿ",
  kothmiri: "ಕೊತ್ತಂಬರಿ ಸೊಪ್ಪು",
  "lady's finger": "ಬೆಂಡೆಕಾಯಿ",
  lemon: "ನಿಂಬೆಹಣ್ಣು",
  "maggie noodles": "ಮ್ಯಾಗಿ ನೂಡಲ್ಸ್",
  "maggie noodles 140g": "ಮ್ಯಾಗಿ ನೂಡಲ್ಸ್ 140 ಗ್ರಾಂ",
  "maggie noodles 280g": "ಮ್ಯಾಗಿ ನೂಡಲ್ಸ್ 280 ಗ್ರಾಂ",
  "maggie noodles 420g": "ಮ್ಯಾಗಿ ನೂಡಲ್ಸ್ 420 ಗ್ರಾಂ",
  "mc cain french fries": "ಮ್ಯಾಕ್‌ಕೇನ್ ಫ್ರೆಂಚ್ ಫ್ರೈಸ್",
  "mc cain masala french fries": "ಮ್ಯಾಕ್‌ಕೇನ್ ಮಸಾಲಾ ಫ್ರೆಂಚ್ ಫ್ರೈಸ್",
  "milk 500ml": "ಹಾಲು 500 ಮಿ.ಲೀ.",
  "milky mist butter 10gms": "ಮಿಲ್ಕಿ ಮಿಸ್ಟ್ ಬೆಣ್ಣೆ 10 ಗ್ರಾಂ",
  "milky mist cheese 200g": "ಮಿಲ್ಕಿ ಮಿಸ್ಟ್ ಚೀಸ್ 200 ಗ್ರಾಂ",
  "milky mist panner 200g": "ಮಿಲ್ಕಿ ಮಿಸ್ಟ್ ಪನೀರ್ 200 ಗ್ರಾಂ",
  mosambi: "ಮೋಸಂಬಿ",
  "musk melon": "ಖರ್ಬೂಜ",
  "mys. brinjal": "ಮೈಸೂರು ಬದನೆಕಾಯಿ",
  "nandini panner": "ನಂದಿನಿ ಪನೀರ್",
  nookal: "ನುಗ್ಗೆಕೋಸು",
  onion: "ಈರುಳ್ಳಿ",
  orange: "ಕಿತ್ತಳೆ",
  peas: "ಬಟಾಣಿ",
  pineapple: "ಅನಾನಸ್",
  pomegranate: "ದಾಳಿಂಬೆ",
  potato: "ಆಲೂಗಡ್ಡೆ",
  pudina: "ಪುದೀನಾ ಸೊಪ್ಪು",
  radish: "ಮೂಲಂಗಿ",
  "ridge gourd": "ಹೀರೇಕಾಯಿ",
  sapota: "ಸಪೋಟಾ",
  "seeme badanekayi": "ಸೀಮೆ ಬದನೆಕಾಯಿ",
  sugar: "ಸಕ್ಕರೆ",
  "sugar cane": "ಕಬ್ಬು",
  "sweet potato": "ಗೆಣಸಿನಕಾಯಿ",
  tomato: "ಟೊಮ್ಯಾಟೊ",
  "water 1 l": "ನೀರು 1 ಲೀಟರ್",
  "water 2 l": "ನೀರು 2 ಲೀಟರ್",
  "water 500ml": "ನೀರು 500 ಮಿ.ಲೀ.",
  "yellu bella covers - 200 nos": "ಎಳ್ಳು ಬೆಲ್ಲ ಕವರ್‌ಗಳು - 200 ನಂ.",
  "yellu bella mix": "ಎಳ್ಳು ಬೆಲ್ಲ ಮಿಶ್ರಣ",
  "yippie noodles 272g": "ಯಿಪ್ಪಿ ನೂಡಲ್ಸ್ 272 ಗ್ರಾಂ",
};

const translateProduct = (language: ReportLanguage, productName: string) => {
  if (language !== "kn") return productName;
  return (
    kannadaProductNames[productName.trim().toLocaleLowerCase("en-IN")] ||
    productName
  );
};

type ReportItem = {
  productId: unknown;
  productName: string;
  categoryName: string;
  quantity: number;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  lineCost: number;
  lineTotal: number;
  lineProfit: number;
};
type ReportSale = {
  _id: unknown;
  saleDate: string;
  saleNumber: number;
  customerName?: string;
  customerPhone?: string;
  paymentMode: string;
  totalCost: number;
  totalAmount: number;
  totalProfit: number;
  cashAmount: number;
  upiAmount: number;
  items: ReportItem[];
};
type CategoryRow = {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  saleCount: number;
  entries: number;
  color: string;
};
type ProductRow = {
  name: string;
  categoryName: string;
  unit: string;
  quantity: number;
  entries: number;
  revenue: number;
  cost: number;
  profit: number;
};
type ReportData = {
  from: string;
  to: string;
  sales: ReportSale[];
  categories: CategoryRow[];
  products: ProductRow[];
};

const money = (value: number, language: ReportLanguage = "en") =>
  `${language === "kn" ? "ರೂ." : "Rs."} ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value || 0)}`;
const number = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(
    value || 0,
  );
const reportDate = (value: string, language: ReportLanguage = "en") => {
  const [year, month, day] = value.split("-");
  const name = [
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
  ][Number(month) - 1];
  const kannadaName = [
    "ಜನ",
    "ಫೆಬ್ರ",
    "ಮಾರ್ಚ್",
    "ಏಪ್ರಿಲ್",
    "ಮೇ",
    "ಜೂನ್",
    "ಜುಲೈ",
    "ಆಗಸ್ಟ್",
    "ಸೆಪ್ಟೆಂ",
    "ಅಕ್ಟೋ",
    "ನವೆಂ",
    "ಡಿಸೆಂ",
  ][Number(month) - 1];
  return `${day}-${language === "kn" ? kannadaName : name}-${year}`;
};
const hslToHex = (h: number, s: number, l: number) => {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};
const categoryColor = (index: number) =>
  hslToHex(
    Math.round((index * 137.508) % 360),
    62 + (index % 3) * 7,
    43 + (Math.floor(index / 3) % 3) * 6,
  );

const addPage = (doc: PDFKit.PDFDocument) => {
  doc.addPage();
  return MARGIN;
};
const ensure = (doc: PDFKit.PDFDocument, y: number, height: number) =>
  y + height > CONTENT_BOTTOM ? addPage(doc) : y;
const sectionTitle = (doc: PDFKit.PDFDocument, y: number, title: string) => {
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor("#111827")
    .text(title, MARGIN, y);
  return y + 24;
};
const tableHeader = (
  doc: PDFKit.PDFDocument,
  y: number,
  labels: string[],
  widths: number[],
) => {
  doc.rect(MARGIN, y, CONTENT_WIDTH, 24).fill("#eef2f7");
  let x = MARGIN;
  labels.forEach((label, index) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .fillColor("#475569")
      .text(label.toUpperCase(), x + 6, y + 8, {
        width: widths[index] - 12,
        lineBreak: false,
        ellipsis: true,
      });
    x += widths[index];
  });
  return y + 24;
};
const footer = (doc: PDFKit.PDFDocument, language: ReportLanguage) => {
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(index);
    const footerY = PAGE_HEIGHT - 44;
    doc
      .font(language === "kn" ? "Helvetica-Bold" : "Helvetica")
      .fontSize(7)
      .fillColor("#94a3b8")
      .text(
        translate(language, "Sale Ledger - Sales Register"),
        MARGIN,
        footerY,
        {
          width: CONTENT_WIDTH / 2,
          lineBreak: false,
        },
      )
      .text(
        `${translate(language, "Page")} ${index + 1} ${translate(language, "of")} ${pages.count}`,
        PAGE_WIDTH / 2,
        footerY,
        {
          width: CONTENT_WIDTH / 2,
          align: "right",
          lineBreak: false,
        },
      );
  }
};

export const renderSalesRegisterPdf = (
  doc: PDFKit.PDFDocument,
  data: ReportData,
  language: ReportLanguage = "en",
) => {
  if (language === "kn") {
    // The bold merged face preserves both Latin and Kannada shaping reliably
    // in PDFKit, so use it for normal Kannada report text as well.
    doc.registerFont("Helvetica-Bold", KANNADA_BOLD_FONT_PATH);
  }
  const t = (label: string) => translate(language, label);
  const m = (value: number) => money(value, language);
  const totalRevenue = data.sales.reduce(
    (sum, sale) => sum + sale.totalAmount,
    0,
  );
  const totalCost = data.sales.reduce((sum, sale) => sum + sale.totalCost, 0);
  const totalProfit = data.sales.reduce(
    (sum, sale) => sum + sale.totalProfit,
    0,
  );
  const cash = data.sales.reduce((sum, sale) => sum + sale.cashAmount, 0);
  const upi = data.sales.reduce((sum, sale) => sum + sale.upiAmount, 0);
  const credit = data.sales
    .filter((sale) => sale.paymentMode === "credit")
    .reduce((sum, sale) => sum + sale.totalAmount, 0);

  let y = MARGIN;
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor("#111827")
    .text(t("Sales Register Report"), MARGIN, y);
  doc
    .font(language === "kn" ? "Helvetica-Bold" : "Helvetica")
    .fontSize(9)
    .fillColor("#64748b")
    .text(
      `${reportDate(data.from, language)} - ${reportDate(data.to, language)}`,
      MARGIN,
      y + 30,
    );
  y += 54;
  const cards = [
    [t("Customer sales"), String(data.sales.length)],
    [t("Revenue"), m(totalRevenue)],
    [t("Cost of goods"), m(totalCost)],
    [t("Gross profit"), m(totalProfit)],
    [t("Cash / UPI"), `${m(cash)} / ${m(upi)}`],
    [t("Credit sales"), m(credit)],
  ];
  const gap = 9;
  const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;
  cards.forEach(([label, value], index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    const x = MARGIN + column * (cardWidth + gap);
    const cardY = y + row * 58;
    doc
      .roundedRect(x, cardY, cardWidth, 48, 7)
      .fillAndStroke("#ffffff", "#dbe2ea");
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#64748b")
      .text(label, x + 9, cardY + 8, { width: cardWidth - 18 });
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(label === t("Gross profit") ? "#16a34a" : "#111827")
      .text(value, x + 9, cardY + 25, {
        width: cardWidth - 18,
        lineBreak: false,
        ellipsis: true,
      });
  });
  y += 128;

  y = sectionTitle(doc, y, t("Detailed customer sales"));
  const saleWidths = [72, 50, 86, 58, 130, 54, 58, 58, 58, 65, 68];
  y = tableHeader(
    doc,
    y,
    [
      t("Date"),
      t("Sale"),
      t("Customer"),
      t("Payment"),
      t("Product"),
      t("Qty"),
      t("Cost/unit"),
      t("Sell/unit"),
      t("Cost"),
      t("Total"),
      t("Profit"),
    ],
    saleWidths,
  );
  for (const sale of data.sales) {
    for (let itemIndex = 0; itemIndex < sale.items.length; itemIndex += 1) {
      const item = sale.items[itemIndex];
      const dairyLitres = getDairyLitres(
        item.categoryName,
        item.productName,
        item.quantity,
        item.unit,
      );
      const rowHeight = dairyLitres === null ? 18 : 25;
      y = ensure(doc, y, rowHeight + 1);
      if (y === MARGIN)
        y = tableHeader(
          doc,
          y,
          [
            t("Date"),
            t("Sale"),
            t("Customer"),
            t("Payment"),
            t("Product"),
            t("Qty"),
            t("Cost/unit"),
            t("Sell/unit"),
            t("Cost"),
            t("Total"),
            t("Profit"),
          ],
          saleWidths,
        );
      const values = [
        itemIndex === 0 ? reportDate(sale.saleDate, language) : "",
        itemIndex === 0 ? `#${sale.saleNumber}` : "",
        itemIndex === 0 ? sale.customerName || t("Walk-in") : "",
        itemIndex === 0 ? translatePayment(language, sale.paymentMode) : "",
        translateProduct(language, item.productName),
        `${number(item.quantity)} ${translateUnit(language, item.unit)}`,
        m(item.costPrice),
        m(item.sellingPrice),
        m(item.lineCost),
        m(item.lineTotal),
        m(item.lineProfit),
      ];
      if (itemIndex % 2 === 1)
        doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight).fill("#f8fafc");
      let x = MARGIN;
      values.forEach((value, index) => {
        if (index === 5 && dairyLitres !== null) {
          doc
            .font(language === "kn" ? "Helvetica-Bold" : "Helvetica")
            .fontSize(6.2)
            .fillColor("#111827")
            .text(value, x + 5, y + 4, {
              width: saleWidths[index] - 10,
              lineBreak: false,
              ellipsis: true,
            });
          doc
            .font("Helvetica-Bold")
            .fontSize(5.8)
            .fillColor("#16a34a")
            .text(`${number(dairyLitres)} L`, x + 5, y + 14, {
              width: saleWidths[index] - 10,
              lineBreak: false,
            });
          x += saleWidths[index];
          return;
        }
        doc
          .font(
            index === 10 || language === "kn" ? "Helvetica-Bold" : "Helvetica",
          )
          .fontSize(6.2)
          .fillColor(
            index === 10 && item.lineProfit >= 0 ? "#16a34a" : "#111827",
          )
          .text(value, x + 5, y + 5, {
            width: saleWidths[index] - 10,
            lineBreak: false,
            ellipsis: true,
          });
        x += saleWidths[index];
      });
      doc
        .moveTo(MARGIN, y + rowHeight)
        .lineTo(MARGIN + CONTENT_WIDTH, y + rowHeight)
        .strokeColor("#e2e8f0")
        .stroke();
      y += rowHeight;
    }
  }

  y = addPage(doc);
  y = sectionTitle(doc, y, t("Sales by category"));
  const chartX = 145;
  const chartY = y + 120;
  const radius = 82;
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
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor("#111827")
    .text(m(totalRevenue), chartX - 44, chartY - 7, {
      width: 88,
      align: "center",
      lineBreak: false,
      ellipsis: true,
    });
  doc
    .font(language === "kn" ? "Helvetica-Bold" : "Helvetica")
    .fontSize(7)
    .fillColor("#64748b")
    .text(t("total revenue"), chartX - 44, chartY + 12, {
      width: 88,
      align: "center",
    });
  const categoryX = 275;
  const categoryWidths = [125, 80, 75, 75, 55, 55, 55];
  let categoryY = tableHeaderAt(
    doc,
    categoryX,
    y + 18,
    [
      t("Category"),
      t("Revenue"),
      t("Cost"),
      t("Profit"),
      t("Sales"),
      t("Entries"),
      t("Share"),
    ],
    categoryWidths,
  );
  data.categories.forEach((category) => {
    doc.circle(categoryX + 8, categoryY + 10, 4).fill(category.color);
    const values = [
      translateCategory(language, category.name),
      m(category.revenue),
      m(category.cost),
      m(category.profit),
      String(category.saleCount),
      String(category.entries),
      `${totalRevenue ? Math.round((category.revenue / totalRevenue) * 100) : 0}%`,
    ];
    let x = categoryX;
    values.forEach((value, index) => {
      doc
        .font(index === 3 || language === "kn" ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7)
        .fillColor(index === 3 && category.profit >= 0 ? "#16a34a" : "#111827")
        .text(value, x + (index === 0 ? 16 : 5), categoryY + 6, {
          width: categoryWidths[index] - (index === 0 ? 20 : 10),
          lineBreak: false,
          ellipsis: true,
        });
      x += categoryWidths[index];
    });
    doc
      .moveTo(categoryX, categoryY + 21)
      .lineTo(
        categoryX + categoryWidths.reduce((sum, width) => sum + width, 0),
        categoryY + 21,
      )
      .strokeColor("#e2e8f0")
      .stroke();
    categoryY += 21;
  });
  y = Math.max(chartY + radius + 28, categoryY + 18);

  if (data.categories.length > firstPageCategories.length) {
    y = addPage(doc);
    y = sectionTitle(doc, y, t("Sales by category (continued)"));
    const continuedWidths = [200, 105, 100, 100, 80, 80, 92];
    const labels = [
      t("Category"),
      t("Revenue"),
      t("Cost"),
      t("Profit"),
      t("Sales"),
      t("Entries"),
      t("Share"),
    ];
    y = tableHeader(doc, y, labels, continuedWidths);
    data.categories
      .slice(firstPageCategories.length)
      .forEach((category, index) => {
        y = ensure(doc, y, 24);
        if (y === MARGIN) y = tableHeader(doc, y, labels, continuedWidths);
        if (index % 2 === 1)
          doc.rect(MARGIN, y, CONTENT_WIDTH, 23).fill("#f8fafc");
        doc.circle(MARGIN + 11, y + 11, 4).fill(category.color);
        const values = [
          translateCategory(language, category.name),
          m(category.revenue),
          m(category.cost),
          m(category.profit),
          String(category.saleCount),
          String(category.entries),
          `${totalRevenue ? Math.round((category.revenue / totalRevenue) * 100) : 0}%`,
        ];
        let x = MARGIN;
        values.forEach((value, column) => {
          doc
            .font(
              column === 3 || language === "kn"
                ? "Helvetica-Bold"
                : "Helvetica",
            )
            .fontSize(7.4)
            .fillColor(
              column === 3 && category.profit >= 0 ? "#16a34a" : "#111827",
            )
            .text(value, x + (column === 0 ? 20 : 7), y + 7, {
              width: continuedWidths[column] - (column === 0 ? 27 : 14),
              lineBreak: false,
              ellipsis: true,
            });
          x += continuedWidths[column];
        });
        doc
          .moveTo(MARGIN, y + 23)
          .lineTo(MARGIN + CONTENT_WIDTH, y + 23)
          .strokeColor("#e2e8f0")
          .stroke();
        y += 23;
      });
    y += 18;
  }

  y = ensure(doc, y, 88);
  y = sectionTitle(doc, y, t("Sales performance highlights"));
  const top = data.products[0];
  const topDairyLitres = top
    ? getDairyLitres(top.categoryName, top.name, top.quantity, top.unit)
    : null;
  const mostProfitable = [...data.sales].sort(
    (a, b) => b.totalProfit - a.totalProfit,
  )[0];
  const highlights = [
    [
      t("Top quantity sold"),
      top ? translateProduct(language, top.name) : "-",
      top
        ? `${number(top.quantity)} ${translateUnit(language, top.unit)}`
        : t("No sales"),
      topDairyLitres === null ? "" : `${number(topDairyLitres)} L`,
    ],
    [
      t("Most profitable sale"),
      mostProfitable
        ? `#${mostProfitable.saleNumber} - ${m(mostProfitable.totalProfit)}`
        : "-",
      mostProfitable
        ? reportDate(mostProfitable.saleDate, language)
        : t("No sales"),
      "",
    ],
    [
      t("Period profit"),
      m(totalProfit),
      `${m(totalRevenue)} ${t("revenue")}`,
      "",
    ],
  ];
  highlights.forEach(([label, value, meta, dairyMeta], index) => {
    const x = MARGIN + index * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, 66, 7).fillAndStroke("#ffffff", "#dbe2ea");
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#64748b")
      .text(label, x + 10, y + 9);
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(label === t("Period profit") ? "#16a34a" : "#111827")
      .text(value, x + 10, y + 27, {
        width: cardWidth - 20,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#64748b")
      .text(meta, x + 10, y + 44);
    if (dairyMeta) {
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#16a34a")
        .text(dairyMeta, x + 10, y + 55, { lineBreak: false });
    }
  });
  y += 84;

  y = ensure(doc, y, 70);
  y = sectionTitle(doc, y, t("Products sold in selected period"));
  const productWidths = [210, 120, 80, 115, 115, 117];
  const productLabels = [
    t("Product"),
    t("Quantity sold"),
    t("Sale entries"),
    t("Revenue"),
    t("Cost"),
    t("Profit"),
  ];
  y = tableHeader(doc, y, productLabels, productWidths);
  const productGroups = new Map<string, ProductRow[]>();
  data.products.forEach((product) =>
    productGroups.set(product.categoryName, [
      ...(productGroups.get(product.categoryName) || []),
      product,
    ]),
  );
  const groupedProducts = [...productGroups.entries()]
    .map(([name, products]) => ({
      name,
      products,
      entries: products.reduce((sum, product) => sum + product.entries, 0),
      revenue: products.reduce((sum, product) => sum + product.revenue, 0),
      cost: products.reduce((sum, product) => sum + product.cost, 0),
      profit: products.reduce((sum, product) => sum + product.profit, 0),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const categoryProductRow = (
    group: (typeof groupedProducts)[number],
    continued = false,
  ) => {
    doc.rect(MARGIN, y, CONTENT_WIDTH, 25).fill("#e9eff6");
    doc
      .font("Helvetica-Bold")
      .fontSize(8.2)
      .fillColor("#111827")
      .text(
        `${translateCategory(language, group.name)}${continued ? ` (${t("continued")})` : ""}`,
        MARGIN + 8,
        y + 5,
        {
          width: productWidths[0] + productWidths[1] - 16,
          lineBreak: false,
          ellipsis: true,
        },
      );
    doc
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .fillColor("#64748b")
      .text(
        `${group.products.length} ${t(group.products.length === 1 ? "product" : "products")}`,
        MARGIN + 8,
        y + 15,
        { width: productWidths[0] + productWidths[1] - 16, lineBreak: false },
      );
    const values = [
      String(group.entries),
      m(group.revenue),
      m(group.cost),
      m(group.profit),
    ];
    let x = MARGIN + productWidths[0] + productWidths[1];
    values.forEach((value, index) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(7.4)
        .fillColor(index === 3 && group.profit >= 0 ? "#16a34a" : "#111827")
        .text(value, x + 7, y + 9, {
          width: productWidths[index + 2] - 14,
          lineBreak: false,
          ellipsis: true,
        });
      x += productWidths[index + 2];
    });
    y += 25;
  };
  groupedProducts.forEach((group) => {
    y = ensure(doc, y, 49);
    if (y === MARGIN) y = tableHeader(doc, y, productLabels, productWidths);
    categoryProductRow(group);
    group.products.forEach((product, index) => {
      const dairyLitres = getDairyLitres(
        product.categoryName,
        product.name,
        product.quantity,
        product.unit,
      );
      const rowHeight = dairyLitres === null ? 23 : 30;
      y = ensure(doc, y, rowHeight + 1);
      if (y === MARGIN) {
        y = tableHeader(doc, y, productLabels, productWidths);
        categoryProductRow(group, true);
      }
      if (index % 2 === 1)
        doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight).fill("#f8fafc");
      const values = [
        translateProduct(language, product.name),
        `${number(product.quantity)} ${translateUnit(language, product.unit)}`,
        String(product.entries),
        m(product.revenue),
        m(product.cost),
        m(product.profit),
      ];
      let x = MARGIN;
      values.forEach((value, column) => {
        if (column === 1 && dairyLitres !== null) {
          doc
            .font("Helvetica-Bold")
            .fontSize(7.4)
            .fillColor("#111827")
            .text(value, x + 7, y + 5, {
              width: productWidths[column] - 14,
              lineBreak: false,
              ellipsis: true,
            });
          doc
            .font("Helvetica-Bold")
            .fontSize(6.5)
            .fillColor("#16a34a")
            .text(`${number(dairyLitres)} L`, x + 7, y + 16, {
              width: productWidths[column] - 14,
              lineBreak: false,
            });
          x += productWidths[column];
          return;
        }
        doc
          .font(
            column === 0 || column === 5 || language === "kn"
              ? "Helvetica-Bold"
              : "Helvetica",
          )
          .fontSize(7.4)
          .fillColor(
            column === 5 && product.profit >= 0 ? "#16a34a" : "#111827",
          )
          .text(value, x + 7, y + 7, {
            width: productWidths[column] - 14,
            lineBreak: false,
            ellipsis: true,
          });
        x += productWidths[column];
      });
      doc
        .moveTo(MARGIN, y + rowHeight)
        .lineTo(MARGIN + CONTENT_WIDTH, y + rowHeight)
        .strokeColor("#e2e8f0")
        .stroke();
      y += rowHeight;
    });
  });
  footer(doc, language);
};

const tableHeaderAt = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  labels: string[],
  widths: number[],
) => {
  const width = widths.reduce((sum, value) => sum + value, 0);
  doc.rect(x, y, width, 23).fill("#eef2f7");
  let cursor = x;
  labels.forEach((label, index) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(6.2)
      .fillColor("#475569")
      .text(label.toUpperCase(), cursor + 5, y + 8, {
        width: widths[index] - 10,
        lineBreak: false,
        ellipsis: true,
      });
    cursor += widths[index];
  });
  return y + 23;
};

export const downloadSalesRegisterReportPdf = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!req.user?.id) throw new Error("User not available in request");
    const range = rangeSchema.parse({
      from: req.query.from,
      to: req.query.to,
      language: req.query.language,
    });
    const sales = (await SaleTransaction.find({
      userId: req.user.id,
      saleDate: { $gte: range.from, $lte: range.to },
    })
      .sort({ saleDate: 1, saleNumber: 1 })
      .lean()) as unknown as ReportSale[];
    const products = await PurchaseProduct.find({ userId: req.user.id }).lean();
    const productById = new Map(
      products.map((product) => [String(product._id), product]),
    );
    const categoryMap = new Map<
      string,
      {
        name: string;
        revenue: number;
        cost: number;
        profit: number;
        entries: number;
        sales: Set<string>;
      }
    >();
    const productMap = new Map<string, ProductRow>();
    sales.forEach((sale) =>
      sale.items.forEach((item) => {
        const category = categoryMap.get(item.categoryName) || {
          name: item.categoryName,
          revenue: 0,
          cost: 0,
          profit: 0,
          entries: 0,
          sales: new Set<string>(),
        };
        category.revenue += item.lineTotal;
        category.cost += item.lineCost;
        category.profit += item.lineProfit;
        category.entries += 1;
        category.sales.add(String(sale._id));
        categoryMap.set(item.categoryName, category);
        const productConfig = productById.get(String(item.productId));
        const id = String(item.productId);
        const product = productMap.get(id) || {
          name: item.productName,
          categoryName: item.categoryName || "Uncategorized",
          unit: productConfig ? getRetailUnit(productConfig) : item.unit,
          quantity: 0,
          entries: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };
        product.quantity += productConfig
          ? quantityToRetailUnits(item.quantity, item.unit, productConfig)
          : item.quantity;
        product.entries += 1;
        product.revenue += item.lineTotal;
        product.cost += item.lineCost;
        product.profit += item.lineProfit;
        productMap.set(id, product);
      }),
    );
    const categories = [...categoryMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .map((category, index) => ({
        ...category,
        saleCount: category.sales.size,
        color: categoryColor(index),
      }));
    const productRows = [...productMap.values()].sort(
      (a, b) => b.quantity - a.quantity,
    );
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      bufferPages: true,
      autoFirstPage: true,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Sales-Register-${range.language === "kn" ? "Kannada-" : ""}${range.from}-to-${range.to}.pdf"`,
    );
    doc.pipe(res);
    renderSalesRegisterPdf(
      doc,
      {
        from: range.from,
        to: range.to,
        sales,
        categories,
        products: productRows,
      },
      range.language,
    );
    doc.end();
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Unable to generate Sales Register report",
    });
  }
};
