import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes";
import searchRoutes from "./routes/searchRoutes";
import businessRoutes from "./routes/business";
import favoriteRoutes from "./routes/favorites";
import businessAvailability from "./routes/businessAvailability";
import bookingRoute from "./routes/booking";

dotenv.config();
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

app.get("/", (req, res) => res.send("Qutta API Running"));
app.use("/api/auth", authRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/favorite", favoriteRoutes);
app.use("/api/businesses", businessAvailability);
app.use("/api/booking", bookingRoute);

server.listen(PORT, () => {
  console.log(`Server + WebSocket running on http://localhost:${PORT}`);
});
