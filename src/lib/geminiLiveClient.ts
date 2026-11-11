/**
 * Gemini Multimodal Live Client - Enterprise Real-Time Audio Engine
 * 
 * Key Architecture:
 * 1. Persistent Web Audio Context - Never closed on disconnect to prevent mobile browser gesture expiration
 * 2. Synchronous Gesture Unlock - prepareAudioContext() unfreezes audio before async token fetches
 * 3. 16kHz Hardware Downsampler - Maps native mic rates (48kHz Android, 44.1kHz iOS) to exact 16,000 Hz PCM16
 * 4. Continuous VoIP Packet Streaming - 100ms chunks (~1600 samples) sent directly without dropping quiet speech
 * 5. thinkingBudget: 0 - Eliminates 3-5s thinking pause, returning instant neural speech
 * 6. Dual Transcriptions - Real-time inputAudioTranscription and outputAudioTranscription for live on-screen text
 * 7. Server Barge-In - Instant cutoff of audio buffer queue when user speaks during playback
 */


export type GeminiLiveVoice = 'Aoede' | 'Kore' | 'Puck' | 'Fenrir' | 'Charon';
export type GeminiLiveStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'paused' | 'error';

export interface GeminiLiveCallbacks {
  onStatusChange?: (status: GeminiLiveStatus) => void;
  onTranscript?: (text: string, isAssistant: boolean) => void;
  onInterrupted?: (detail?: { userText: string; assistantText: string }) => void;
  onTurnComplete?: (detail?: { userText: string; assistantText: string }) => void;
  onVolumeChange?: (volume: number, isAssistant: boolean) => void;
  onError?: (errMessage: string) => void;
}

/**
 * Box-filtered linear downsampler from arbitrary hardware rate (48000 / 44100 Hz) to 16,000 Hz PCM16
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
  // Persistent full-duplex AudioContext (kept alive across sessions for instant restarts on mobile)
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private silenceGain: GainNode | null = null;
  private isCapturingMic: boolean = false;
  private isMuted: boolean = false;
  private isConnected: boolean = false;
  private isExplicitlyClosed: boolean = false;
  private isDirectGoogleWs: boolean = false;
  private status: GeminiLiveStatus = 'idle';

  // Audio queue tracking for gapless 24kHz neural audio playback
  private nextPlaybackTime: number = 0;
  private activeAudioSources: AudioBufferSourceNode[] = [];
  private accumulatedAssistantText: string = '';
  private accumulatedUserText: string = '';

  // 100ms packet aggregation buffer for 16kHz audio (~1600 samples per packet)
  private pcmAccumulator: number[] = [];

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
   * Synchronously prepare & resume AudioContext inside the user touch/click gesture.
   * MUST be called synchronously on user action to satisfy mobile browser autoplay policies.
   */
  public prepareAudioContext() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
    } catch (e) {
      console.warn('prepareAudioContext note:', e);
    }
  }

  /**
   * Connect to Gemini Live session.
   * Acquires ephemeral token and connects directly to Google edge CDN via WebSockets.
   */
  public async connect(options?: {
    voice?: GeminiLiveVoice;
    systemInstruction?: string;
  }): Promise<boolean> {
    // If already connected, do a clean disconnect of the active stream/session first
    if (this.isConnected || this.session || this.ws) {
      this.disconnect();
    }

    this.setStatus('connecting');

    // 1. Ensure AudioContext is ready and resumed
    this.prepareAudioContext();

    // 2. Acquire microphone stream with Hardware Acoustic Echo Cancellation
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

    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {}
    }

    const voice = options?.voice || 'Aoede';
    const systemInstruction = options?.systemInstruction ||
      "You are Theta, an ultra-responsive, friendly, and encouraging AI math tutor in a direct live voice conversation. Answer promptly and concisely in 1 to 3 clear spoken sentences. Do not use markdown, code blocks, bullet points, asterisks, or formulas formatted as code; speak math naturally and conversationally (e.g. say 'x squared plus five' instead of latex). Respond immediately to the user's questions without filler introductory phrases.";

    this.accumulatedAssistantText = '';
    this.accumulatedUserText = '';

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
      return new Promise<boolean>((resolve) => {
        try {
          console.log('Connecting to Google Gemini Multimodal Live API via Direct WebSocket...');
          const directWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;
          const ws = new WebSocket(directWsUrl);
          this.ws = ws;
          this.isDirectGoogleWs = true;

          ws.onopen = () => {
            console.log('Connected directly to Google Gemini Multimodal Live API WebSocket!');
            const setupMessage = {
              setup: {
                model: 'models/gemini-2.5-flash-native-audio-latest',
                generationConfig: {
                  responseModalities: ['AUDIO'],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: {
                        voiceName: voice
                      }
                    }
                  },
                  thinkingConfig: {
                    thinkingBudget: 0
                  }
                },
                systemInstruction: {
                  parts: [{ text: systemInstruction }]
                }
              }
            };
            ws.send(JSON.stringify(setupMessage));
          };

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);

              if (msg.setupComplete) {
                console.log('Gemini Live setup confirmed.');
                this.isConnected = true;
                this.setStatus('listening');
                this.startMicrophoneCapture();
                resolve(true);
                return;
              }

              if (msg.serverContent) {
                const content = msg.serverContent;

                // Native Server Barge-In (Interrupted by user speech)
                if (content.interrupted) {
                  console.log('Gemini Live server detected user voice barge-in (interrupted).');
                  const interruptedUser = this.accumulatedUserText;
                  const interruptedAssistant = this.accumulatedAssistantText;
                  this.stopAllAudioPlayback();
                  this.accumulatedAssistantText = '';
                  this.accumulatedUserText = '';
                  this.setStatus('listening');
                  this.callbacks.onInterrupted?.({ userText: interruptedUser, assistantText: interruptedAssistant });
                  return;
                }

                // Real-time transcript of user's spoken words
                if (content.inputTranscription?.text) {
                  this.accumulatedUserText += content.inputTranscription.text;
                  this.callbacks.onTranscript?.(this.accumulatedUserText, false);
                }

                // Real-time transcript of assistant's spoken words
                if (content.outputTranscription?.text) {
                  this.accumulatedAssistantText += content.outputTranscription.text;
                  this.callbacks.onTranscript?.(this.accumulatedAssistantText, true);
                }

                // Incoming Audio chunks
                if (content.modelTurn?.parts) {
                  for (const part of content.modelTurn.parts) {
                    if (part.inlineData?.data) {
                      this.playPcm24kChunk(part.inlineData.data);
                    }
                    if (part.text && !part.thought && !content.outputTranscription) {
                      this.accumulatedAssistantText += part.text;
                      this.callbacks.onTranscript?.(this.accumulatedAssistantText, true);
                    }
                  }
                }

                // Turn Complete
                if (content.turnComplete) {
                  const finalUser = this.accumulatedUserText;
                  const finalAssistant = this.accumulatedAssistantText;
                  this.accumulatedAssistantText = '';
                  this.accumulatedUserText = '';
                  this.callbacks.onTurnComplete?.({ userText: finalUser, assistantText: finalAssistant });
                  if (this.activeAudioSources.length === 0) {
                    this.setStatus('listening');
                  }
                }
              }
            } catch (err) {
              console.warn('Error processing Gemini Live message:', err);
            }
          };

          ws.onerror = (err) => {
            if (this.isExplicitlyClosed) return;
            console.error('Gemini Live WebSocket error:', err);
            if (this.isConnected) {
              this.setStatus('error');
              this.callbacks.onError?.('Network connection issue with Gemini Live server.');
            }
            resolve(false);
          };

          ws.onclose = (e) => {
            if (this.isExplicitlyClosed) return;
            console.log('Gemini Live WebSocket closed:', e);
            const wasConnected = this.isConnected;
            this.disconnect();
            if (wasConnected && e?.code === 1008) {
              this.callbacks.onError?.('Live talk paused due to inactivity. Tap the live icon to resume.');
            }
            resolve(false);
          };
        } catch (wsErr) {
          console.error('Failed to create direct Gemini Live WebSocket:', wsErr);
          resolve(false);
        }
      });
    }

    // 4. Fallback for local development proxy only (if running on localhost)
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocalhost) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/gemini/live-ws`;

      return new Promise((resolve) => {
        try {
          const ws = new WebSocket(wsUrl);
          this.ws = ws;
          this.isDirectGoogleWs = false;

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
                this.accumulatedAssistantText = '';
                this.setStatus('listening');
                this.callbacks.onInterrupted?.();
              } else if (msg.type === 'audio_chunk') {
                this.playPcm24kChunk(msg.data);
              } else if (msg.type === 'text_chunk') {
                this.accumulatedAssistantText += msg.text;
                this.callbacks.onTranscript?.(this.accumulatedAssistantText, true);
              } else if (msg.type === 'turn_complete') {
                this.accumulatedAssistantText = '';
                this.accumulatedUserText = '';
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
            if (this.isExplicitlyClosed) return;
            console.error('Gemini Live WebSocket proxy error:', err);
            this.setStatus('error');
            this.callbacks.onError?.('Network connection issue with Gemini Live server.');
            resolve(false);
          };

          ws.onclose = () => {
            if (this.isExplicitlyClosed) return;
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

    this.setStatus('error');
    this.callbacks.onError?.('Unable to establish connection to Gemini Live server.');
    return false;
  }

  /**
   * Start 16kHz linear PCM microphone streaming with real-time downsampling & continuous 100ms packet delivery
   */
  private startMicrophoneCapture() {
    if (!this.audioContext || !this.mediaStream) return;
    if (this.isCapturingMic) return;

    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      // Clean up previous capture nodes if any
      if (this.scriptProcessor) {
        try { this.scriptProcessor.disconnect(); } catch {}
        this.scriptProcessor = null;
      }
      if (this.silenceGain) {
        try { this.silenceGain.disconnect(); } catch {}
        this.silenceGain = null;
      }
      if (this.mediaStreamSource) {
        try { this.mediaStreamSource.disconnect(); } catch {}
        this.mediaStreamSource = null;
      }

      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      const inputSampleRate = this.audioContext.sampleRate || 48000;
      // Buffer size: 2048 samples at input rate (~42ms at 48kHz, ~128ms at 16kHz)
      const processor = this.audioContext.createScriptProcessor(2048, 1, 1);
      this.scriptProcessor = processor;
      this.isCapturingMic = true;

      this.pcmAccumulator = [];

      processor.onaudioprocess = (e) => {
        if (!this.isConnected || this.isMuted) return;

        const inputChannel = e.inputBuffer.getChannelData(0);

        // 1. Calculate RMS volume for visualizer waves
        let sumSquares = 0;
        for (let i = 0; i < inputChannel.length; i++) {
          sumSquares += inputChannel[i] * inputChannel[i];
        }
        const rms = Math.sqrt(sumSquares / inputChannel.length);
        this.callbacks.onVolumeChange?.(Math.min(1, rms * 6), false);

        // 2. Downsample from hardware rate (48kHz/44.1kHz) to exact 16,000 Hz PCM16
        const downsampled16k = downsampleTo16k(inputChannel, inputSampleRate);

        for (let i = 0; i < downsampled16k.length; i++) {
          this.pcmAccumulator.push(downsampled16k[i]);
        }

        // When accumulated ~1280 samples (80ms of 16kHz audio), send packet for lower turnaround latency
        if (this.pcmAccumulator.length >= 1280) {
          const packetSamples = new Int16Array(this.pcmAccumulator);
          this.pcmAccumulator = [];
          this.sendPcmPacket(packetSamples);
        }
      };

      this.mediaStreamSource.connect(processor);

      // Route through a zero-gain node before destination to prevent microphone audio 
      // from feeding back into the speaker while keeping the ScriptProcessor alive
      const silenceGain = this.audioContext.createGain();
      silenceGain.gain.value = 0;
      this.silenceGain = silenceGain;
      processor.connect(silenceGain);
      silenceGain.connect(this.audioContext.destination);
    } catch (err) {
      console.error('Error starting microphone capture:', err);
      this.isCapturingMic = false;
    }
  }

  /**
   * Transmit a 16kHz PCM audio packet over the active connection
   */
  private sendPcmPacket(packet: Int16Array) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (this.isDirectGoogleWs) {
        const base64Data = arrayBufferToBase64(packet.buffer);
        this.ws.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Data,
              }
            ]
          }
        }));
      } else {
        this.ws.send(packet.buffer);
      }
    }
  }

  /**
   * Play incoming base64 24kHz 16-bit mono PCM audio from Gemini Live
   */
  private playPcm24kChunk(base64Data: string) {
    if (!this.audioContext) return;

    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

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
      this.callbacks.onVolumeChange?.(Math.min(1, rms * 6), true);

      // Create AudioBuffer at Gemini's native 24kHz rate
      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.copyToChannel(float32Array, 0);

      const currentTime = this.audioContext.currentTime;
      // Start immediately on first chunk or maintain gapless queue
      if (this.nextPlaybackTime < currentTime || this.activeAudioSources.length === 0) {
        this.nextPlaybackTime = currentTime;
      }

      const sourceNode = this.audioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.audioContext.destination);

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
    if (this.audioContext) {
      this.nextPlaybackTime = this.audioContext.currentTime;
    }
  }

  /**
   * Send a direct text prompt or user directive into the live context
   */
  public sendTextPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.accumulatedUserText = trimmed;
    this.callbacks.onTranscript?.(trimmed, false);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (this.isDirectGoogleWs) {
        this.ws.send(JSON.stringify({
          clientContent: {
            turns: [
              {
                role: 'user',
                parts: [{ text: trimmed }]
              }
            ],
            turnComplete: true
          }
        }));
      } else {
        this.ws.send(JSON.stringify({
          type: 'client_content',
          text: trimmed,
        }));
      }
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
   * Disconnect the active streaming session and microphone tracks,
   * while keeping the AudioContext alive for instant subsequent restarts on mobile.
   */
  public disconnect() {
    this.isExplicitlyClosed = true;
    this.isConnected = false;
    this.isCapturingMic = false;
    this.stopAllAudioPlayback();

    this.pcmAccumulator = [];
    this.accumulatedAssistantText = '';
    this.accumulatedUserText = '';

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch {}
      this.scriptProcessor = null;
    }

    if (this.silenceGain) {
      try {
        this.silenceGain.disconnect();
      } catch {}
      this.silenceGain = null;
    }

    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect();
      } catch {}
      this.mediaStreamSource = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.mediaStream = null;
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
