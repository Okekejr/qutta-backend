import express from "express";
import upload from "../middleware/upload";
import {
  createBusinessProfile,
  getAllBusinesses,
  getBusinessById,
  getBusinessesByUserId,
} from "../controllers/business";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

router.post(
  "/create",
  authenticateToken,
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "staffImages", maxCount: 10 },
  ]),
  createBusinessProfile
);

router.get("/businesses", getAllBusinesses);
router.get("/:userId", getBusinessesByUserId);
router.get("/item/:id", getBusinessById);

export default router;
