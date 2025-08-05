import express from "express";
import {
  register,
  login,
  checkEmailExists,
  authUser,
  deleteUserAccount,
  appleLogin,
  setUserRole,
} from "../controllers/authController";
import {
  checkEmailExistsSpotter,
  loginSpotter,
  registerSpotter,
} from "../controllers/spotterAuthController";
import { authenticateToken } from "../middleware/auth";
const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/appleLogin", appleLogin);
router.patch("/setRole", authenticateToken, setUserRole);
router.post("/checkEmail", checkEmailExists);
router.get("/me", authenticateToken, authUser);
router.delete("/delete", authenticateToken, deleteUserAccount);
router.post("/registerSpotter", registerSpotter);
router.post("/loginSpotter", loginSpotter);
router.post("/checkEmailSpotter", checkEmailExistsSpotter);

export default router;
