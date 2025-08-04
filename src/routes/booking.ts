import express from "express";
import { authenticateToken } from "../middleware/auth";
import {
  cancelBookingById,
  createBooking,
  getBookingDetailsById,
  getClientBookings,
  getClientsForBusiness,
  getOwnerBookings,
} from "../controllers/booking";

const router = express.Router();

router.post("/create", authenticateToken, createBooking);
router.get("/getBookings", authenticateToken, getOwnerBookings);
router.get("/clients/:businessId", authenticateToken, getClientsForBusiness);
router.get("/:id", getBookingDetailsById);
router.get("/", authenticateToken, getClientBookings);
router.put("/:id/cancel", authenticateToken, cancelBookingById);

export default router;
