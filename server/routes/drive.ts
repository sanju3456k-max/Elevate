import { Router } from "express";
import crypto from "crypto";

const router = Router();

// In-memory LRU-style cache for streamed files to guarantee sub-5ms repeat access
interface CachedFile {
  buffer: Buffer;
  contentType: string;
  etag: string;
  timestamp: number;
}
const fileCache = new Map<string, CachedFile>();
const MAX_CACHE_ENTRIES = 40;
const MAX_CACHED_FILE_SIZE = 25 * 1024 * 1024; // 25MB max per cached file

function getFromCache(key: string): CachedFile | null {
  const item = fileCache.get(key);
  if (!item) return null;
  // Expire after 2 hours
  if (Date.now() - item.timestamp > 2 * 60 * 60 * 1000) {
    fileCache.delete(key);
    return null;
  }
  return item;
}

function setToCache(key: string, buffer: Buffer, contentType: string, etag: string) {
  if (buffer.length > MAX_CACHED_FILE_SIZE) return;
  if (fileCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest
    const oldestKey = fileCache.keys().next().value;
    if (oldestKey) fileCache.delete(oldestKey);
  }
  fileCache.set(key, {
    buffer,
    contentType,
    etag,
    timestamp: Date.now(),
  });
}

/**
 * Inspect magic bytes of buffer to detect true content type
 */
function detectMimeType(buf: Buffer, fallback = "application/octet-stream"): string {
  if (buf.length >= 4) {
    // PDF: %PDF-
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
      return "application/pdf";
    }
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return "image/jpeg";
    }
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return "image/png";
    }
    // GIF: GIF8
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
      return "image/gif";
    }
    // WEBP: RIFF....WEBP
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) {
      return "image/webp";
    }
  }

  // Check for HTML document
  const headStr = buf.slice(0, 500).toString("utf-8").trim().toLowerCase();
  if (headStr.startsWith("<!doctype html") || headStr.startsWith("<html")) {
    return "text/html";
  }

  return fallback;
}

/**
 * Fetch a public Google Drive file directly, handling redirects and virus scan confirmation tokens
 */
async function fetchPublicDriveFile(fileId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const candidateUrls = [
    // 1. Direct Google Usercontent Download endpoint
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0&confirm=t`,
    // 2. Google Docs export endpoint for PDF
    `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/export?format=pdf`,
    // 3. Google Spreadsheets export
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/export?format=pdf`,
    // 4. Standard uc?export=download
    `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(fileId)}`,
    // 5. Alternate docs.google.com uc export
    `https://docs.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(fileId)}`,
    // 6. Direct thumbnail / high-res CDN for images
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`,
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w2560`,
  ];

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/pdf,image/*,*/*;q=0.8",
        },
      });

      if (!response.ok) continue;

      const rawBuffer = Buffer.from(await response.arrayBuffer());
      if (rawBuffer.length === 0) continue;

      const detected = detectMimeType(rawBuffer, response.headers.get("content-type") || "application/octet-stream");

      // If Google returned an HTML page (e.g. virus warning or prompt), parse for confirmation link
      if (detected === "text/html") {
        const html = rawBuffer.toString("utf-8");

        // Try extracting confirm form (with hidden uuid/confirm inputs) or direct link
        const formActionMatch = html.match(/action="([^"]*drive\.usercontent\.google\.com\/download[^"]*)"/i);
        const confirmMatch =
          html.match(/href="(\/download\?[^"]*confirm=[^"]*)"/) ||
          html.match(/id="uc-download-link"\s+href="([^"]+)"/);

        let nextUrl = "";
        if (formActionMatch && formActionMatch[1]) {
          const baseAction = formActionMatch[1].replace(/&amp;/g, "&");
          const params = new URLSearchParams();
          const inputRegex = /<input[^>]+type=["']hidden["'][^>]*>/gi;
          let inp: RegExpExecArray | null;
          while ((inp = inputRegex.exec(html)) !== null) {
            const nameMatch = inp[0].match(/name=["']([^"']+)["']/i);
            const valMatch = inp[0].match(/value=["']([^"']*)["']/i);
            if (nameMatch?.[1]) {
              params.set(nameMatch[1], (valMatch?.[1] || "").replace(/&amp;/g, "&"));
            }
          }
          if (!params.has("id")) params.set("id", fileId);
          if (!params.has("export")) params.set("export", "download");
          if (!params.has("confirm")) params.set("confirm", "t");
          const sep = baseAction.includes("?") ? "&" : "?";
          nextUrl = `${baseAction}${sep}${params.toString()}`;
        } else if (confirmMatch && confirmMatch[1]) {
          nextUrl = confirmMatch[1].replace(/&amp;/g, "&");
          if (nextUrl.startsWith("/")) {
            nextUrl = `https://drive.google.com${nextUrl}`;
          }
        }

        if (nextUrl) {
          const confirmedRes = await fetch(nextUrl, {
            redirect: "follow",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/pdf,image/*,*/*;q=0.8",
            },
          });
          if (confirmedRes.ok) {
            const confirmedBuf = Buffer.from(await confirmedRes.arrayBuffer());
            const confirmedType = detectMimeType(confirmedBuf, "application/pdf");
            if (confirmedType !== "text/html") {
              return { buffer: confirmedBuf, contentType: confirmedType };
            }
          }
        }
        // If still HTML, continue to next candidate URL
        continue;
      }

      return { buffer: rawBuffer, contentType: detected };
    } catch {
      // Continue to next candidate
    }
  }

  return null;
}

function extractDriveIdFromUrl(urlOrId: string): string {
  if (!urlOrId) return "";
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) return trimmed;
  const dMatch = trimmed.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return "";
}

/**
 * Handle streaming logic for a fileId or external URL
 */
async function handleStream(req: any, res: any, fileId: string, externalUrl?: string) {
  const resolvedFileId = fileId || (externalUrl ? extractDriveIdFromUrl(externalUrl) : "");
  const cacheKey = resolvedFileId ? `drive_${resolvedFileId}` : `url_${externalUrl}`;

  // Check In-Memory Cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    if (req.headers["if-none-match"] === cached.etag) {
      return res.status(304).end();
    }
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("ETag", cached.etag);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.send(cached.buffer);
  }

  let fileBuffer: Buffer | null = null;
  let mimeType = "application/octet-stream";

  // Case 1: External URL (Firebase, AWS, direct PDF link)
  if (externalUrl && !resolvedFileId) {
    try {
      const extRes = await fetch(externalUrl, { redirect: "follow" });
      if (extRes.ok) {
        const candidateBuf = Buffer.from(await extRes.arrayBuffer());
        const detectedExt = detectMimeType(candidateBuf, extRes.headers.get("content-type") || "application/pdf");
        if (detectedExt !== "text/html") {
          fileBuffer = candidateBuf;
          mimeType = detectedExt;
        }
      }
    } catch (e: any) {
      return res.status(502).json({ error: "Failed to fetch external document", details: e?.message });
    }
  }

  // Case 2: Google Drive File
  if (!fileBuffer && resolvedFileId) {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;
    const token = queryToken || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : "");

    if (token) {
      // Authenticated fetch via Google Drive API
      try {
        let fetchUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(resolvedFileId)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`;
        const driveRes = await fetch(fetchUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (driveRes.ok) {
          const authBuf = Buffer.from(await driveRes.arrayBuffer());
          const authType = detectMimeType(authBuf, driveRes.headers.get("content-type") || "application/pdf");
          if (authType !== "text/html") {
            fileBuffer = authBuf;
            mimeType = authType;
          }
        }
      } catch {}
    }

    // If no token or token fetch failed, try robust public streaming pipeline
    if (!fileBuffer) {
      const publicResult = await fetchPublicDriveFile(resolvedFileId);
      if (publicResult) {
        fileBuffer = publicResult.buffer;
        mimeType = publicResult.contentType;
      }
    }
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    return res.status(404).json({
      error: "Unable to load document",
      message: "The document could not be retrieved from Google Drive or source URL.",
    });
  }

  // Calculate ETag
  const etag = `"${crypto.createHash("md5").update(fileBuffer).digest("hex")}"`;

  // Store in cache
  setToCache(cacheKey, fileBuffer, mimeType, etag);

  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }

  res.setHeader("Content-Type", mimeType);
  res.setHeader("ETag", etag);
  res.setHeader("Content-Length", fileBuffer.length);
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  return res.send(fileBuffer);
}

// 1. Primary endpoint: /api/drive/stream?fileId=... or /api/drive/stream?url=...
router.get("/stream", async (req, res) => {
  const fileId = (req.query.fileId as string) || "";
  const url = (req.query.url as string) || "";
  return handleStream(req, res, fileId, url);
});

// 2. Path parameter endpoint: /api/drive/media/:fileId (backward-compatible)
router.get("/media/:fileId", async (req, res) => {
  const { fileId } = req.params;
  return handleStream(req, res, fileId);
});

// 3. Fast high-res image thumbnail endpoint: /api/drive/thumbnail/:fileId
router.get("/thumbnail/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const sz = (req.query.sz as string) || "w2000";
  const cdnUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${sz}`;
  try {
    const thumbRes = await fetch(cdnUrl, { redirect: "follow" });
    if (thumbRes.ok) {
      const buf = Buffer.from(await thumbRes.arrayBuffer());
      res.setHeader("Content-Type", thumbRes.headers.get("content-type") || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=604800");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.send(buf);
    }
  } catch {}
  return res.redirect(`https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`);
});

// 4. Auto-Title / Metadata resolution endpoint: /api/drive/metadata?url=...
router.get("/metadata", async (req, res) => {
  const rawUrl = ((req.query.url as string) || "").trim();
  const explicitFileId = ((req.query.fileId as string) || "").trim();
  const driveId = explicitFileId || extractDriveIdFromUrl(rawUrl);

  if (!rawUrl && !driveId) {
    return res.status(400).json({ error: "Missing url or fileId" });
  }

  let title = "";
  let kind: "drive" | "youtube" | "url" = "url";

  const cleanTitleString = (t: string) =>
    t
      .replace(/\s*[-–|]\s*(Google Drive|Google Docs|Google Sheets|Google Slides|YouTube)\s*$/i, "")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .trim();

  // Case A: Google Drive / Docs / Sheets / Slides
  if (driveId) {
    kind = "drive";
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;
    const token = queryToken || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : "");

    // 1. Authenticated Drive v3 API metadata lookup (works even on restricted/private files)
    if (token) {
      try {
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?fields=name,mimeType&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (metaRes.ok) {
          const metaJson = (await metaRes.json()) as { name?: string };
          if (metaJson?.name && metaJson.name.trim()) {
            return res.json({ title: metaJson.name.trim(), kind, driveFileId: driveId });
          }
        }
      } catch {}
    }

    const viewUrls = [
      rawUrl && (rawUrl.includes("docs.google.com") || rawUrl.includes("drive.google.com"))
        ? rawUrl
        : `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/view`,
      `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/view`,
    ];

    for (const vUrl of viewUrls) {
      try {
        const viewRes = await fetch(vUrl, {
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        if (viewRes.ok) {
          const html = await viewRes.text();
          const ogMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          const candidate = cleanTitleString((ogMatch?.[1] || titleMatch?.[1] || "").trim());
          if (
            candidate &&
            !/^(Google Drive|Meet Google Drive|Sign in|Access denied|Error)/i.test(candidate)
          ) {
            title = candidate;
            break;
          }
        }
      } catch {}
    }

    // Fallback: Check Content-Disposition filename from download headers
    if (!title) {
      try {
        const headRes = await fetch(
          `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`,
          { method: "HEAD", redirect: "follow" }
        );
        const cd = headRes.headers.get("content-disposition") || "";
        const fnStar = cd.match(/filename\*=UTF-8''([^;]+)/i);
        const fnPlain = cd.match(/filename=["']?([^"';]+)["']?/i);
        const rawName = fnStar?.[1] ? decodeURIComponent(fnStar[1]) : fnPlain?.[1] || "";
        if (rawName && rawName.trim()) {
          title = rawName.trim();
        }
      } catch {}
    }

    return res.json({ title, kind, driveFileId: driveId });
  }

  // Case B: YouTube link
  if (/(?:youtube\.com|youtu\.be)/i.test(rawUrl)) {
    kind = "youtube";
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`
      );
      if (oembedRes.ok) {
        const data = (await oembedRes.json()) as { title?: string };
        if (data?.title) {
          title = cleanTitleString(data.title);
        }
      }
    } catch {}
    return res.json({ title, kind, driveFileId: "" });
  }

  // Case C: Generic URL (extract filename from Content-Disposition or URL path)
  try {
    const parsed = new URL(rawUrl);
    const lastSeg = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    if (lastSeg && lastSeg.includes(".")) {
      title = lastSeg;
    }
  } catch {}

  if (!title && rawUrl.startsWith("http")) {
    try {
      const headRes = await fetch(rawUrl, { method: "HEAD", redirect: "follow" });
      const cd = headRes.headers.get("content-disposition") || "";
      const fnMatch = cd.match(/filename=["']?([^"';]+)["']?/i);
      if (fnMatch?.[1]) {
        title = fnMatch[1].trim();
      }
    } catch {}
  }

  return res.json({ title, kind, driveFileId: "" });
});

export default router;
