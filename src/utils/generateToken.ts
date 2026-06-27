import jwt, { type Secret, type SignOptions } from "jsonwebtoken";

type TokenPayload = {
  id: string;
  name: string;
  email: string;
};

const getJwtExpiresIn = (): SignOptions["expiresIn"] => {
  return (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"];
};

export const generateToken = (payload: TokenPayload): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing in environment variables");
  }

  const jwtSecret: Secret = secret;

  const options: SignOptions = {
    expiresIn: getJwtExpiresIn(),
  };

  return jwt.sign(payload, jwtSecret, options);
};
