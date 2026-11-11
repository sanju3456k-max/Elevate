/**
 * Gemini Multimodal Live Client
 * Implements the official Google Gemini Live architecture:
 * - Primary: Direct WebSockets to Google Gemini Live API via short-lived Ephemeral Token
 *   (bypasses Vercel serverless limitations, zero hops, ultra-low latency)
 * - Fallback: Bidirectional proxy via local WebSocket server (/api/gemini/live-ws)
 * - Native 16kHz PCM audio streaming with Hardware Acoustic Echo Cancellation & Noise Suppression
 * - Native 24kHz raw neural voice playback (Vega / Aoede)
 * - Server-side Voice Activity Detection (VAD) & instant barge-in
 */

import { GoogleGenAI } from '@google/genai';

export type GeminiLiveVoice = 'Aoede' | 'Kore' | 'Puck' | 'Fenrir' | 'Charon';
export type GeminiLiveStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'paused' | 'error';

export interface GeminiLiveCallbacks {
  onStatusChange?: (status: GeminiLiveStatus) => void;
  onTranscript?: (text: string, isAssistant: boolean) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onVolumeChange?: (volume: number, isAssistant: boolean) => void;
  onError?: (errMessage: string) => void;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private session: any = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isMuted: boolean = false;
  private isConnected: boolean = false;
  private status: GeminiLiveStatus = 'idle';

  // Playback queue tracking for gapless neural audio
  private nextPlaybackTime: number = 0;
  private activeAudioSources: AudioBufferSourceNode[] = [];
  private accumulatedAssistantText: string = '';

  // Callbacks
  private callbacks: GeminiLiveCallbacks = {};

  constructor(callbacks: GeminiLiveCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: Partial<GeminiLiveCallbacks>) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getStatus(): GeminiLiveStatus {
    return this.status;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.isMuted) {
      this.setStatus('paused');
    } else {
      this.setStatus('listening');
    }
  }

  public isActive(): boolean {
    return this.isConnected;
  }

  private setStatus(newStatus: GeminiLiveStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.callbacks.onStatusChange?.(newStatus);
  }

  /**
   * Connect to Gemini Live session.
   * Requests an ephemeral token from server, connecting directly to Google's Live WebSocket.
   */
  public async connect(options?: {
    voice?: GeminiLiveVoice;
    systemInstruction?: string;
  }): Promise<boolean> {
    if (this.isConnected || this.session || this.ws) {
      this.disconnect();
    }

    this.setStatus('connecting');

    // 1. Acquire microphone stream with Hardware Acoustic Echo Cancellation & Noise Suppression
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
    } catch (err: any) {
      console.error('Failed to acquire microphone for Gemini Live:', err);
      this.setStatus('error');
      this.callbacks.onError?.('Microphone permission was denied. Please allow microphone access in browser settings.');
      return false;
    }

    // 2. Initialize Web Audio Contexts
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioCtx({ sampleRate: 16000 });
      this.outputAudioContext = new AudioCtx({ sampleRate: 24000 });

      if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume();
      }
      if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
      }
    } catch (err) {
      console.warn('AudioContext initialization note:', err);
    }

    // Map voice
    const voice = options?.voice || 'Aoede';
    const systemInstruction = options?.systemInstruction ||
      'You are Theta, an intelligent, conversational, and highly encouraging AI math tutor. Keep your spoken responses concise, direct, and conversational (typically 2 to 3 sentences). Avoid markdown formatting, asterisks, bullet points, and tables in spoken conversation unless explicitly asked.';

    // 3. Attempt Ephemeral Token flow (Works directly on Vercel, mobile, cellular networks)
    let token: string | null = null;
    try {
      const tokenRes = await fetch('/api/gemini/live-token', { method: 'POST' });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData?.token) {
          token = tokenData.token;
        }
      }
    } catch (err) {
      console.warn('Could not fetch ephemeral token from /api/gemini/live-token:', err);
    }

    if (token) {
      try {
        console.log('Connecting to Google Gemini Live using ephemeral token...');
        const clientAi = new GoogleGenAI({
          apiKey: token,
          httpOptions: { apiVersion: 'v1alpha' }
        });

        this.session = await clientAi.live.connect({
          model: 'models/gemini-2.5-flash-native-audio-latest',
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice
                }
              }
            },
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            }
          },
          callbacks: {
            onopen: () => {
              console.log('Connected directly to Google Gemini Multimodal Live API!');
              this.isConnected = true;
              this.setStatus('listening');
              this.startMicrophoneCapture();
            },
            onmessage: (msg: any) => {
              if (msg.serverContent) {
                const content = msg.serverContent;

                // Native Server Barge-In (Interrupted by user speech)
                if (content.interrupted) {
                  console.log('Gemini Live server detected user voice barge-in (interrupted).');
                  this.stopAllAudioPlayback();
                  this.setStatus('listening');
                  this.callbacks.onInterrupted?.();
                  return;
                }

                // Incoming Audio and Text chunks
                if (content.modelTurn?.parts) {
                  for (const part of content.modelTurn.parts) {
                    if (part.inlineData) {
                      this.playPcm24kChunk(part.inlineData.data);
                    }
                    if (part.text && !part.thought) {
                      this.accumulatedAssistantText += part.text;
                      this.callbacks.onTranscript?.(this.accumulatedAssistantText, true);
                    }
                  }
                }

                // Turn Complete
                if (content.turnComplete) {
                  this.accumulatedAssistantText = '';
                  this.callbacks.onTurnComplete?.();
                  if (this.activeAudioSources.length === 0) {
                    this.setStatus('listening');
                  }
                }
              }
            },
            onerror: (err: any) => {
              console.error('Gemini Live session error:', err);
              this.setStatus('error');
              this.callbacks.onError?.('Network connection issue with Gemini Live server.');
            },
            onclose: () => {
              console.log('Gemini Live session closed.');
              this.disconnect();
            }
          }
        });

        this.isConnected = true;
        this.setStatus('listening');
        this.startMicrophoneCapture();
        return true;
      } catch (directErr: any) {
        console.warn('Direct connection failed, attempting local proxy fallback:', directErr);
      }
    }

    // 4. Fallback: Connect via local WebSocket server proxy (/api/gemini/live-ws)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/gemini/live-ws`;

    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          this.isConnected = true;
          ws.send(JSON.stringify({
            type: 'init',
            voice,
            systemInstruction,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'ready') {
              this.setStatus('listening');
              this.startMicrophoneCapture();
              resolve(true);
            } else if (msg.type === 'interrupted') {
              this.stopAllAudioPlayback();
              this.setStatus('listening');
              this.callbacks.onInterrupted?.();
            } else if (msg.type === 'audio_chunk') {
              this.playPcm24kChunk(msg.data);
            } else if (msg.type === 'text_chunk') {
              this.accumulatedAssistantText += msg.text;
              this.callbacks.onTranscript?.(this.accumulatedAssistantText, true);
            } else if (msg.type === 'turn_complete') {
              this.accumulatedAssistantText = '';
              this.callbacks.onTurnComplete?.();
              if (this.activeAudioSources.length === 0) {
                this.setStatus('listening');
              }
            } else if (msg.type === 'error') {
              this.callbacks.onError?.(msg.message || 'Live session encountered an issue.');
            }
          } catch (parseErr) {
            console.warn('Failed to parse Gemini Live message:', parseErr);
          }
        };

        ws.onerror = (err) => {
          console.error('Gemini Live WebSocket proxy error:', err);
          this.setStatus('error');
          this.callbacks.onError?.('Network connection issue with Gemini Live server.');
          resolve(false);
        };

        ws.onclose = () => {
          this.disconnect();
          resolve(false);
        };
      } catch (wsErr) {
        console.error('Failed to create WebSocket proxy:', wsErr);
        this.setStatus('error');
        this.callbacks.onError?.('Unable to establish connection to Gemini Live server.');
        resolve(false);
      }
    });
  }

  /**
   * Start 16kHz linear PCM microphone streaming via ScriptProcessorNode
   */
  private startMicrophoneCapture() {
    if (!this.inputAudioContext || !this.mediaStream) return;

    try {
      const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
      // Buffer size: 2048 samples at 16kHz = ~128ms per packet
      const processor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);
      this.scriptProcessor = processor;

      processor.onaudioprocess = (e) => {
        if (!this.isConnected || this.isMuted) return;

        const inputChannel = e.inputBuffer.getChannelData(0);

        // 1. Calculate RMS volume for visualizer waves
        let sumSquares = 0;
        for (let i = 0; i < inputChannel.length; i++) {
          sumSquares += inputChannel[i] * inputChannel[i];
        }
        const rms = Math.sqrt(sumSquares / inputChannel.length);
        this.callbacks.onVolumeChange?.(Math.min(1, rms * 5), false);

        // 2. Convert Float32Array (-1.0 to +1.0) to Int16Array (-32768 to 32767)
        const pcm16 = new Int16Array(inputChannel.length);
        for (let i = 0; i < inputChannel.length; i++) {
          const s = Math.max(-1, Math.min(1, inputChannel[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // 3. Send audio chunk via active session or WebSocket proxy
        if (this.session) {
          const base64Data = arrayBufferToBase64(pcm16.buffer);
          this.session.sendRealtimeInput({
            media: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Data
              }
            ]
          });
        } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(pcm16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(this.inputAudioContext.destination);
    } catch (err) {
      console.error('Error starting microphone capture:', err);
    }
  }

  /**
   * Play incoming base64 24kHz 16-bit mono PCM audio from Gemini Live
   */
  private playPcm24kChunk(base64Data: string) {
    if (!this.outputAudioContext) return;

    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      let sumSquares = 0;
      for (let i = 0; i < float32Array.length; i++) {
        sumSquares += float32Array[i] * float32Array[i];
      }
      const rms = Math.sqrt(sumSquares / float32Array.length);
      this.callbacks.onVolumeChange?.(Math.min(1, rms * 5), true);

      const audioBuffer = this.outputAudioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.copyToChannel(float32Array, 0);

      const currentTime = this.outputAudioContext.currentTime;
      if (this.nextPlaybackTime < currentTime) {
        this.nextPlaybackTime = currentTime;
      }

      const sourceNode = this.outputAudioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.outputAudioContext.destination);

      sourceNode.start(this.nextPlaybackTime);
      this.nextPlaybackTime += audioBuffer.duration;

      this.activeAudioSources.push(sourceNode);
      this.setStatus('speaking');

      sourceNode.onended = () => {
        this.activeAudioSources = this.activeAudioSources.filter((s) => s !== sourceNode);
        if (this.activeAudioSources.length === 0 && this.status === 'speaking') {
          this.setStatus('listening');
        }
      };
    } catch (err) {
      console.warn('Error playing 24kHz PCM chunk:', err);
    }
  }

  /**
   * Stop all active and queued audio playback immediately (for Barge-In)
   */
  public stopAllAudioPlayback() {
    for (const source of this.activeAudioSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.activeAudioSources = [];
    if (this.outputAudioContext) {
      this.nextPlaybackTime = this.outputAudioContext.currentTime;
    }
  }

  /**
   * Send a direct text prompt or user directive into the live context
   */
  public sendTextPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (this.session) {
      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: trimmed }] }],
        turnComplete: true,
      });
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'client_content',
        text: trimmed,
      }));
    }
  }

  /**
   * Toggle microphone mute
   */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.setStatus('paused');
    } else {
      this.setStatus('listening');
    }
    return this.isMuted;
  }

  /**
   * Interrupt current turn manually
   */
  public interrupt() {
    this.stopAllAudioPlayback();
    this.setStatus('listening');
    this.callbacks.onInterrupted?.();
  }

  /**
   * Disconnect completely and clean up all media tracks & AudioContexts
   */
  public disconnect() {
    this.isConnected = false;
    this.stopAllAudioPlayback();

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch {}
      this.scriptProcessor = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.mediaStream = null;
    }

    if (this.inputAudioContext) {
      try {
        this.inputAudioContext.close();
      } catch {}
      this.inputAudioContext = null;
    }

    if (this.outputAudioContext) {
      try {
        this.outputAudioContext.close();
      } catch {}
      this.outputAudioContext = null;
    }

    if (this.session) {
      try {
        this.session.close?.();
      } catch {}
      this.session = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.setStatus('idle');
  }
}

export const geminiLiveClient = new GeminiLiveClient();
