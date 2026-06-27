import { Request, Response } from "express";
import { z } from "zod";
import { User } from "../models/User.model";
import { generateToken } from "../utils/generateToken";

const registerSchema = z.object({
  name: z.string().min(2, "Name must have at least 2 characters"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must have at least 6 characters")
});

const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required")
});

export const registerUser = async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);

  const existingUser = await User.findOne({ email: data.email });

  if (existingUser) {
    res.status(409).json({
      message: "User already exists with this email"
    });
    return;
  }

  const user = await User.create(data);

  const token = generateToken({
    id: user._id.toString(),
    name: user.name,
    email: user.email
  });

  res.status(201).json({
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email
    }
  });
};

export const loginUser = async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);

  const user = await User.findOne({ email: data.email }).select("+password");

  if (!user) {
    res.status(401).json({
      message: "Invalid email or password"
    });
    return;
  }

  const isPasswordValid = await user.comparePassword(data.password);

  if (!isPasswordValid) {
    res.status(401).json({
      message: "Invalid email or password"
    });
    return;
  }

  const token = generateToken({
    id: user._id.toString(),
    name: user.name,
    email: user.email
  });

  res.json({
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email
    }
  });
};

export const getMe = async (req: Request, res: Response) => {
  res.json({
    user: req.user
  });
};
