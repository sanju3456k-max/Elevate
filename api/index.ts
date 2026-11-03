import express from "express";
import dotenv from "dotenv";
import routes from "../server/routes/index.js";

dotenv.config();

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Health check
app.get(["/health", "/api/health"], (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), service: "Theta Notes Backend (Vercel Serverless)" });
});

// Mount routes on BOTH /api and / so any URL path format works seamlessly
app.use("/api", routes);
app.use("/", routes);

export default app;
