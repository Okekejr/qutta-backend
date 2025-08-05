import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../config/db";
import { AuthRequest } from "../middleware/auth";
import appleSignin from "apple-signin-auth";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "qutta_secret";

export const register = async (req: Request, res: Response) => {
  const { name, lastName, email, password, role } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, "lastName", email, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, "lastName", email, role, created_at`,
      [name, lastName, email, hashed, role]
    );
    const user = result[0];
    const token = jwt.sign(user, JWT_SECRET!, { expiresIn: "7d" });
    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: "Email may already exist." });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await query("SELECT * FROM users WHERE email = $1", [email]);
  const user = result[0];
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    user: {
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    },
    token,
  });
};

export const checkEmailExists = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ exists: false, error: "Email is required" });
  }

  try {
    const result = await query("SELECT 1 FROM users WHERE email = $1", [email]);
    const exists = result.length > 0;
    res.json({ exists });
  } catch (err) {
    console.error("Error checking email:", err);
    res.status(500).json({ exists: false, error: "Server error" });
  }
};

export const authUser = async (req: AuthRequest, res: Response) => {
  const { id, name, lastName, role, email, created_at } = req.user!;

  res.json({ id, name, email, lastName, role, created_at });
};

export const deleteUserAccount = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  try {
    const result = await query(
      "DELETE FROM users WHERE id = $1 RETURNING id;",
      [userId]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      success: true,
      message: "User account and related data deleted.",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ error: "Failed to delete user account." });
  }
};

export const appleLogin = async (req: Request, res: Response) => {
  const { identityToken, fullName } = req.body;

  if (!identityToken) {
    return res.status(400).json({ error: "Missing identityToken" });
  }

  const expectedAudiences =
    process.env.NODE_ENV === "production"
      ? [process.env.APPLE_CLIENT_ID!]
      : [process.env.APPLE_CLIENT_ID!, "host.exp.Exponent"];

  try {
    const appleResponse = await appleSignin.verifyIdToken(identityToken, {
      audience: expectedAudiences,
      ignoreExpiration: false,
    });

    const { sub: appleUserId, email } = appleResponse;

    if (!appleUserId) {
      return res.status(400).json({ error: "Invalid Apple response" });
    }

    // Use placeholder email if not provided
    const randomId = crypto.randomBytes(4).toString("hex");
    const safeEmail =
      email || `user-${appleUserId}-${randomId}@placeholder.com`;

    // Check if user exists by email
    let result = await query(`SELECT * FROM users WHERE email = $1`, [
      safeEmail,
    ]);
    let user = result[0];
    let isNew = false;

    if (!user) {
      isNew = true;

      // Only fullName.givenName is typically provided
      const name = fullName?.givenName || "Apple";
      const lastName = fullName?.familyName || "User";

      // Insert new user without password or role
      const insertResult = await query(
        `INSERT INTO users (name, "lastName", email, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, lastName, safeEmail, "", "Client"]
      );

      user = insertResult[0];
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    return res.status(200).json({
      token,
      isNew,
      user: {
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    console.error("Apple login error:", err);
    return res
      .status(500)
      .json({ error: "Apple login failed", details: message });
  }
};

export const setUserRole = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { role } = req.body;

  if (!["Client", "Business"].includes(role)) {
    return res.status(400).json({ error: "Invalid role provided" });
  }

  try {
    const result = await query(
      `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, "lastName", email, role, created_at`,
      [role, userId]
    );

    return res.status(200).json({ user: result[0] });
  } catch (err) {
    console.error("Failed to update user role:", err);
    return res.status(500).json({ error: "Failed to update role" });
  }
};
