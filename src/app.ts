import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.routes";
import entryRoutes from "./routes/entry.routes";
import fixedMonthlyExpenseRoutes from "./routes/fixedMonthlyExpense.routes";
import purchaseCategoryRoutes from "./routes/purchaseCategory.routes";
import purchaseProductRoutes from "./routes/purchaseProduct.routes";
import purchaseRoutes from "./routes/purchase.routes";
import { connectDB } from "./config/db";
import {
  errorMiddleware,
  notFoundMiddleware,
} from "./middlewares/error.middleware";

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "Sale Ledger API",
  });
});

app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/entries", entryRoutes);
app.use("/api/fixed-expenses", fixedMonthlyExpenseRoutes);
app.use("/api/purchase-categories", purchaseCategoryRoutes);
app.use("/api/purchase-products", purchaseProductRoutes);
app.use("/api/purchases", purchaseRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
