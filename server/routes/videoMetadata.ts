import { Router, Request, Response } from "express";

const router = Router();

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

router.get("/", async (req: Request, res: Response) => {
  try {
    const rawUrl = (req.query.url as string) || (req.query.id as string) || "";
    if (!rawUrl) {
      return res.status(400).json({ success: false, error: "Missing video url or id" });
    }

    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      return res.status(400).json({ success: false, error: "Invalid YouTube URL or ID" });
    }

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
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
          return res.json({
            success: true,
            videoId,
            title: decodeHtmlEntities(data.title || "Lecture Video"),
            durationMinutes: 30,
            durationSeconds: 1800,
            thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          });
        }
      } catch {}
      return res.status(502).json({ success: false, error: "Failed to fetch YouTube page" });
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

    return res.json({
      success: true,
      videoId,
      title: cleanTitle,
      durationMinutes,
      durationSeconds,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Internal server error" });
  }
});

export default router;
