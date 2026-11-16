import { Router, Request, Response } from "express";

const router = Router();

// Secret salt for reversible XOR token scrambling
const OBFUSCATION_SALT = "EDUPULSE_SECURE_TOKEN_v1";

function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId || typeof urlOrId !== "string") return null;
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
}

function obfuscateToken(rawId: string): string {
  try {
    const encoded = encodeURIComponent(rawId);
    let output = "";
    for (let i = 0; i < encoded.length; i++) {
      const charCode = encoded.charCodeAt(i) ^ OBFUSCATION_SALT.charCodeAt(i % OBFUSCATION_SALT.length);
      output += String.fromCharCode(charCode);
    }
    return Buffer.from(output, "latin1").toString("base64");
  } catch {
    return Buffer.from(rawId).toString("base64");
  }
}

function deobfuscateToken(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const trimmed = token.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  // 1. Standard XOR decode
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

  // 2. Plain base64 fallback
  try {
    const plain = Buffer.from(trimmed, "base64").toString("utf-8").trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(plain)) return plain;
  } catch {}

  return null;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseDurationSeconds(html: string): number {
  const lenMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
  if (lenMatch && lenMatch[1]) {
    const s = parseInt(lenMatch[1], 10);
    if (!isNaN(s) && s > 0) return s;
  }

  const isoMatch = html.match(/itemprop=["']duration["']\s+content=["']PT([^"']+)["']/i);
  if (isoMatch && isoMatch[1]) {
    const m = isoMatch[1].match(/(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
    if (m) {
      const h = parseInt(m[1] || "0", 10);
      const min = parseInt(m[2] || "0", 10);
      const s = parseInt(m[3] || "0", 10);
      const total = h * 3600 + min * 60 + s;
      if (total > 0) return total;
    }
  }

  const approxMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
  if (approxMatch && approxMatch[1]) {
    const ms = parseInt(approxMatch[1], 10);
    if (!isNaN(ms) && ms > 0) return Math.round(ms / 1000);
  }

  return 0;
}

async function handleMetadataRequest(rawInput: string, res: Response) {
  if (!rawInput) {
    return res.status(400).json({ success: false, error: "Missing video input" });
  }

  // Deobfuscate token or extract YouTube ID
  let videoId = deobfuscateToken(rawInput) || extractYouTubeId(rawInput);
  if (!videoId) {
    return res.status(400).json({ success: false, error: "Invalid video identifier" });
  }

  const token = obfuscateToken(videoId);
  const cloakedThumbnailUrl = `/api/video-thumbnail?token=${encodeURIComponent(token)}`;

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const ytRes = await fetch(ytUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!ytRes.ok) {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl)}&format=json`);
        if (oembedRes.ok) {
          const data = (await oembedRes.json()) as any;
          // Notice: Video ID and raw YouTube CDN URLs are omitted from response
          return res.json({
            success: true,
            title: decodeHtmlEntities(data.title || "Lecture Video"),
            durationMinutes: 30,
            durationSeconds: 1800,
            thumbnailUrl: cloakedThumbnailUrl,
            token,
          });
        }
      } catch {}
      return res.status(502).json({ success: false, error: "Failed to fetch video details" });
    }

    const html = await ytRes.text();

    let rawTitle = "";
    const metaTitle = html.match(/<meta\s+name=["']title["']\s+content=["']([^"']+)["']/i);
    if (metaTitle && metaTitle[1]) {
      rawTitle = metaTitle[1];
    } else {
      const pageTitle = html.match(/<title>([^<]+?)(?:\s*-\s*YouTube)?<\/title>/i);
      if (pageTitle && pageTitle[1]) {
        rawTitle = pageTitle[1];
      }
    }

    const cleanTitle = decodeHtmlEntities(rawTitle.trim()) || "Lecture Video";
    const durationSeconds = parseDurationSeconds(html);
    const durationMinutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : 30;

    // Notice: Video ID is NEVER sent back in plaintext
    return res.json({
      success: true,
      title: cleanTitle,
      durationMinutes,
      durationSeconds,
      thumbnailUrl: cloakedThumbnailUrl,
      token,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Internal server error" });
  }
}

// POST endpoint (Preferred for zero plaintext leak in request headers / URLs)
router.post("/", async (req: Request, res: Response) => {
  const rawInput = (req.body?.token as string) || (req.body?.url as string) || (req.body?.id as string) || "";
  await handleMetadataRequest(rawInput, res);
});

// GET endpoint (Legacy fallback)
router.get("/", async (req: Request, res: Response) => {
  const rawInput = (req.query?.token as string) || (req.query?.url as string) || (req.query?.id as string) || "";
  await handleMetadataRequest(rawInput, res);
});

export default router;
