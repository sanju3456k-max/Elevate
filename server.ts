import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import routes from "./server/routes/index.js";
import pwaRoutes from "./server/routes/pwa.js";
import { attachLiveWebSocket } from "./server/routes/live.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Routes
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), service: "Theta Notes Backend" });
  });

  // MCB Synthetic UX Audit Reports API (Human & Turbo JSON + Screenshots)
  app.get("/api/audit-reports", (_req, res) => {
    const reportsDir = path.resolve(process.cwd(), "scripts", "synthetic-tester", "reports");
    const readReport = (filename: string) => {
      try {
        const full = path.join(reportsDir, filename);
        if (!fs.existsSync(full)) return null;
        const parsed = JSON.parse(fs.readFileSync(full, "utf8"));
        if (Array.isArray(parsed.screenshots)) {
          parsed.screenshots = parsed.screenshots.map((s: any) => ({
            ...s,
            url: `/api/audit-screenshot?file=${encodeURIComponent(path.basename(String(s.path || "")))}`,
          }));
        }
        return parsed;
      } catch {
        return null;
      }
    };
    res.json({
      human: readReport("latest-human.json"),
      turbo: readReport("latest-turbo.json"),
      latest: readReport("latest-audit.json"),
    });
  });

  app.get("/api/audit-screenshot", (req, res) => {
    const rawFile = String(req.query.file || "");
    const safeName = path.basename(rawFile);
    if (!safeName || !safeName.endsWith(".png")) {
      return res.status(400).send("Invalid screenshot file");
    }
    const imgPath = path.resolve(process.cwd(), "scripts", "synthetic-tester", "reports", "screenshots", safeName);
    if (!fs.existsSync(imgPath)) {
      return res.status(404).send("Screenshot not found");
    }
    return res.sendFile(imgPath);
  });

  // Mount modular routes
  app.use("/api", routes);

  // Mount PWA routes (manifest, sw.js) at root
  app.use("/", pwaRoutes);

  // Serve local KaTeX bundle directly so iframes and print popups load instantly offline
  const katexDistPath = path.join(process.cwd(), "node_modules", "katex", "dist");
  if (fs.existsSync(katexDistPath)) {
    app.use("/katex", express.static(katexDistPath));
  }

  // Vite middleware for development vs static build for production
  const distIndexPath = path.join(process.cwd(), "dist", "index.html");
  const hasDist = fs.existsSync(distIndexPath);
  const isProduction = process.env.NODE_ENV === "production" || (hasDist && process.env.VITE_DEV !== "true");

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: false,
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      app.use("*", async (req, res, next) => {
        const url = req.originalUrl;
        try {
          const indexHtmlPath = path.resolve(process.cwd(), "index.html");
          if (fs.existsSync(indexHtmlPath)) {
            let template = fs.readFileSync(indexHtmlPath, "utf-8");
            template = await vite.transformIndexHtml(url, template);
            res.status(200).set({ "Content-Type": "text/html" }).end(template);
          } else {
            next();
          }
        } catch (e: any) {
          vite.ssrFixStacktrace(e);
          next(e);
        }
      });
    } catch (viteErr) {
      console.warn("Vite middleware failed to initialize, falling back to static build:", viteErr);
      const distPath = path.join(process.cwd(), "dist");
      if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
      }
      app.get("*", (_req, res) => {
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(200).send("<!DOCTYPE html><html><head><title>Theta Notes Studio</title></head><body><div id='root'></div></body></html>");
        }
      });
    }
  } else {
    const candidatePaths = [
      path.join(process.cwd(), "dist"),
      path.join(process.cwd(), "build"),
      path.resolve(__dirname, "dist"),
      path.resolve(__dirname, "build"),
    ];

    const distPath = candidatePaths.find((p) => fs.existsSync(path.join(p, "index.html"))) || path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    app.get("*", (_req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath, (err) => {
          if (err && !res.headersSent) {
            res.status(500).send("Error loading app");
          }
        });
      } else {
        res.status(200).send("<!DOCTYPE html><html><head><title>Theta Notes Studio</title></head><body><div id='root'></div></body></html>");
      }
    });
  }

  process.on("uncaughtException", (err) => {
    console.error("Server uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Server unhandled rejection:", reason);
  });

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Modular Server running on http://0.0.0.0:${PORT}`);
  });
  attachLiveWebSocket(httpServer);
}

startServer().catch((err) => {
  console.error("Fatal error starting server:", err);
});
