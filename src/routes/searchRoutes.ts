import express from "express";
import {
  deleteRecentSearch,
  getRecentSearches,
  saveSearch,
} from "../controllers/userSpotterController";
import { authenticateToken } from "../middleware/auth";
const router = express.Router();

router.post("/saveSearch", authenticateToken, saveSearch);
router.get("/recent", authenticateToken, getRecentSearches);
router.delete("/:searchId", authenticateToken, deleteRecentSearch);

export default router;
