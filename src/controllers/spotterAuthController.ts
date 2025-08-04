import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../config/db";
import { AuthRequest } from "../middleware/auth";

const JWT_SECRET = process.env.JWT_SECRET || "qutta_secret";

export const registerSpotter = async (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO usersSpotter (email, name, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [email, name, hashed]
    );
    const user = result[0];
    const token = jwt.sign(user, JWT_SECRET!, { expiresIn: "7d" });
    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: "Email may already exist." });
  }
};

export const loginSpotter = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await query("SELECT * FROM usersSpotter WHERE email = $1", [
    email,
  ]);

  const user = result[0];
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    token,
  });
};

export const checkEmailExistsSpotter = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ exists: false, error: "Email is required" });
  }

  try {
    const result = await query("SELECT 1 FROM usersSpotter WHERE email = $1", [
      email,
    ]);
    const exists = result.length > 0;
    res.json({ exists });
  } catch (err) {
    console.error("Error checking email:", err);
    res.status(500).json({ exists: false, error: "Server error" });
  }
};
