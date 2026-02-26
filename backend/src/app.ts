import express from "express";
import cors from "cors";
import helmet from "helmet";
import createRateLimiter from "./utils/rateLimiter";

const app = express();
app.set("trust proxy", 1);
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(helmet());

app.use(cors({
  origin: "*",   // allow all (for development)
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

app.use(createRateLimiter({
  capacity: 20,
  refillRate: 5
}));

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date()
  });
});

export default app;