import express from "express";
import {
  addFavorite,
  getFavorites,
  removeFavorite,
} from "../controllers/favorites";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

router.post("/", authenticateToken, addFavorite);
router.get("/", authenticateToken, getFavorites);
router.delete("/:businessId", authenticateToken, removeFavorite);

export default router;
