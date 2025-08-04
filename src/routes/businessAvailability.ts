import express from "express";
import {
  deleteAvailabilityDay,
  getAvailability,
  updateAvailabilityDay,
  upsertAvailability,
} from "../controllers/businessAvailability";

const router = express.Router();

// GET /businesses/:businessId/availability
router.get("/:businessId/availability", getAvailability);

// POST /businesses/:businessId/availability (bulk upsert)
router.post("/:businessId/availability", upsertAvailability);

// PUT /businesses/:businessId/availability/:day
router.put("/:businessId/availability/:day", updateAvailabilityDay);

// DELETE /businesses/:businessId/availability/:day
router.delete("/:businessId/availability/:day", deleteAvailabilityDay);

export default router;
