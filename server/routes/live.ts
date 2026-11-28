import { Router } from "express";
import type { Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";

const OBFUSCATION_SALT = "EDUPULSE_SECURE_TOKEN_v1";

function getYouTubeApiKey(): string {
  return (process.env.YOUTUBE_API_KEY || "").trim();
}

function getYouTubeOAuthToken(): string {
  return (process.env.YOUTUBE_OAUTH_TOKEN || "").trim();
}

function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = String(urlOrId).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const directIdWithParams = trimmed.match(/^([a-zA-Z0-9_-]{11})(?:[?&#].*)?$/);
  if (directIdWithParams && directIdWithParams[1]) return directIdWithParams[1];

  const regExp =
    /(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|live|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(regExp);
  return match && match[1] ? match[1] : null;
}

function obfuscateVideoKey(rawId: string): string {
  const encoded = encodeURIComponent(rawId);
  let output = "";
  for (let i = 0; i < encoded.length; i++) {
    const charCode = encoded.charCodeAt(i) ^ OBFUSCATION_SALT.charCodeAt(i % OBFUSCATION_SALT.length);
    output += String.fromCharCode(charCode);
  }
  return Buffer.from(output, "binary").toString("base64");
}

export interface LiveChatMessageRecord {
  id: string;
  liveClassId: string;
  senderName: string;
  senderRole: "admin" | "student";
  message: string;
  timestamp: string;
  source: "app" | "youtube";
}

interface LiveSessionRecord {
  id: string;
  title: string;
  description: string;
  instructorName: string;
  batchIds: string[];
  encryptedVideoId: string;
  thumbnailUrl: string;
  startedAt: string;
  isLive: boolean;
  activeLiveChatId: string | null;
  ytChatSyncStatus: "synced" | "no_api_key" | "no_active_chat" | "error";
  nextPageToken: string | null;
  messages: LiveChatMessageRecord[];
  seenMessageIds: Set<string>;
}

const activeLiveClasses = new Map<string, LiveSessionRecord>();
const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();
const roomClients = new Map<string, Set<WebSocket>>();

function addClientToRoom(roomId: string, ws: WebSocket) {
  let clients = roomClients.get(roomId);
  if (!clients) {
    clients = new Set();
    roomClients.set(roomId, clients);
  }
  clients.add(ws);
}

function removeClientFromAllRooms(ws: WebSocket) {
  for (const [roomId, clients] of roomClients.entries()) {
    clients.delete(ws);
    if (clients.size === 0) {
      roomClients.delete(roomId);
    }
  }
}

function broadcastToRoom(roomId: string, payload: unknown) {
  const clients = roomClients.get(roomId);
  if (!clients) return;
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

function sanitizeSessionForClient(session: LiveSessionRecord) {
  return {
    id: session.id,
    title: session.title,
    description: session.description,
    instructorName: session.instructorName,
    batchIds: session.batchIds,
    encryptedVideoId: session.encryptedVideoId,
    thumbnailUrl: session.thumbnailUrl,
    startedAt: session.startedAt,
    isLive: session.isLive,
    ytChatSyncStatus: session.ytChatSyncStatus,
  };
}

function appendChatMessage(session: LiveSessionRecord, msg: LiveChatMessageRecord): boolean {
  if (session.seenMessageIds.has(msg.id)) return false;
  session.seenMessageIds.add(msg.id);
  session.messages.push(msg);

  if (session.messages.length > 250) {
    const removed = session.messages.shift();
    if (removed) session.seenMessageIds.delete(removed.id);
  }

  broadcastToRoom(session.id, {
    type: "chat_message",
    message: msg,
  });
  return true;
}

async function resolveYouTubeLiveChatId(videoId: string): Promise<{
  chatId: string | null;
  status: LiveSessionRecord["ytChatSyncStatus"];
}> {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) {
    return { chatId: null, status: "no_api_key" };
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(
      videoId
    )}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[YT Live Chat] videos.list failed (${res.status})`);
      return { chatId: null, status: "error" };
    }
    const data: any = await res.json();
    const chatId = data?.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
    if (!chatId) {
      return { chatId: null, status: "no_active_chat" };
    }
    return { chatId, status: "synced" };
  } catch (err: any) {
    console.warn("[YT Live Chat] Error resolving liveChatId:", err?.message || err);
    return { chatId: null, status: "error" };
  }
}

function startYouTubeChatPoller(session: LiveSessionRecord) {
  const apiKey = getYouTubeApiKey();
  if (!session.activeLiveChatId || !apiKey) return;

  const poll = async () => {
    const current = activeLiveClasses.get(session.id);
    if (!current || !current.isLive || !current.activeLiveChatId) return;

    let nextDelayMs = 4000;
    try {
      let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(
        current.activeLiveChatId
      )}&part=snippet,authorDetails&maxResults=50&key=${encodeURIComponent(apiKey)}`;

      if (current.nextPageToken) {
        url += `&pageToken=${encodeURIComponent(current.nextPageToken)}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data: any = await res.json();
        current.nextPageToken = data.nextPageToken || current.nextPageToken;
        nextDelayMs = Math.max(2500, Number(data.pollingIntervalMillis) || 4000);

        const items = Array.isArray(data.items) ? data.items : [];
        for (const item of items) {
          const text = item?.snippet?.displayMessage;
          if (!text) continue;
          appendChatMessage(current, {
            id: `yt_${item.id}`,
            liveClassId: current.id,
            senderName: item?.authorDetails?.displayName || "YouTube Viewer",
            senderRole:
              item?.authorDetails?.isChatOwner || item?.authorDetails?.isChatModerator
                ? "admin"
                : "student",
            message: text,
            timestamp: item?.snippet?.publishedAt || new Date().toISOString(),
            source: "youtube",
          });
        }
      } else if (res.status === 403 || res.status === 404) {
        current.ytChatSyncStatus = "no_active_chat";
        broadcastToRoom(current.id, {
          type: "sync_status",
          ytChatSyncStatus: current.ytChatSyncStatus,
        });
        return;
      }
    } catch {
      nextDelayMs = 6000;
    }

    if (activeLiveClasses.has(session.id)) {
      const timer = setTimeout(poll, nextDelayMs);
      pollTimers.set(session.id, timer);
    }
  };

  poll();
}

async function relayMessageToYouTube(
  activeLiveChatId: string,
  senderName: string,
  messageText: string
): Promise<boolean> {
  const oauthToken = getYouTubeOAuthToken();
  if (!oauthToken || !activeLiveChatId) return false;
  try {
    const res = await fetch("https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          liveChatId: activeLiveChatId,
          type: "textMessageEvent",
          textMessageDetails: {
            messageText: `[${senderName}]: ${messageText}`,
          },
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const liveRouter = Router();

liveRouter.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

liveRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    activeLiveCount: activeLiveClasses.size,
    hasYouTubeApiKey: Boolean(getYouTubeApiKey()),
  });
});

liveRouter.post("/start", async (req, res) => {
  const { title, description, youtubeUrl, batchIds, instructorName } = req.body || {};

  const videoId = extractYouTubeId(youtubeUrl);
  if (!videoId) {
    return res.status(400).json({ error: "Invalid YouTube stream URL or Video ID." });
  }
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "Live class title is required." });
  }
  if (!Array.isArray(batchIds) || batchIds.length === 0) {
    return res.status(400).json({ error: "Select at least one target batch." });
  }

  const { chatId, status } = await resolveYouTubeLiveChatId(videoId);
  const liveClassId = `live_${Date.now()}`;

  const session: LiveSessionRecord = {
    id: liveClassId,
    title: String(title).trim(),
    description: String(description || "Interactive Live Class Session").trim(),
    instructorName: String(instructorName || "Elevate Labs Faculty").trim(),
    batchIds,
    encryptedVideoId: obfuscateVideoKey(videoId),
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    startedAt: new Date().toISOString(),
    isLive: true,
    activeLiveChatId: chatId,
    ytChatSyncStatus: status,
    nextPageToken: null,
    messages: [],
    seenMessageIds: new Set(),
  };

  activeLiveClasses.set(liveClassId, session);

  appendChatMessage(session, {
    id: `sys_${Date.now()}`,
    liveClassId,
    senderName: session.instructorName,
    senderRole: "admin",
    message: `Live class "${session.title}" has started! Ask your doubts in the chat below.`,
    timestamp: new Date().toISOString(),
    source: "app",
  });

  if (chatId) {
    startYouTubeChatPoller(session);
  }

  const clientSession = sanitizeSessionForClient(session);
  broadcastToRoom("global", {
    type: "live_class_started",
    liveClass: clientSession,
  });

  return res.status(201).json({ liveClass: clientSession });
});

liveRouter.post("/stop", (req, res) => {
  const { liveClassId } = req.body || {};
  const session = activeLiveClasses.get(liveClassId);
  if (!session) {
    return res.status(404).json({ error: "Live class not found." });
  }

  const timer = pollTimers.get(liveClassId);
  if (timer) {
    clearTimeout(timer);
    pollTimers.delete(liveClassId);
  }

  session.messages = [];
  session.seenMessageIds.clear();
  activeLiveClasses.delete(liveClassId);

  broadcastToRoom(liveClassId, { type: "live_class_ended", liveClassId });
  broadcastToRoom("global", { type: "live_class_ended", liveClassId });

  return res.json({ ok: true, liveClassId });
});

liveRouter.get("/active", (req, res) => {
  const role = req.query.role === "admin" ? "admin" : "student";
  const batchIdsParam = typeof req.query.batchIds === "string" ? req.query.batchIds : "";
  const enrolledBatchIds = batchIdsParam ? batchIdsParam.split(",").filter(Boolean) : [];

  const list = [];
  for (const session of activeLiveClasses.values()) {
    if (!session.isLive) continue;
    const isAllowed =
      role === "admin" || session.batchIds.some((bid) => enrolledBatchIds.includes(bid));
    if (isAllowed) {
      list.push(sanitizeSessionForClient(session));
    }
  }

  res.json({ liveClasses: list });
});

liveRouter.get("/:id/chat", (req, res) => {
  const session = activeLiveClasses.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Live class not found or ended." });
  }
  res.json({
    messages: session.messages,
    ytChatSyncStatus: session.ytChatSyncStatus,
  });
});

liveRouter.post("/:id/chat", async (req, res) => {
  const session = activeLiveClasses.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Live class not found or ended." });
  }

  const { senderName, senderRole, message } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Message cannot be empty." });
  }

  const msgObj: LiveChatMessageRecord = {
    id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    liveClassId: session.id,
    senderName: String(senderName || "Student").trim(),
    senderRole: senderRole === "admin" ? "admin" : "student",
    message: String(message).trim().slice(0, 500),
    timestamp: new Date().toISOString(),
    source: "app",
  };

  appendChatMessage(session, msgObj);

  if (session.activeLiveChatId && getYouTubeOAuthToken()) {
    relayMessageToYouTube(session.activeLiveChatId, msgObj.senderName, msgObj.message);
  }

  res.status(201).json({ message: msgObj });
});

export function attachLiveWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    addClientToRoom("global", ws);

    ws.on("message", async (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        if (data.type === "subscribe" && data.liveClassId) {
          addClientToRoom(data.liveClassId, ws);
          const session = activeLiveClasses.get(data.liveClassId);
          if (session) {
            ws.send(
              JSON.stringify({
                type: "chat_history",
                messages: session.messages,
                ytChatSyncStatus: session.ytChatSyncStatus,
              })
            );
          }
        }

        if (data.type === "chat_message" && data.liveClassId && data.message) {
          const session = activeLiveClasses.get(data.liveClassId);
          if (!session) return;

          const msgObj: LiveChatMessageRecord = {
            id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            liveClassId: session.id,
            senderName: String(data.senderName || "Student").trim(),
            senderRole: data.senderRole === "admin" ? "admin" : "student",
            message: String(data.message).trim().slice(0, 500),
            timestamp: new Date().toISOString(),
            source: "app",
          };

          appendChatMessage(session, msgObj);

          if (session.activeLiveChatId && getYouTubeOAuthToken()) {
            relayMessageToYouTube(session.activeLiveChatId, msgObj.senderName, msgObj.message);
          }
        }
      } catch {
        // ignore malformed packets
      }
    });

    ws.on("close", () => {
      removeClientFromAllRooms(ws);
    });
  });

  console.log(
    `📡 Live WebSocket ready at /ws | YouTube Data API v3: ${
      getYouTubeApiKey() ? "Configured" : "Not Set (Local Chat Mode)"
    }`
  );
}

export default liveRouter;
