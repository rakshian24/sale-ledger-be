import bcrypt from "bcryptjs";
import mongoose, { HydratedDocument, InferSchemaType, Model } from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 2
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false
    }
  },
  {
    timestamps: true
  }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    next();
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(
  candidatePassword: string
) {
  return bcrypt.compare(candidatePassword, this.password);
};

export type UserSchema = InferSchemaType<typeof userSchema>;

export type UserDocument = HydratedDocument<UserSchema> & {
  comparePassword(candidatePassword: string): Promise<boolean>;
};

type UserModel = Model<UserSchema, {}, {}, {}, UserDocument>;

export const User = mongoose.model<UserSchema, UserModel>("User", userSchema);
