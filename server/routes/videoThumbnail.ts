import { Router, Request, Response } from "express";

const router = Router();

// Secret salt for reversible XOR token scrambling
const OBFUSCATION_SALT = "EDUPULSE_SECURE_TOKEN_v1";

/**
 * Server-side token deobfuscation
 * Matches src/lms/security.ts algorithm
 */
function deobfuscateVideoKey(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const trimmed = token.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  // 1. Try standard XOR decode
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("latin1");
    let output = "";
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ OBFUSCATION_SALT.charCodeAt(i % OBFUSCATION_SALT.length);
      output += String.fromCharCode(charCode);
    }
    const candidate = decodeURIComponent(output).trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(candidate)) return candidate;
    const match = candidate.match(/[a-zA-Z0-9_-]{11}/);
    if (match) return match[0];
  } catch {}

  // 2. Try plain base64
  try {
    const plain = Buffer.from(trimmed, "base64").toString("utf-8").trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(plain)) return plain;
  } catch {}

  return null;
}

// In-memory LRU cache to prevent spamming YouTube CDN for thumbnail bytes
const thumbnailCache = new Map<string, { buffer: Buffer; contentType: string }>();

router.get("/", async (req: Request, res: Response) => {
  try {
    const rawToken = (req.query.token as string) || (req.query.id as string) || "";
    if (!rawToken) {
      return res.status(400).send("Missing token");
    }

    const videoId = deobfuscateVideoKey(rawToken);
    if (!videoId) {
      return res.status(404).send("Invalid video token");
    }

    const quality = (req.query.quality as string) || "hq";
    let filename = "hqdefault.jpg";
    if (quality === "maxres") filename = "maxresdefault.jpg";
    else if (quality === "sd") filename = "sddefault.jpg";

    const cacheKey = `${videoId}_${filename}`;
    if (thumbnailCache.has(cacheKey)) {
      const cached = thumbnailCache.get(cacheKey)!;
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, immutable");
      return res.send(cached.buffer);
    }

    // Direct server-side fetch from YouTube CDN (Client never talks to img.youtube.com directly)
    const ytUrl = `https://img.youtube.com/vi/${videoId}/${filename}`;
    let ytRes = await fetch(ytUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    // If maxres or sd failed, fallback to standard hqdefault
    if (!ytRes.ok && filename !== "hqdefault.jpg") {
      ytRes = await fetch(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
    }

    if (!ytRes.ok) {
      return res.status(404).send("Thumbnail not found");
    }

    const arrayBuffer = await ytRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = ytRes.headers.get("content-type") || "image/jpeg";

    // Keep cache size bounded
    if (thumbnailCache.size > 250) {
      const firstKey = thumbnailCache.keys().next().value;
      if (firstKey) thumbnailCache.delete(firstKey);
    }
    thumbnailCache.set(cacheKey, { buffer, contentType });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, immutable");
    return res.send(buffer);
  } catch (err: any) {
    return res.status(500).send("Failed to stream thumbnail");
  }
});

export default router;
