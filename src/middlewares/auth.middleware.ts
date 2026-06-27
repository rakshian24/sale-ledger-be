import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

type AuthTokenPayload = {
  id: string;
  name: string;
  email: string;
};

export const protect = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Not authorized. Token missing."
    });
    return;
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({
      message: "JWT secret is not configured."
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as AuthTokenPayload;

    req.user = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email
    };

    next();
  } catch {
    res.status(401).json({
      message: "Not authorized. Token invalid or expired."
    });
  }
};
