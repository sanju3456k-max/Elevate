import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";

export function setupLiveWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({
    server,
    path: "/api/gemini/live-ws"
  });

  console.log("Gemini Multimodal Live WebSocket server initialized on /api/gemini/live-ws");

  wss.on("connection", async (clientWs: WebSocket, req) => {
    console.log("Client connected to Gemini Live WebSocket from", req.socket.remoteAddress);

    if (!apiKey) {
      console.error("Gemini API key is not configured on server.");
      clientWs.send(JSON.stringify({ type: "error", message: "Gemini API key is not configured on server." }));
      clientWs.close();
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    let session: any = null;
    let isSessionAlive = false;

    // Default voice: Aoede (warm natural tone), can be chosen by client in handshake
    let selectedVoice = "Aoede";

    clientWs.on("message", async (data, isBinary) => {
      try {
        if (isBinary) {
          // Binary audio chunk (16kHz 16-bit mono PCM from client AudioWorklet)
          if (session && isSessionAlive) {
            const base64Data = (data as Buffer).toString("base64");
            session.sendRealtimeInput({
              media: [
                {
                  mimeType: "audio/pcm;rate=16000",
                  data: base64Data
                }
              ]
            });
          }
          return;
        }

        const msg = JSON.parse(data.toString());

        if (msg.type === "init") {
          const voiceMap: Record<string, string> = {
            vega: "Aoede",
            Vega: "Aoede",
            aoede: "Aoede",
            Aoede: "Aoede",
            kore: "Kore",
            Kore: "Kore",
            puck: "Puck",
            Puck: "Puck",
            fenrir: "Fenrir",
            Fenrir: "Fenrir",
            charon: "Charon",
            Charon: "Charon"
          };
          selectedVoice = voiceMap[msg.voice] || "Aoede";
          const systemInstruction = msg.systemInstruction || 
            "You are Theta, an intelligent, conversational, and highly encouraging AI math tutor. Keep your spoken responses concise, direct, and conversational (typically 2 to 3 sentences). Avoid markdown formatting, asterisks, bullet points, and tables in spoken conversation unless explicitly asked.";

          try {
            session = await ai.live.connect({
              model: "models/gemini-2.5-flash-native-audio-latest",
              config: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: selectedVoice
                    }
                  }
                },
                systemInstruction: {
                  parts: [{ text: systemInstruction }]
                }
              },
              callbacks: {
                onopen: () => {
                  console.log("Gemini Multimodal Live session opened with voice:", selectedVoice);
                  isSessionAlive = true;
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: "ready", voice: selectedVoice }));
                  }
                },
                onmessage: (serverMsg: any) => {
                  if (!isSessionAlive || clientWs.readyState !== WebSocket.OPEN) return;

                  if (serverMsg.serverContent) {
                    const content = serverMsg.serverContent;

                    // 1. Native Server Barge-In (Interrupted by user speech)
                    if (content.interrupted) {
                      console.log("Gemini Live server detected user voice barge-in (interrupted).");
                      clientWs.send(JSON.stringify({ type: "interrupted" }));
                      return;
                    }

                    // 2. Incoming Audio and Text chunks
                    if (content.modelTurn?.parts) {
                      for (const part of content.modelTurn.parts) {
                        if (part.inlineData) {
                          clientWs.send(JSON.stringify({
                            type: "audio_chunk",
                            mimeType: part.inlineData.mimeType,
                            data: part.inlineData.data
                          }));
                        }
                        if (part.text && !part.thought) {
                          clientWs.send(JSON.stringify({
                            type: "text_chunk",
                            text: part.text
                          }));
                        }
                      }
                    }

                    // 3. Turn Complete
                    if (content.turnComplete) {
                      clientWs.send(JSON.stringify({ type: "turn_complete" }));
                    }
                  }
                },
                onerror: (err: any) => {
                  console.error("Gemini Live session error:", err?.message || err);
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: "error", message: err?.message || "Live session error" }));
                  }
                },
                onclose: (e: any) => {
                  console.log("Gemini Live session closed code:", e?.code, "reason:", e?.reason);
                  isSessionAlive = false;
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: "closed", code: e?.code, reason: e?.reason }));
                  }
                }
              }
            });
          } catch (initErr: any) {
            console.error("Failed to initialize Gemini Live session:", initErr?.message || initErr);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "error", message: initErr?.message || "Failed to start Live session" }));
            }
          }
        } else if (msg.type === "client_content") {
          // Direct text or contextual injection from client
          if (session && isSessionAlive && msg.text) {
            session.sendClientContent({
              turns: [
                {
                  role: "user",
                  parts: [{ text: msg.text }]
                }
              ],
              turnComplete: true
            });
          }
        } else if (msg.type === "realtime_input") {
          // Base64 audio chunk via JSON
          if (session && isSessionAlive && msg.data) {
            session.sendRealtimeInput({
              media: [
                {
                  mimeType: msg.mimeType || "audio/pcm;rate=16000",
                  data: msg.data
                }
              ]
            });
          }
        }
      } catch (err: any) {
        console.error("Error processing client WebSocket message:", err?.message || err);
      }
    });

    clientWs.on("close", () => {
      console.log("Client disconnected from Live WebSocket.");
      isSessionAlive = false;
      if (session?.conn) {
        try {
          session.conn.close();
        } catch {}
        session = null;
      }
    });

    clientWs.on("error", (err) => {
      console.warn("Client WebSocket error:", err?.message || err);
      isSessionAlive = false;
      if (session?.conn) {
        try {
          session.conn.close();
        } catch {}
        session = null;
      }
    });
  });

  return wss;
}
