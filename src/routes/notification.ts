import express from "express";
import { authenticateToken } from "../middleware/auth";
import { savePushToken } from "../controllers/notification";

const router = express.Router();

router.patch("/token", authenticateToken, savePushToken);

export default router;
