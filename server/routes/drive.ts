import { Router } from "express";

const router = Router();

// Google Drive Media Stream Proxy
// Allows secure client-side preview of authenticated Google Drive images, PDFs, and files without CORS errors
router.get("/media/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || typeof fileId !== "string") {
      return res.status(400).json({ error: "Missing or invalid fileId parameter" });
    }

    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;
    const token = queryToken || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : "");

    if (!token) {
      // Stream public / shared Google Drive files directly without requiring an OAuth token
      const publicUrls = [
        `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(fileId)}`,
        `https://docs.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
      ];
      for (const pUrl of publicUrls) {
        try {
          const pubRes = await fetch(pUrl, { redirect: "follow" });
          if (pubRes.ok) {
            const cType = pubRes.headers.get("content-type") || "application/pdf";
            res.setHeader("Content-Type", cType);
            res.setHeader("Cache-Control", "public, max-age=3600");
            res.setHeader("Access-Control-Allow-Origin", "*");
            const arr = await pubRes.arrayBuffer();
            return res.send(Buffer.from(arr));
          }
        } catch {}
      }
      return res.status(401).json({ error: "Authentication token required to stream Google Drive file" });
    }

    // 1. Fetch file metadata first to check MIME type and handle Google Docs vs binary files
    let metaMime = "";
    try {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,name,size&supportsAllDrives=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        metaMime = meta?.mimeType || "";
      }
    } catch (e) {
      // Continue to direct media fetch
    }

    // 2. If it's a Google Doc or Workspace file, export as PDF
    let fetchUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`;
    if (metaMime.startsWith("application/vnd.google-apps")) {
      fetchUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`;
    }

    const driveRes = await fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!driveRes.ok) {
      const errBody = await driveRes.text();
      return res.status(driveRes.status).json({
        error: "Google Drive request failed",
        status: driveRes.status,
        details: errBody,
      });
    }

    const contentType =
      driveRes.headers.get("content-type") ||
      metaMime ||
      "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const arrayBuffer = await driveRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return res.send(buffer);
  } catch (err: any) {
    console.error("Error in /api/drive/media/:fileId:", err);
    return res.status(500).json({ error: err.message || "Internal server error streaming Drive file" });
  }
});

export default router;
