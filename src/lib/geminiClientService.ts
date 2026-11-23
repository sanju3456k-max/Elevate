/**
 * ============================================================================
 * ELEVATE CLIENT-SIDE GEMINI AI ENGINE
 * ============================================================================
 * 
 * Provides direct, zero-backend Google Gemini inference support for:
 * 1. Native Android builds (Capacitor WebView on https://localhost) where
 *    Node.js Express backend servers do not run locally.
 * 2. Web App offline/local fallback whenever /api/... endpoints are unreachable
 *    or return 404/503.
 * 
 * Features:
 * - High-speed model fallback cascade:
 *   gemini-flash-lite-latest -> gemini-3.1-flash-lite -> gemini-3.5-flash-lite -> gemini-3.8-flash -> gemini-flash-latest
 * - Multi-turn conversational chat with LaTeX mathematical notation ($...$ and $$...$$).
 * - Stateful test-action generation (CREATE_TEST, UPDATE_TEST, DELETE_TEST).
 * - Code execution & Python Matplotlib visualization tool support.
 * - Interactive graphing widget JSON blocks (```graph, ```mindmap, ```interactive-table).
 * - Math test question step-by-step explanations.
 * - Test editing & question modification via Gemini.
 * - HTML note summarization.
 */

import { Capacitor } from '@capacitor/core';

// Candidate models in priority order
export const GEMINI_CLIENT_CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

const DEFAULT_FALLBACK_API_KEY = '';

/**
 * Checks if the current environment is running inside Capacitor native Android
 */
export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Retrieves the active Gemini API key from environment, localStorage, or fallback
 */
export function getActiveGeminiApiKey(): string {
  // 1. User-configured custom key in localStorage
  try {
    const userKey = localStorage.getItem('elevate_gemini_api_key') || localStorage.getItem('gemini_api_key');
    if (userKey && userKey.trim().length > 10) {
      return userKey.trim();
    }
  } catch {}

  // 2. Vite environment variable
  try {
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 5) {
      return envKey.trim();
    }
  } catch {}

  // 3. Process.env definition
  try {
    if (typeof process !== 'undefined' && process.env) {
      const pKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (pKey && typeof pKey === 'string' && pKey.trim().length > 5) {
        return pKey.trim();
      }
    }
  } catch {}

  return DEFAULT_FALLBACK_API_KEY;
}

/**
 * Maps requested model name to valid Gemini API model identifier
 */
export function resolveClientModelIdentifier(requestedModel?: string): string {
  const req = (requestedModel || '').toLowerCase().trim();
  if (req.includes('3.1-pro') || req.includes('pro-preview')) {
    return 'gemini-3.1-pro-preview';
  }
  if (req.includes('3.8-flash')) {
    return 'gemini-3.8-flash';
  }
  if (req.includes('flash-latest')) {
    return 'gemini-flash-latest';
  }
  if (req.includes('3.1-flash-lite')) {
    return 'gemini-3.1-flash-lite';
  }
  if (req.includes('3.5-flash-lite')) {
    return 'gemini-3.5-flash-lite';
  }
  return 'gemini-flash-lite-latest';
}

/**
 * Executes a fetch promise with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 28000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export interface GeminiChatbotPayload {
  messages: any[];
  model?: string;
  modelTier?: string;
  selectedModel?: string;
  role?: string;
  rolePreset?: string;
  customInstruction?: string;
  customSystemInstruction?: string;
  temperature?: number;
  enableCodeExecution?: boolean;
  usePython?: boolean;
  selectedTestId?: string | null;
  appContext?: any;
  testLibrary?: any[];
  testAttempts?: any[];
  sessionDocuments?: any[];
  stagedQuestions?: any[];
}

export interface GeminiChatbotResponse {
  reply: string;
  text: string;
  modelUsed: string;
  roleUsed?: string;
  executableCode?: { language: string; code: string }[];
  codeExecutionResults?: { outcome: string; output: string }[];
  generatedImages?: string[];
  parts?: any[];
  isAiGeneratedImage?: boolean;
  imagePrompt?: string;
  isNotice?: boolean;
  noticeMessage?: string;
}

/**
 * Client-Side Direct Gemini Chatbot Caller
 * Full parity with server/routes/ai/chatbot.ts
 */
export async function callGeminiChatbotDirect(
  payload: GeminiChatbotPayload,
  signal?: AbortSignal
): Promise<GeminiChatbotResponse> {
  const apiKey = getActiveGeminiApiKey();
  const requestedModel = resolveClientModelIdentifier(
    payload.selectedModel || payload.modelTier || payload.model
  );

  const priorityModels = Array.from(new Set([
    requestedModel,
    ...GEMINI_CLIENT_CANDIDATE_MODELS,
  ]));

  const effectiveRole = payload.rolePreset || payload.role || 'general_tutor';
  const effectiveInstruction = payload.customInstruction || payload.customSystemInstruction || '';
  const temperature = Math.max(0.1, Math.min(payload.temperature ?? 0.7, 1.0));

  // Build System Instruction Text
  const systemInstructionText = `You are "Theta AI", the advanced intelligent STEM tutor, math coach, and mock test assistant built into Elevate. Always identify yourself as "Theta AI" (never "Elevate AI").
Your mission is to guide students with step-by-step rigorous mathematical explanations, clear LaTeX formulas, interactive visualization graphs, and custom mock test creation.

ROLE: ${effectiveRole}
${effectiveInstruction ? `USER CUSTOM INSTRUCTIONS:\n${effectiveInstruction}\n` : ''}

CRITICAL MATHEMATICAL FORMATTING RULES:
1. Always format mathematical formulas using standard LaTeX:
   - Inline math: $...$ (e.g. $f(x) = x^2 + 2x$, $\\int_0^1 x dx$)
   - Block / Display equations: $$...$$ on its own line
2. Structure your answers with clear markdown headings, numbered steps, key takeaways, and bullet points.

=== TEST CREATION & UPDATES (test-action Protocol) ===
When the user explicitly asks to generate, create, edit, or update a test or quiz:
Always include a \`\`\`test-action JSON block in your response:
\`\`\`test-action
{
  "action": "CREATE_TEST" | "UPDATE_TEST" | "DELETE_TEST",
  "summary": "Brief summary of what was generated or updated",
  "test": {
    "id": "test_id",
    "title": "Clear Test Title",
    "topic": "Mathematics",
    "difficulty": "Medium",
    "timeLimitMinutes": 15,
    "passingScorePercentage": 60,
    "description": "Assessment covering key topics",
    "questions": [
      {
        "id": "q_1",
        "text": "Question statement in LaTeX ($...$)",
        "type": "mcq",
        "options": ["$Option A$", "$Option B$", "$Option C$", "$Option D$"],
        "correctAnswer": "$Option A$",
        "explanation": "Step-by-step derivation in LaTeX ($...$)"
      }
    ]
  }
}
\`\`\`

=== INTERACTIVE FUNCTION PLOTTING DIRECTIVE ===
When the user requests any function plot, curve, or mathematical graph (e.g. "plot tanx", "plot sin(x)", "plot f(x) = x^2 - 4"):
Always output the interactive function graph component using a \`\`\`graph code block with valid JSON:
\`\`\`graph
{
  "type": "function",
  "functionConfig": {
    "formula": "tan(x)",
    "title": "Tangent Function: f(x) = tan(x)",
    "xDomain": [-6.28, 6.28],
    "showDerivative": true,
    "showIntegralArea": false
  }
}
\`\`\`
Along with the graph widget, provide a concise mathematical explanation of the function's analytical properties.
`;

  // Format messages into Gemini API contents structure
  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const contents: any[] = [];

  for (const msg of rawMessages) {
    if (!msg || (!msg.content && !msg.text && !msg.parts)) continue;
    const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';

    const parts: any[] = [];

    // Base text content
    const textContent = typeof msg.content === 'string' ? msg.content : (msg.text || '');
    if (textContent.trim()) {
      parts.push({ text: textContent });
    }

    // Attachments / Images
    if (Array.isArray(msg.attachments)) {
      for (const att of msg.attachments) {
        if (att && att.data && att.mimeType) {
          const base64Data = att.data.includes('base64,') ? att.data.split('base64,')[1] : att.data;
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: base64Data,
            },
          });
        }
      }
    }

    // Session documents if on user message
    if (role === 'user' && Array.isArray(payload.sessionDocuments) && payload.sessionDocuments.length > 0 && parts.length > 0) {
      const docSummaries = payload.sessionDocuments.slice(0, 3).map((d: any) => `Document: "${d.name || 'Doc'}"\n${(d.content || d.text || '').slice(0, 3000)}`).join('\n---\n');
      if (docSummaries) {
        parts.push({ text: `\n[ATTACHED SESSION CONTEXT]\n${docSummaries}` });
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  // Ensure at least one message is present
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  // Make sure the first message has role 'user'
  if (contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  // Alternation check (user -> model -> user -> model)
  const sanitizedContents: any[] = [];
  for (let i = 0; i < contents.length; i++) {
    const cur = contents[i];
    if (sanitizedContents.length > 0 && sanitizedContents[sanitizedContents.length - 1].role === cur.role) {
      sanitizedContents[sanitizedContents.length - 1].parts.push(...cur.parts);
    } else {
      sanitizedContents.push(cur);
    }
  }

  let lastError: any = null;

  for (const model of priorityModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const requestBody: any = {
        contents: sanitizedContents,
        generationConfig: {
          temperature,
          maxOutputTokens: 8192,
        },
        systemInstruction: {
          parts: [{ text: systemInstructionText }],
        },
      };

      if (payload.enableCodeExecution || payload.usePython) {
        requestBody.tools = [{ codeExecution: {} }];
      }

      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'aistudio-build',
          },
          signal,
          body: JSON.stringify(requestBody),
        },
        28000
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${res.status}`;
        console.warn(`[Client Gemini] Model ${model} returned error:`, errMsg);

        if (requestBody.tools) {
          delete requestBody.tools;
          const retryRes = await fetchWithTimeout(
            endpoint,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'User-Agent': 'aistudio-build' },
              signal,
              body: JSON.stringify(requestBody),
            },
            22000
          );
          if (retryRes.ok) {
            const data = await retryRes.json();
            return parseGeminiClientResponse(data, model);
          }
        }

        lastError = new Error(errMsg);
        continue;
      }

      const data = await res.json();
      return parseGeminiClientResponse(data, model);
    } catch (callErr: any) {
      lastError = callErr;
      console.warn(`[Client Gemini] Call to ${model} failed, switching to next candidate:`, callErr.message);
      continue;
    }
  }

  throw lastError || new Error('All candidate Gemini models failed to respond.');
}

/**
 * Parses Gemini API candidate parts into the format expected by GeminiChatbotView
 */
function parseGeminiClientResponse(data: any, modelUsed: string): GeminiChatbotResponse {
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  let accumulatedText = '';
  const parsedParts: any[] = [];
  const executableCodeList: { language: string; code: string }[] = [];
  const codeExecutionResults: { outcome: string; output: string }[] = [];
  const generatedImages: string[] = [];

  for (const part of parts) {
    if (part.text) {
      accumulatedText += (accumulatedText ? '\n\n' : '') + part.text;
      parsedParts.push({ type: 'text', text: part.text });
    }
    if (part.executableCode) {
      executableCodeList.push({
        language: part.executableCode.language || 'PYTHON',
        code: part.executableCode.code || '',
      });
      parsedParts.push({ type: 'executableCode', executableCode: part.executableCode });
    }
    if (part.codeExecutionResult) {
      codeExecutionResults.push({
        outcome: part.codeExecutionResult.outcome || 'OUTCOME_OK',
        output: part.codeExecutionResult.output || '',
      });
      parsedParts.push({ type: 'codeExecutionResult', codeExecutionResult: part.codeExecutionResult });
    }
    if (part.inlineData) {
      const mime = part.inlineData.mimeType || 'image/png';
      const imgDataUrl = `data:${mime};base64,${part.inlineData.data}`;
      generatedImages.push(imgDataUrl);
      parsedParts.push({ type: 'image', url: imgDataUrl });
    }
  }

  const finalReply = accumulatedText.trim() || 'No text response received from Gemini.';

  return {
    reply: finalReply,
    text: finalReply,
    modelUsed,
    executableCode: executableCodeList,
    codeExecutionResults,
    generatedImages,
    parts: parsedParts,
  };
}

/**
 * Universal Hybrid Fetcher for Gemini Chatbot:
 * Tries local/backend server first on Web; falls back seamlessly to Direct Gemini on Android / offline.
 */
export async function executeHybridGeminiChatbot(
  payload: GeminiChatbotPayload,
  signal?: AbortSignal
): Promise<GeminiChatbotResponse> {
  if (isNativeAndroid()) {
    return await callGeminiChatbotDirect(payload, signal);
  }

  try {
    const res = await fetch('/api/gemini/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return await res.json();
    }

    console.warn(`[Hybrid Gemini] /api/gemini/chatbot returned HTTP ${res.status}, falling back to Direct Gemini client...`);
    return await callGeminiChatbotDirect(payload, signal);
  } catch (err: any) {
    console.warn('[Hybrid Gemini] /api/gemini/chatbot unreachable, falling back to Direct Gemini client:', err.message);
    return await callGeminiChatbotDirect(payload, signal);
  }
}

/**
 * Client-Side Direct Explanation for Math Test Questions
 */
export async function explainMathQuestionDirect(payload: {
  questionText: string;
  options?: string[];
  userAnswer?: string;
  correctAnswer?: string;
  explanation?: string;
}): Promise<{ explanation: string }> {
  const apiKey = getActiveGeminiApiKey();
  const { questionText, options = [], userAnswer, correctAnswer, explanation } = payload;

  const prompt = `You are an expert mathematics educator and tutor. A student just finished a practice exam question and requested a detailed, step-by-step mathematical explanation.

QUESTION:
${questionText}

${Array.isArray(options) && options.length > 0 ? `OPTIONS:\n${options.map((opt: string, i: number) => `(${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}\n` : ''}
STUDENT'S ANSWER: ${userAnswer || 'Unattempted'}
CORRECT ANSWER: ${correctAnswer || 'Not provided'}
${explanation ? `REFERENCE SOLUTION:\n${explanation}\n` : ''}

INSTRUCTIONS:
1. Explain step-by-step why the correct answer is right using clear mathematical derivation and LaTeX notation ($...$ inline, $$...$$ display).
2. If the student selected an incorrect option or left it unattempted, briefly explain why common pitfalls lead to that mistake.
3. Provide a helpful formula or quick tip to solve similar problems in future tests.
4. Keep the tone encouraging, structured, and easy to read.`;

  for (const model of GEMINI_CLIENT_CANDIDATE_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'aistudio-build' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
          }),
        },
        20000
      );

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { explanation: text };
        }
      }
    } catch {
      continue;
    }
  }

  return {
    explanation: `**Correct Answer:** \`${correctAnswer || 'N/A'}\`\n\n**Step-by-Step Solution:**\n${explanation || 'Review the core definitions and formulas for this question.'}`,
  };
}

/**
 * Universal Hybrid Fetcher for Math Question Explanation
 */
export async function explainMathQuestionHybrid(payload: {
  questionText: string;
  options?: string[];
  userAnswer?: string;
  correctAnswer?: string;
  explanation?: string;
}): Promise<{ explanation: string }> {
  if (isNativeAndroid()) {
    return await explainMathQuestionDirect(payload);
  }

  try {
    const res = await fetch('/api/explain-math-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.explanation) return data;
    }
    return await explainMathQuestionDirect(payload);
  } catch {
    return await explainMathQuestionDirect(payload);
  }
}

/**
 * Client-Side Direct Note Summarizer
 */
export async function summarizeNoteDirect(payload: {
  title?: string;
  code?: string;
}): Promise<{ summary: string }> {
  const apiKey = getActiveGeminiApiKey();
  const code = payload.code || '';
  if (!code) return { summary: 'Empty note.' };

  const prompt = `Provide a concise 1-2 sentence semantic summary of this HTML note titled "${payload.title || 'Untitled'}". 
Focus on the main topics and concepts covered.
Note Code:
${code.slice(0, 5000)}`;

  for (const model of GEMINI_CLIENT_CANDIDATE_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'aistudio-build' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
          }),
        },
        15000
      );

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { summary: text.trim() };
        }
      }
    } catch {
      continue;
    }
  }

  const plainText = code.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { summary: plainText.length > 0 ? plainText.slice(0, 160) + '...' : 'Notes document summary unavailable.' };
}

/**
 * Universal Hybrid Fetcher for Note Summarization
 */
export async function summarizeNoteHybrid(payload: {
  title?: string;
  code?: string;
}): Promise<{ summary: string }> {
  if (isNativeAndroid()) {
    return await summarizeNoteDirect(payload);
  }

  try {
    const res = await fetch('/api/ai/summarize-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.summary) return data;
    }
    return await summarizeNoteDirect(payload);
  } catch {
    return await summarizeNoteDirect(payload);
  }
}
