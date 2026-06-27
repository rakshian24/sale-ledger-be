import { ErrorRequestHandler, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";

export const notFoundMiddleware = (req: Request, res: Response) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
};

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);

  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      errors: error.flatten().fieldErrors
    });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      message: error.message
    });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({
      message: "Invalid id"
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  ) {
    res.status(409).json({
      message: "Duplicate entry already exists for this date"
    });
    return;
  }

  res.status(500).json({
    message: "Internal server error"
  });
};
