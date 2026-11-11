/**
 * Bulletproof, Clean Speech Recognition Engine
 *
 * Designed to eliminate all word repetitions and OS microphone dropouts/beeps.
 * - Single-pass parsing directly from event.results (no accumulative compounding)
 * - Safe lifecycle management without rapid kill/restart loops
 */

export type LiveTalkStatus = 'listening' | 'speaking' | 'paused' | 'sending';

export type GeminiVoicePersona = 'vega';

export interface VoicePersonaInfo {
  id: 'vega';
  name: string;
  gender: 'female';
  tone: string;
  description: string;
  pitch: number;
  rate: number;
}

export const GEMINI_VOICE_PERSONAS: Record<'vega', VoicePersonaInfo> = {
  vega: {
    id: 'vega',
    name: 'Vega',
    gender: 'female',
    tone: 'Warm & Melodic',
    description: 'Natural, friendly, and expressive conversational tone (Default)',
    pitch: 1.12,
    rate: 1.02,
  },
};

export function getActiveVoicePersona(): GeminiVoicePersona {
  return 'vega';
}

export function setActiveVoicePersona(_persona: GeminiVoicePersona) {
  // Vega is the dedicated voice
}

export function getSpeechRecognition(): any | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

export function isSpeechRecognitionSupported(): boolean {
  return !!getSpeechRecognition();
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Request hardware microphone access directly to prime browser permissions
 * safely without locking the microphone device on mobile Android / Chrome.
 */
export async function ensureMicrophonePermission(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return true;
  }

  // 1. Query permissions without locking the hardware microphone device
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (perm.state === 'granted') {
        return true;
      }
      if (perm.state === 'denied') {
        return false;
      }
    }
  } catch {
    // navigator.permissions.query({ name: 'microphone' }) not supported in all browsers
  }

  // 2. If getUserMedia is not supported, let SpeechRecognition prompt directly
  if (!navigator.mediaDevices?.getUserMedia) {
    return true;
  }

  // 3. Prompt or prime once if needed, but immediately release tracks cleanly
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    return true;
  } catch (err: any) {
    console.warn('Microphone permission check note:', err);
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      return false;
    }
    // For other errors (e.g. NotFoundError, AbortError, or device busy), still allow SpeechRecognition to try
    return true;
  }
}

/**
 * Dispatches non-blocking UI notifications for speech events
 */
export function notifySpeechMessage(message: string, type: 'info' | 'warning' | 'error' = 'info') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gemini-speech-notification', {
        detail: { message, type },
      })
    );
  }
}

/**
 * Remove consecutive repeating words (e.g., "the the" -> "the")
 */
export function removeConsecutiveDuplicateWords(text: string): string {
  if (!text) return '';
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const words = trimmed.split(' ');
  const deduped: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prev = deduped[deduped.length - 1];
    if (prev && prev.toLowerCase() === word.toLowerCase()) {
      continue;
    }
    deduped.push(word);
  }

  return deduped.join(' ');
}

/**
 * Remove repeating phrases / n-grams (e.g. "what is what is", "how do I how do I")
 * Commonly emitted by Mobile Chrome voice recognition engines
 */
export function removeRepeatingPhrases(text: string): string {
  if (!text) return '';
  let cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  let prev = '';
  let passes = 0;
  while (prev !== cleaned && passes < 3) {
    prev = cleaned;
    passes++;

    const words = cleaned.split(' ');
    const n = words.length;
    if (n < 2) break;

    // Check phrase lengths from Math.floor(n / 2) down to 1
    const maxPhraseLen = Math.min(Math.floor(n / 2), 15);
    let modified = false;

    for (let len = maxPhraseLen; len >= 1; len--) {
      for (let i = 0; i <= n - 2 * len; i++) {
        const phrase1 = words.slice(i, i + len).join(' ').toLowerCase();
        const phrase2 = words.slice(i + len, i + 2 * len).join(' ').toLowerCase();

        if (phrase1 === phrase2) {
          // Remove the duplicate repeating phrase
          words.splice(i + len, len);
          cleaned = words.join(' ');
          modified = true;
          break;
        }
      }
      if (modified) break;
    }
  }

  return cleaned;
}

/**
 * Merge sequential speech chunks with smart overlap and prefix deduplication.
 * This directly resolves the Android / Mobile Chrome bug where each result
 * contains a cumulative or repeating copy of the preceding words.
 */
export function mergeSpeechChunks(chunks: string[]): string {
  if (!chunks || chunks.length === 0) return '';
  const validChunks = chunks.map((c) => (c || '').trim()).filter(Boolean);
  if (validChunks.length === 0) return '';
  if (validChunks.length === 1) return validChunks[0];

  let result = validChunks[0];

  for (let i = 1; i < validChunks.length; i++) {
    const nextChunk = validChunks[i];
    if (!nextChunk) continue;

    const resLower = result.toLowerCase();
    const nextLower = nextChunk.toLowerCase();

    // 1. If nextChunk already starts with the entire accumulated result (Mobile Chrome cumulative stream)
    if (nextLower.startsWith(resLower)) {
      result = nextChunk;
      continue;
    }

    // 2. If result already ends with or fully contains nextChunk
    if (resLower.endsWith(nextLower) || resLower.includes(nextLower)) {
      continue;
    }

    // 3. Check for word-level suffix-to-prefix overlap between result and nextChunk
    const resWords = result.split(/\s+/);
    const nextWords = nextChunk.split(/\s+/);

    let maxOverlap = 0;
    const maxPossibleOverlap = Math.min(resWords.length, nextWords.length);

    for (let overlapLen = maxPossibleOverlap; overlapLen >= 1; overlapLen--) {
      const resSuffix = resWords.slice(resWords.length - overlapLen).join(' ').toLowerCase();
      const nextPrefix = nextWords.slice(0, overlapLen).join(' ').toLowerCase();

      if (resSuffix === nextPrefix) {
        maxOverlap = overlapLen;
        break;
      }
    }

    if (maxOverlap > 0) {
      // Append only the novel tail of nextChunk
      const nonOverlapping = nextWords.slice(maxOverlap).join(' ');
      if (nonOverlapping) {
        result = result + ' ' + nonOverlapping;
      }
    } else {
      // Distinct sequential phrases (Desktop Chrome standard behavior)
      result = result + ' ' + nextChunk;
    }
  }

  return result.trim();
}

/**
 * Full clean pipeline for speech transcripts
 */
export function cleanSpeechTranscript(text: string): string {
  if (!text) return '';
  const noDupPhrases = removeRepeatingPhrases(text);
  const noDupWords = removeConsecutiveDuplicateWords(noDupPhrases);
  return noDupWords.trim().replace(/\s+/g, ' ');
}

/**
 * Extract clean, non-duplicating transcript from Web Speech API recognition event
 */
export function extractCleanSpeechFromEvent(event: any): string {
  if (!event || !event.results) return '';

  const finalChunks: string[] = [];
  const interimChunks: string[] = [];

  for (let i = 0; i < event.results.length; i++) {
    const item = event.results[i];
    if (!item || !item[0]) continue;
    const transcript = (item[0].transcript || '').trim();
    if (!transcript) continue;

    if (item.isFinal) {
      finalChunks.push(transcript);
    } else {
      interimChunks.push(transcript);
    }
  }

  const mergedFinals = mergeSpeechChunks(finalChunks);
  const mergedInterim = mergeSpeechChunks(interimChunks);

  let combined = '';
  if (mergedFinals && mergedInterim) {
    combined = mergeSpeechChunks([mergedFinals, mergedInterim]);
  } else {
    combined = mergedFinals || mergedInterim;
  }

  return cleanSpeechTranscript(combined);
}

/**
 * Strips code blocks, LaTeX, markdown formatting for clean, natural Text-to-Speech
 */
export function formatTextForSpeech(rawText: string, maxLen?: number): string {
  if (!rawText) return '';

  let clean = rawText
    .replace(/```(?:test-action|json:test-action|test_action|testaction)[\s\S]*?```/gi, 'Interactive practice test prepared.')
    .replace(/```(?:mindmap|graph|chart|interactive-table)[\s\S]*?```/gi, 'Interactive diagram visual.')
    .replace(/```[\s\S]*?```/g, 'Code snippet.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\|[^\n]+\|/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, 'Math formula.')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  const limit = maxLen ?? 3500;
  if (clean.length > limit) {
    clean = clean.slice(0, limit - 5).trim() + '...';
  }

  return clean;
}

/**
 * Resolves the best available natural/neural voice mapped to a Gemini Voice Persona
 * (Vega, Kore, Puck, Charon, Fenrir)
 */
export function getGeminiVoiceForPersona(personaId?: GeminiVoicePersona): {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rate: number;
} {
  const activeId = personaId || getActiveVoicePersona();
  const persona = GEMINI_VOICE_PERSONAS[activeId] || GEMINI_VOICE_PERSONAS.vega;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { voice: null, pitch: persona.pitch, rate: persona.rate };
  }

  const voices = window.speechSynthesis.getVoices() || [];
  if (voices.length === 0) {
    return { voice: null, pitch: persona.pitch, rate: persona.rate };
  }

  let selectedVoice: SpeechSynthesisVoice | null = null;

  if (persona.gender === 'female') {
    const topFemaleNames = [
      'Google US English',
      'Google UK English Female',
      'Microsoft Jenny',
      'Microsoft Aria',
      'Microsoft Michelle',
      'Microsoft Zira',
      'Samantha',
      'Ava',
      'Victoria',
      'Karen',
      'Serena',
    ];
    for (const name of topFemaleNames) {
      selectedVoice = voices.find(
        (v) => v.name.toLowerCase().includes(name.toLowerCase()) && v.lang.startsWith('en')
      ) || null;
      if (selectedVoice) break;
    }

    if (!selectedVoice) {
      selectedVoice = voices.find(
        (v) =>
          (v.name.toLowerCase().includes('female') ||
            v.name.toLowerCase().includes('woman') ||
            v.voiceURI.toLowerCase().includes('female')) &&
          v.lang.startsWith('en')
      ) || null;
    }
  } else {
    // Male personas: Puck, Charon, Fenrir
    const topMaleNames = [
      'Google UK English Male',
      'Microsoft Guy',
      'Microsoft Ryan',
      'Microsoft Steffan',
      'Microsoft David',
      'Daniel',
      'Alex',
      'Fred',
      'Oliver',
    ];
    for (const name of topMaleNames) {
      selectedVoice = voices.find(
        (v) => v.name.toLowerCase().includes(name.toLowerCase()) && v.lang.startsWith('en')
      ) || null;
      if (selectedVoice) break;
    }

    if (!selectedVoice) {
      selectedVoice = voices.find(
        (v) =>
          (v.name.toLowerCase().includes('male') ||
            v.name.toLowerCase().includes('man') ||
            v.voiceURI.toLowerCase().includes('male')) &&
          v.lang.startsWith('en')
      ) || null;
    }
  }

  // Fallback to natural/neural English voice
  if (!selectedVoice) {
    selectedVoice = voices.find(
      (v) =>
        (v.name.toLowerCase().includes('natural') ||
          v.name.toLowerCase().includes('neural') ||
          v.name.toLowerCase().includes('online')) &&
        v.lang.startsWith('en')
    ) || null;
  }

  // Fallback to standard English voice
  if (!selectedVoice) {
    selectedVoice =
      voices.find((v) => v.lang === 'en-US' || v.lang === 'en-GB') ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0] ||
      null;
  }

  return {
    voice: selectedVoice,
    pitch: persona.pitch,
    rate: persona.rate,
  };
}

/**
 * Resolves the best available natural/neural female voice (Gemini-style Vega: warm, expressive, clear)
 */
export function getGeminiNaturalFemaleVoice(): SpeechSynthesisVoice | null {
  return getGeminiVoiceForPersona('vega').voice;
}

/**
 * Tunes speech utterance with selected Gemini voice characteristics (Vega, Kore, Puck, Charon, Fenrir)
 */
export function applyGeminiVoice(utterance: SpeechSynthesisUtterance, personaId?: GeminiVoicePersona) {
  const { voice, pitch, rate } = getGeminiVoiceForPersona(personaId);
  if (voice) {
    utterance.voice = voice;
  }
  utterance.pitch = pitch;
  utterance.rate = rate;
}

/**
 * Backwards compatibility wrapper for applyGeminiFemaleVoice
 */
export function applyGeminiFemaleVoice(utterance: SpeechSynthesisUtterance) {
  applyGeminiVoice(utterance);
}

/**
 * Direct voice interrupt keywords that immediately halt assistant speech on first word
 */
const INTERRUPT_KEYWORDS = new Set([
  'stop', 'wait', 'pause', 'cancel', 'hold', 'no', 'listen', 'theta', 'hey', 'quiet',
  'ok', 'okay', 'shut', 'hush', 'enough', 'next', 'shh', 'change', 'wrong', 'no wait', 'what'
]);

function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Clean Speech Engine Controller
 */
class CleanSpeechEngine {
  private activeRecognition: any = null;
  private activeMediaStream: MediaStream | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private currentMode: 'idle' | 'dictation' | 'live-talk' = 'idle';
  private silenceTimer: any = null;
  private restartTimer: any = null;
  private startGuardTimer: any = null;      // Clears isStartingRecognition if onstart never fires
  private proactiveRefreshTimer: any = null; // 50s proactive refresh to beat Android 60s kill
  private dictationSpeechRec: any = null;   // Stored SpeechRec class for dictation restarts
  private dictationAccumulated: string = ''; // Accumulated dictation text across reconnects
  private isProcessingPrompt: boolean = false;
  private isMuted: boolean = false;
  private isAssistantSpeaking: boolean = false;
  private isStartingRecognition: boolean = false;
  private isRecognitionActive: boolean = false;
  private lastAssistantSpokenText: string = '';

  // Listeners
  private onTranscriptCallback: ((text: string) => void) | null = null;
  private onAutoSendCallback: ((text: string) => void) | null = null;
  private onStatusCallback: ((status: LiveTalkStatus) => void) | null = null;
  private onDictationEndCallback: (() => void) | null = null;
  private onInterruptionCallback: (() => void) | null = null;

  /**
   * Safe recognition terminator with total cleanup of listeners and locks
   */
  private safeStopRecognition() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.startGuardTimer) {
      clearTimeout(this.startGuardTimer);
      this.startGuardTimer = null;
    }
    if (this.activeRecognition) {
      try {
        const r = this.activeRecognition;
        r.onend = null;
        r.onerror = null;
        r.onresult = null;
        r.onstart = null;
        r.abort();
      } catch {}
      this.activeRecognition = null;
    }
    this.isStartingRecognition = false;
    this.isRecognitionActive = false;
  }

  /**
   * Internal helper to start/restart continuous dictation recognition instance
   */
  private initDictationMic() {
    if (this.currentMode !== 'dictation' || !this.dictationSpeechRec) return;

    this.safeStopRecognition();
    this.isStartingRecognition = true;

    try {
      const rec = new this.dictationSpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US';

      this.startGuardTimer = setTimeout(() => {
        if (this.isStartingRecognition) {
          this.isStartingRecognition = false;
        }
      }, 3000);

      rec.onstart = () => {
        if (this.startGuardTimer) {
          clearTimeout(this.startGuardTimer);
          this.startGuardTimer = null;
        }
        this.isStartingRecognition = false;
        this.isRecognitionActive = true;
        this.activeRecognition = rec;
      };

      let sessionSpeechAccumulated = '';

      rec.onresult = (event: any) => {
        if (this.currentMode !== 'dictation') return;

        const sessionSpeech = extractCleanSpeechFromEvent(event);
        if (!sessionSpeech) return;
        sessionSpeechAccumulated = sessionSpeech;

        const base = this.dictationAccumulated ? this.dictationAccumulated.trim() : '';
        const total = base ? mergeSpeechChunks([base, sessionSpeech]) : sessionSpeech;
        const cleaned = cleanSpeechTranscript(total);

        if (this.onTranscriptCallback && cleaned) {
          this.onTranscriptCallback(cleaned);
        }
      };

      rec.onerror = (e: any) => {
        const err = e?.error;
        // On mobile, 'no-speech' is emitted when the user pauses between sentences.
        // 'audio-capture' or 'network' can happen momentarily. Do not kill dictation!
        if (err === 'no-speech' || err === 'aborted') return;

        console.warn('Speech recognition dictation error:', err);
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          notifySpeechMessage('Microphone access is blocked. Please allow microphone permission in your browser address bar.', 'error');
          this.stopAll();
          return;
        }

        // For temporary mobile network / audio-capture hiccups, safely schedule a reconnect
        if (this.currentMode === 'dictation') {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (this.currentMode === 'dictation') {
              this.initDictationMic();
            }
          }, 200);
        }
      };

      rec.onend = () => {
        this.isRecognitionActive = false;
        this.isStartingRecognition = false;
        this.activeRecognition = null;

        // Consolidate text heard in this run into dictationAccumulated
        if (sessionSpeechAccumulated) {
          const base = this.dictationAccumulated ? this.dictationAccumulated.trim() : '';
          this.dictationAccumulated = base
            ? mergeSpeechChunks([base, sessionSpeechAccumulated])
            : sessionSpeechAccumulated;
          sessionSpeechAccumulated = '';
        }

        // CONTINUOUS DICTATION WATCHDOG:
        // Automatically restart if user did NOT explicitly turn it off!
        // Never call onDictationEndCallback unless mode was explicitly stopped by user.
        if (this.currentMode === 'dictation') {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (this.currentMode === 'dictation') {
              this.initDictationMic();
            }
          }, 80);
        }
      };

      rec.start();
      this.activeRecognition = rec;
    } catch (err) {
      this.isStartingRecognition = false;
      this.isRecognitionActive = false;
      this.activeRecognition = null;
      console.warn('Dictation mic init error, scheduling retry:', err);
      if (this.currentMode === 'dictation') {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          if (this.currentMode === 'dictation') {
            this.initDictationMic();
          }
        }, 300);
      }
    }
  }

  /**
   * Start clean continuous dictation into the prompt box.
   * Keeps listening indefinitely until user explicitly clicks off.
   */
  public async startDictation(
    existingInput: string,
    onTranscript: (fullText: string) => void,
    onEnded: () => void
  ) {
    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      notifySpeechMessage('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.', 'warning');
      onEnded();
      return;
    }

    const permitted = await ensureMicrophonePermission();
    if (!permitted) {
      notifySpeechMessage('Microphone permission was denied. Please allow microphone access in your browser address bar settings.', 'error');
      onEnded();
      return;
    }

    this.stopAll();

    this.currentMode = 'dictation';
    this.dictationSpeechRec = SpeechRec;
    this.dictationAccumulated = existingInput ? existingInput.trim() : '';
    this.onTranscriptCallback = onTranscript;
    this.onDictationEndCallback = onEnded;

    this.initDictationMic();
  }

  /**
   * Explicitly stop dictation mode
   */
  public stopDictation() {
    if (this.currentMode === 'dictation') {
      const cb = this.onDictationEndCallback;
      this.stopAll();
      if (cb) {
        cb();
      }
    }
  }

  /**
   * Start Live Talk conversational voice assistant with anti-echo and clean listening
   */
  public async startLiveTalk(
    onTranscript: (text: string) => void,
    onAutoSend: (text: string) => void,
    onStatus: (status: LiveTalkStatus) => void,
    onInterruption?: () => void
  ) {
    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      notifySpeechMessage('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.', 'warning');
      return;
    }

    const permitted = await ensureMicrophonePermission();
    if (!permitted) {
      notifySpeechMessage('Microphone permission was denied. Please allow microphone access in your browser address bar settings.', 'error');
      onStatus('paused');
      return;
    }

    this.stopAll();

    this.currentMode = 'live-talk';
    this.onTranscriptCallback = onTranscript;
    this.onAutoSendCallback = onAutoSend;
    this.onStatusCallback = onStatus;
    this.onInterruptionCallback = onInterruption || null;
    this.isProcessingPrompt = false;
    this.isMuted = false;
    this.isAssistantSpeaking = false;
    this.lastAssistantSpokenText = '';

    this.onStatusCallback('listening');
    this.onTranscriptCallback?.('');

    // Start recognition immediately
    this.initLiveTalkMic(SpeechRec);

    // Proactive refresh cycle to prevent Android / Mobile Chrome 60-second silent audio drops
    if (this.proactiveRefreshTimer) clearInterval(this.proactiveRefreshTimer);
    this.proactiveRefreshTimer = setInterval(() => {
      if (
        this.currentMode === 'live-talk' &&
        !this.isMuted &&
        !this.isAssistantSpeaking &&
        !this.isProcessingPrompt
      ) {
        this.safeStopRecognition();
        setTimeout(() => {
          if (
            this.currentMode === 'live-talk' &&
            !this.isMuted &&
            !this.isAssistantSpeaking &&
            !this.isProcessingPrompt
          ) {
            this.initLiveTalkMic(SpeechRec);
          }
        }, 120);
      }
    }, 45000); // 45 seconds refresh before the browser's 60-second silent kill
  }

  private initLiveTalkMic(SpeechRec: any) {
    if (this.currentMode !== 'live-talk' || this.isMuted) {
      return;
    }

    // Always cleanly reset previous instance to avoid zombie listeners or stuck recognition locks
    this.safeStopRecognition();
    this.isStartingRecognition = true;

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      // Do not hardcode sub-locales that Android Chrome speech services can drop;
      // 'en-US' or window.navigator.language provides widest cross-device mobile recognition
      rec.lang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US';

      this.startGuardTimer = setTimeout(() => {
        if (this.isStartingRecognition) {
          this.isStartingRecognition = false;
        }
      }, 1500);

      rec.onstart = () => {
        if (this.startGuardTimer) {
          clearTimeout(this.startGuardTimer);
          this.startGuardTimer = null;
        }
        this.isStartingRecognition = false;
        this.isRecognitionActive = true;
        this.activeRecognition = rec;
      };

      rec.onresult = (event: any) => {
        if (this.isMuted || this.currentMode !== 'live-talk') {
          return;
        }

        const cleaned = extractCleanSpeechFromEvent(event);
        if (!cleaned || cleaned.trim().length < 2) return;

        const userTokens = extractWords(cleaned);
        if (userTokens.length === 0) return;

        const isDirectKeyword = userTokens.length === 1 && INTERRUPT_KEYWORDS.has(userTokens[0]);

        // 1. Hands-Free Voice Interruption while Assistant is Speaking:
        if (this.isAssistantSpeaking) {
          // In speaking mode, the mic is ONLY listening for genuine user interruption commands!
          // Normal ambient sound or words the assistant is speaking MUST NEVER be passed through or auto-sent.
          
          // Direct interrupt keywords always trigger an immediate cut-off
          if (isDirectKeyword) {
            this.interruptAndListen();
            return;
          }

          // If the user says a phrase to interrupt, verify it has ZERO match with what the assistant is speaking
          const assistantTokens = new Set(extractWords(this.lastAssistantSpokenText || ''));
          let echoMatches = 0;
          for (const token of userTokens) {
            if (assistantTokens.has(token)) {
              echoMatches++;
            }
          }

          // If ANY words match the assistant's speech, or if it's very short ambient noise (< 3 words), treat as speaker bleed
          if (echoMatches > 0 || userTokens.length < 3) {
            return;
          }

          // If the heard text is found anywhere in the assistant's response, ignore it completely
          const userLower = cleaned.toLowerCase().trim();
          if (this.lastAssistantSpokenText && (this.lastAssistantSpokenText.includes(userLower) || userLower.includes(this.lastAssistantSpokenText))) {
            return;
          }

          // Genuine multi-word new instruction while assistant is speaking -> trigger interruption!
          this.interruptAndListen();
          this.onTranscriptCallback?.(cleaned);

          if (this.silenceTimer) clearTimeout(this.silenceTimer);
          this.silenceTimer = setTimeout(() => {
            if (
              this.currentMode === 'live-talk' &&
              !this.isMuted &&
              !this.isAssistantSpeaking &&
              !this.isProcessingPrompt &&
              cleaned.trim().length >= 2
            ) {
              this.handleAutoSendPrompt(cleaned.trim());
            }
          }, 1250);
          return;
        }

        // 2. Hands-Free Voice Interruption while Gemini is formulating response (thinking / sending):
        if (this.isProcessingPrompt) {
          if (userTokens.length >= 2 || isDirectKeyword) {
            this.isProcessingPrompt = false;
            this.onInterruptionCallback?.();
            this.onStatusCallback?.('listening');
          } else {
            return;
          }
        }

        // 3. Post-speaking Echo & Residual Acoustic Tail Guard:
        // When assistant has just finished speaking, device speakers have residual reverb and
        // SpeechRecognition events may deliver late-arriving chunks of what the speaker played.
        if (this.lastAssistantSpokenText && !this.isAssistantSpeaking) {
          const userLower = cleaned.toLowerCase().trim();
          const assistantTokens = new Set(extractWords(this.lastAssistantSpokenText || ''));

          let echoMatches = 0;
          for (const token of userTokens) {
            if (assistantTokens.has(token)) {
              echoMatches++;
            }
          }
          const echoRatio = userTokens.length > 0 ? echoMatches / userTokens.length : 0;

          // If speech is primarily what the assistant just spoke (>= 60% overlap) or exact substring of it -> drop as echo
          if (echoRatio >= 0.60 || this.lastAssistantSpokenText.includes(userLower)) {
            return;
          }

          // Once user begins speaking genuine words, clear the old assistant text so follow-up conversation flows naturally
          if (userTokens.length >= 2 && echoRatio === 0) {
            this.lastAssistantSpokenText = '';
          }
        }

        // Only accept genuine user speech with at least 2 characters and at least 1 meaningful word
        if (userTokens.length === 0) return;

        this.onTranscriptCallback?.(cleaned);

        // Reset silence timer to wait for user to finish thought before auto-sending
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          if (
            this.currentMode === 'live-talk' &&
            !this.isMuted &&
            !this.isAssistantSpeaking &&
            !this.isProcessingPrompt &&
            cleaned.trim().length >= 2
          ) {
            this.handleAutoSendPrompt(cleaned.trim());
          }
        }, 1250);
      };

      rec.onerror = (e: any) => {
        const err = e?.error;
        if (err === 'no-speech' || err === 'aborted') {
          return;
        }

        console.warn('Live talk mic error:', err);
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.onStatusCallback?.('paused');
          this.stopAll();
          notifySpeechMessage('Microphone access is blocked. Please allow microphone permission in your browser address bar.', 'error');
          return;
        }

        // Automatic fault recovery for temporary audio-capture / network drops
        this.safeStopRecognition();
        if (
          this.currentMode === 'live-talk' &&
          !this.isMuted &&
          !this.isAssistantSpeaking &&
          !this.isProcessingPrompt
        ) {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (
              this.currentMode === 'live-talk' &&
              !this.isMuted &&
              !this.isAssistantSpeaking &&
              !this.isProcessingPrompt
            ) {
              this.initLiveTalkMic(SpeechRec);
            }
          }, 350);
        }
      };

      rec.onend = () => {
        this.isRecognitionActive = false;
        this.isStartingRecognition = false;
        this.activeRecognition = null;

        // Auto-reconnect watchdog if live talk is still active and waiting for user speech
        if (
          this.currentMode === 'live-talk' &&
          !this.isMuted &&
          !this.isAssistantSpeaking &&
          !this.isProcessingPrompt
        ) {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (
              this.currentMode === 'live-talk' &&
              !this.isMuted &&
              !this.isAssistantSpeaking &&
              !this.isProcessingPrompt
            ) {
              this.initLiveTalkMic(SpeechRec);
            }
          }, 200);
        }
      };

      rec.start();
      this.activeRecognition = rec;
    } catch (err) {
      this.isStartingRecognition = false;
      this.isRecognitionActive = false;
      this.activeRecognition = null;
      console.warn('Live talk mic init error, scheduling retry:', err);
      if (
        this.currentMode === 'live-talk' &&
        !this.isMuted &&
        !this.isAssistantSpeaking &&
        !this.isProcessingPrompt
      ) {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          this.initLiveTalkMic(SpeechRec);
        }, 400);
      }
    }
  }

  public handleAutoSendPrompt(text: string) {
    if (this.isProcessingPrompt || this.isAssistantSpeaking || this.currentMode !== 'live-talk' || this.isMuted) return;
    this.isProcessingPrompt = true;
    this.onStatusCallback?.('sending');

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    this.onAutoSendCallback?.(text);
  }

  /**
   * Handle assistant response speaking with clean speaker isolation (zero self-echo)
   */
  public handleAssistantReply(responseText: string, voiceEnabled: boolean) {
    if (this.currentMode !== 'live-talk') {
      this.isProcessingPrompt = false;
      return;
    }

    const resumeListeningFresh = () => {
      this.activeUtterance = null;
      this.isAssistantSpeaking = false;
      this.isProcessingPrompt = false;
      this.onTranscriptCallback?.(''); // Clear transcript for user's next question

      // Wait 350ms after speech ends to prevent acoustic tail from registering,
      // and ensure recognition is freshly restarted for the user's next question!
      setTimeout(() => {
        if (this.currentMode === 'live-talk' && !this.isMuted && !this.isAssistantSpeaking) {
          this.onStatusCallback?.('listening');
          const SpeechRec = getSpeechRecognition();
          if (SpeechRec && (!this.activeRecognition || !this.isRecognitionActive)) {
            this.initLiveTalkMic(SpeechRec);
          }
        }
      }, 350);
    };

    if (!voiceEnabled || !isSpeechSynthesisSupported()) {
      resumeListeningFresh();
      return;
    }

    const clean = formatTextForSpeech(responseText);
    if (!clean) {
      resumeListeningFresh();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      this.onStatusCallback?.('speaking');
      this.isAssistantSpeaking = true;
      this.lastAssistantSpokenText = clean.toLowerCase();
      this.isProcessingPrompt = false;

      // Ensure recognition is running continuously so the user can speak to interrupt anytime!
      const SpeechRec = getSpeechRecognition();
      if (SpeechRec && (!this.activeRecognition || !this.isRecognitionActive)) {
        this.initLiveTalkMic(SpeechRec);
      }

      const utter = new SpeechSynthesisUtterance(clean);
      applyGeminiVoice(utter, 'vega');

      this.activeUtterance = utter;
      utter.onend = () => resumeListeningFresh();
      utter.onerror = () => resumeListeningFresh();

      window.speechSynthesis.speak(utter);
    } catch {
      resumeListeningFresh();
    }
  }

  /**
   * User tapped card to interrupt assistant speech or sending, immediately listening to user
   */
  public interruptAndListen() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.activeUtterance = null;
    this.isAssistantSpeaking = false;
    this.isProcessingPrompt = false;
    this.lastAssistantSpokenText = ''; // Clear prior response text immediately on interrupt

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    this.onTranscriptCallback?.('');
    this.onInterruptionCallback?.();
    this.onStatusCallback?.('listening');

    // Immediately stop old recognition and boot up fresh recognition instance right away
    this.safeStopRecognition();
    const SpeechRec = getSpeechRecognition();
    if (SpeechRec && this.currentMode === 'live-talk' && !this.isMuted) {
      this.initLiveTalkMic(SpeechRec);
    }
  }

  /**
   * Cancel in-flight generation / speech and safely resume listening from fresh state
   */
  public cancelCurrentTurn() {
    this.isProcessingPrompt = false;
    this.isAssistantSpeaking = false;
    this.lastAssistantSpokenText = '';

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.activeUtterance) {
      try {
        this.activeUtterance.onend = null;
        this.activeUtterance.onerror = null;
      } catch {}
      this.activeUtterance = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    this.onTranscriptCallback?.('');

    if (this.currentMode === 'live-talk' && !this.isMuted) {
      this.onStatusCallback?.('listening');
      this.safeStopRecognition();
      const SpeechRec = getSpeechRecognition();
      if (SpeechRec) {
        this.initLiveTalkMic(SpeechRec);
      }
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      if (this.silenceTimer) clearTimeout(this.silenceTimer);
      this.safeStopRecognition();
      this.onStatusCallback?.('paused');
    } else {
      if (!this.isProcessingPrompt && !this.isAssistantSpeaking && this.currentMode === 'live-talk') {
        this.onStatusCallback?.('listening');
        const SpeechRec = getSpeechRecognition();
        if (SpeechRec) this.initLiveTalkMic(SpeechRec);
      }
    }
  }

  public stopAll() {
    this.currentMode = 'idle';
    this.isProcessingPrompt = false;
    this.isAssistantSpeaking = false;
    this.isMuted = false;
    this.lastAssistantSpokenText = '';
    this.isStartingRecognition = false;
    this.isRecognitionActive = false;
    this.dictationSpeechRec = null;
    this.dictationAccumulated = '';
    this.onDictationEndCallback = null;

    if (this.proactiveRefreshTimer) {
      clearInterval(this.proactiveRefreshTimer);
      this.proactiveRefreshTimer = null;
    }
    if (this.startGuardTimer) {
      clearTimeout(this.startGuardTimer);
      this.startGuardTimer = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.activeUtterance) {
      try {
        this.activeUtterance.onend = null;
        this.activeUtterance.onerror = null;
      } catch {}
      this.activeUtterance = null;
    }

    this.safeStopRecognition();

    if (this.activeMediaStream) {
      try {
        this.activeMediaStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.activeMediaStream = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }
}

export const speechEngine = new CleanSpeechEngine();