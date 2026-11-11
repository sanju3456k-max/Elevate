import { Router } from "express";
import driveRouter from "./drive.js";
import shareRouter from "./share.js";
import leaderboardRouter from "./leaderboard.js";
import aiRootRouter from "./ai/index.js";
import notesRouter from "./ai/notes.js";
import chatbotRouter from "./ai/chatbot.js";
import imageRouter from "./ai/image.js";
import testRouter from "./ai/test.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Rate limiters: generous for regular users, prevents automated quota draining
const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "AI service request limit reached. Please wait a minute before making more requests."
});

const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 180,
  message: "Too many requests. Please slow down and try again in a moment."
});

// Modular Routes
router.use("/drive", generalRateLimiter, driveRouter);
router.use("/share", generalRateLimiter, shareRouter);
router.use("/leaderboard", generalRateLimiter, leaderboardRouter);
router.use("/ai", aiRateLimiter, aiRootRouter);

// Flat Routes (Backward Compatibility with existing frontend API calls)
// These ensure /api/generate-image, /api/ai/chat-stream, /api/gemini/chatbot etc continue to work
router.use("/", aiRateLimiter, imageRouter);                 // /api/generate-image
router.use("/ai", aiRateLimiter, notesRouter);               // /api/ai/chat-stream, /api/ai/notes-assistant-stream
router.use("/gemini/chatbot", aiRateLimiter, chatbotRouter); // /api/gemini/chatbot
router.use("/gemini", aiRateLimiter, chatbotRouter);         // /api/gemini, /api/gemini/chatbot
router.use("/gemini", aiRateLimiter, notesRouter);           // /api/gemini/generate
router.use("/chatbot", aiRateLimiter, chatbotRouter);        // /api/chatbot
router.use("/", aiRateLimiter, testRouter);                  // /api/generate-diagram, /api/ai-edit-test

export default router;
