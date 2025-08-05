import express from "express";
import { authenticateToken } from "../middleware/auth";
import { savePushToken } from "../controllers/notification";

const router = express.Router();

router.post("/token", authenticateToken, savePushToken);

export default router;
