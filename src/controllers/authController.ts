import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../config/db";
import { AuthRequest } from "../middleware/auth";

const JWT_SECRET = process.env.JWT_SECRET || "qutta_secret";

export const register = async (req: Request, res: Response) => {
  const { name, lastName, email, password, role } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, lastName, email, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, lastName, email, role, created_at`,
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
