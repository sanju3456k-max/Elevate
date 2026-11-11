/**
 * Gemini Multimodal Live Client - Real-Time Low Latency Engine
 * 
 * Optimizations for instantaneous spoken conversation:
 * 1. thinkingBudget: 0 - completely eliminates the 3-5 second thinking delay, returning audio immediately
 * 2. Hardware Sample-Rate Downsampler - downsamples native mic rates (48kHz Android, 44.1kHz iOS/Mac)
 *    to exact 16,000 Hz 16-bit linear PCM with anti-aliasing box filter (prevents 3x slowed-down rumble)
 * 3. 100ms Packet Aggregation (~1600 samples) - optimal VoIP transmission cadence without network flooding
 * 4. Client-side VAD Gate - cleanly detects speech and stops streaming continuous noise in silence
 * 5. Direct Ephemeral Token Connection to Google CDN - zero server proxy latency
 * 6. Instant Server-side Barge-In & Web Audio playback queue cancellation
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

/**
 * High-fidelity linear downsampler from arbitrary hardware rate (48000 / 44100 Hz) to 16,000 Hz PCM16
 */
function downsampleTo16k(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === 16000) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  const sampleRatio = inputSampleRate / 16000;
  const newLength = Math.round(input.length / sampleRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetInput = 0;

  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * sampleRatio);
    let sum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      sum += input[i];
      count++;
    }
    const sample = count > 0 ? sum / count : input[offsetInput] || 0;
    const s = Math.max(-1, Math.min(1, sample));
    result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    offsetResult++;
    offsetInput = nextOffsetInput;
  }

  return result;
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

  // Audio queue tracking for gapless 24kHz neural audio playback
  private nextPlaybackTime: number = 0;
  private activeAudioSources: AudioBufferSourceNode[] = [];
  private accumulatedAssistantText: string = '';

  // 100ms packet aggregation buffer for 16kHz audio (~1600 samples per packet)
  private pcmAccumulator: number[] = [];
  private hasSpokenInTurn: boolean = false;
  private lastSpeechTimestamp: number = 0;
  private trailingSilenceSent: boolean = false;

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
   * Acquires ephemeral token from server and opens direct WebSocket to Google edge CDN.
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
      this.inputAudioContext = new AudioCtx();
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

    const voice = options?.voice || 'Aoede';
    const systemInstruction = options?.systemInstruction ||
      'You are Theta, a fast, intelligent, conversational, and highly encouraging AI math tutor. Keep your spoken responses concise, direct, and conversational (typically 1 to 3 sentences). Avoid markdown formatting, asterisks, bullet points, and tables in spoken conversation unless explicitly asked.';

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
        console.log('Connecting to Google Gemini Live using ephemeral token (Zero-Thinking Realtime Mode)...');
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
            thinkingConfig: {
              thinkingBudget: 0 // Eliminate thinking latency for instant speech response
            },
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            }
          },
          callbacks: {
            onopen: () => {
              console.log('Connected directly to Google Gemini Multimodal Live API in Real-Time Mode!');
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
   * Start 16kHz linear PCM microphone streaming with real-time downsampling & 100ms packet aggregation
   */
  private startMicrophoneCapture() {
    if (!this.inputAudioContext || !this.mediaStream) return;

    try {
      const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
      const inputSampleRate = this.inputAudioContext.sampleRate || 48000;
      // Buffer size: 2048 samples at input rate (~42ms at 48kHz, ~128ms at 16kHz)
      const processor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);
      this.scriptProcessor = processor;

      this.pcmAccumulator = [];
      this.hasSpokenInTurn = false;
      this.lastSpeechTimestamp = 0;
      this.trailingSilenceSent = false;

      processor.onaudioprocess = (e) => {
        if (!this.isConnected || this.isMuted) return;

        const inputChannel = e.inputBuffer.getChannelData(0);

        // 1. Calculate RMS volume for visualizer waves and VAD gating
        let sumSquares = 0;
        for (let i = 0; i < inputChannel.length; i++) {
          sumSquares += inputChannel[i] * inputChannel[i];
        }
        const rms = Math.sqrt(sumSquares / inputChannel.length);
        this.callbacks.onVolumeChange?.(Math.min(1, rms * 5), false);

        // 2. Downsample from hardware rate (e.g. 48kHz / 44.1kHz) to exact 16,000 Hz PCM16
        const downsampled16k = downsampleTo16k(inputChannel, inputSampleRate);

        // 3. VAD Activity Detection
        const isVoiceActive = rms > 0.012;
        const now = Date.now();

        if (isVoiceActive) {
          this.hasSpokenInTurn = true;
          this.lastSpeechTimestamp = now;
          this.trailingSilenceSent = false;
        }

        // Only stream when user is speaking or within 600ms grace period after speaking
        const isWithinSpeechWindow = this.hasSpokenInTurn && (now - this.lastSpeechTimestamp < 600);

        if (isVoiceActive || isWithinSpeechWindow) {
          for (let i = 0; i < downsampled16k.length; i++) {
            this.pcmAccumulator.push(downsampled16k[i]);
          }

          // When accumulated ~1600 samples (100ms of 16kHz audio), transmit packet
          if (this.pcmAccumulator.length >= 1600) {
            const packetSamples = new Int16Array(this.pcmAccumulator);
            this.pcmAccumulator = [];
            this.sendPcmPacket(packetSamples);
          }
        } else if (this.hasSpokenInTurn && !this.trailingSilenceSent && (now - this.lastSpeechTimestamp >= 600)) {
          // Send 200ms of trailing comfort silence to ensure clean word endpointing
          this.trailingSilenceSent = true;
          const silenceSamples = new Int16Array(3200); // 200ms of 16kHz silence
          this.sendPcmPacket(silenceSamples);
          this.hasSpokenInTurn = false;
        }
      };

      source.connect(processor);
      processor.connect(this.inputAudioContext.destination);
    } catch (err) {
      console.error('Error starting microphone capture:', err);
    }
  }

  /**
   * Transmit a 16kHz PCM audio packet over the active connection
   */
  private sendPcmPacket(packet: Int16Array) {
    if (this.session) {
      const base64Data = arrayBufferToBase64(packet.buffer);
      this.session.sendRealtimeInput({
        media: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Data
          }
        ]
      });
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet.buffer);
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
      // Start immediately on first chunk or maintain gapless queue
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

    this.pcmAccumulator = [];
    this.hasSpokenInTurn = false;
    this.lastSpeechTimestamp = 0;

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
