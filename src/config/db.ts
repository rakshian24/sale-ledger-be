import mongoose from "mongoose";

let cachedConnection: typeof mongoose | null = null;

export const connectDB = async () => {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing in environment variables");
  }

  mongoose.set("strictQuery", true);

  cachedConnection = await mongoose.connect(mongoUri, {
    bufferCommands: false,
  });

  console.log("MongoDB connected");

  return cachedConnection;
};
