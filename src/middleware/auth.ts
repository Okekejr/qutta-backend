import { NextFunction, Response, Request } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    lastName: string;
    email: string;
    role: string;
    created_at: string;
  };
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  jwt.verify(token, process.env.JWT_SECRET!, (err, decoded: any) => {
    if (err || !decoded?.id) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    req.user = {
      id: decoded.id,
      name: decoded.name,
      lastName: decoded.lastName,
      email: decoded.email,
      role: decoded.role,
      created_at: decoded.created_at,
    };

    next();
  });
};
