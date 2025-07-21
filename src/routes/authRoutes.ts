import express from "express";
import {
  register,
  login,
  checkEmailExists,
} from "../controllers/authController";
const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/checkEmail", checkEmailExists);

export default router;
