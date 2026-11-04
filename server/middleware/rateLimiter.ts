import { Request, Response, NextFunction } from "express";

export interface RateLimitOptions {
  windowMs: number; // Duration of window in milliseconds
  max: number;      // Max allowed requests per window
  message?: string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

/**
 * Lightweight, zero-dependency in-memory sliding-window rate limiter
 * Protects backend AI routes and general APIs from automated abuse/DDoS
 * without affecting regular interactive user sessions.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = "Too many requests. Please slow down and try again shortly."
  } = options;

  const hits = new Map<string, ClientRecord>();

  // Periodically clean up expired records to prevent unbounded memory growth
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(ip);
      }
    }
  }, 3 * 60 * 1000);

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // Determine client identifier: X-Forwarded-For or remote socket address
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (
      typeof forwarded === "string" 
        ? forwarded.split(",")[0].trim() 
        : Array.isArray(forwarded) 
          ? forwarded[0] 
          : req.socket?.remoteAddress
    ) || "127.0.0.1";

    const now = Date.now();
    let record = hits.get(ip);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      hits.set(ip, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader("X-RateLimit-Limit", max.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000).toString());

    if (record.count > max) {
      res.setHeader("Retry-After", retryAfterSec.toString());
      res.status(429).json({
        error: message,
        retryAfter: retryAfterSec,
      });
      return;
    }

    next();
  };
}
