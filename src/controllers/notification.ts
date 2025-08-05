import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { query } from "../config/db";

export const savePushToken = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  try {
    await query(`UPDATE users SET push_token = $1 WHERE id = $2`, [
      token,
      userId,
    ]);

    res.status(200).json({ message: "Push token saved successfully" });
  } catch (err) {
    console.error("Error saving push token:", err);
    res.status(500).json({ error: "Failed to save push token" });
  }
};
