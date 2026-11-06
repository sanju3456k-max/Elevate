/**
 * Fault-tolerant JSON parser for mathematics assessments.
 * Automatically recovers from unescaped LaTeX backslashes and syntax anomalies.
 * If a syntax error is located in a specific question, isolates that question,
 * reports "Error in Question X: ...", and accepts all remaining valid questions!
 */

export interface QuestionParseError {
  questionNumber: number;
  message: string;
  rawSnippet?: string;
}

export interface FaultTolerantParseResult {
  test: {
    id?: string;
    title: string;
    topic: string;
    description: string;
    time?: number;
    timeLimitMinutes?: number;
    passingScorePercentage?: number;
    difficulty?: string;
    questions: any[];
    [key: string]: any;
  };
  repairedJson: string;
  errors: QuestionParseError[];
  hasRepairs: boolean;
}

/**
 * Repairs unescaped LaTeX backslashes and control characters inside JSON string literals.
 * Preserves already-escaped sequences (\\) and standard JSON escapes (\" \\ \/).
 * Converts LaTeX single backslashes (\frac, \sqrt, \alpha, \neq, \{, \}, etc.) to valid JSON (\\frac, etc.).
 */
export function repairJsonBackslashes(str: string): string {
  if (!str) return '';
  let result = '';
  let inString = false;
  let i = 0;
  const len = str.length;

  while (i < len) {
    const ch = str[i];

    if (ch === '"') {
      let backslashCount = 0;
      let k = i - 1;
      while (k >= 0 && str[k] === '\\') {
        backslashCount++;
        k--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += ch;
      i++;
      continue;
    }

    if (inString) {
      // Handle raw unescaped newlines/tabs inside JSON string literals
      if (ch === '\n') {
        result += '\\n';
        i++;
        continue;
      }
      if (ch === '\r') {
        if (str[i + 1] === '\n') {
          result += '\\n';
          i += 2;
        } else {
          result += '\\r';
          i++;
        }
        continue;
      }
      if (ch === '\t') {
        result += '\\t';
        i++;
        continue;
      }

      if (ch === '\\') {
        const next = str[i + 1] || '';

        // If it's already an escaped backslash (\\) or escaped quote (\") or slash (\/)
        if (next === '"' || next === '\\' || next === '/') {
          result += ch + next;
          i += 2;
          continue;
        }

        // Valid Unicode escape: \uXXXX
        if (next === 'u' && /^[0-9a-fA-F]{4}/.test(str.slice(i + 2, i + 6))) {
          result += str.slice(i, i + 6);
          i += 6;
          continue;
        }

        // Check if standard JSON single-letter escapes (b, f, n, r, t) are actually LaTeX commands:
        // e.g. \frac, \dfrac, \begin, \times, \right, \neq, \beta, \text, \tan, \tau
        const remainder = str.slice(i + 1);
        const isLatexCommand = /^(?:frac|dfrac|cfrac|begin|times|right|neq|ne\b|not\b|notin|nabla|neg|null|beta|bar\b|mathbf|mathbb|mathcal|boldsymbol|bmatrix|Bmatrix|binom|bullet|bold|bra|text|textbf|textit|tan|tanh|tau|theta|to\b|top|triangle|rho|rangle|ref|root|rfloor|rceil|forall|flat)\b/i.test(remainder);

        if (isLatexCommand || !/^[bfnrt]/.test(next)) {
          // Unescaped backslash (e.g. \alpha, \sqrt, \frac, \times, \{, \}, \_, \,) -> escape it to \\
          result += '\\\\';
          i++;
          continue;
        }

        result += ch + next;
        i += 2;
        continue;
      }
    }

    result += ch;
    i++;
  }
  return result;
}

/**
 * Removes illegal trailing commas in JSON before } or ]
 */
export function removeTrailingCommas(str: string): string {
  let result = '';
  let inString = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"') {
      let bCount = 0;
      let k = i - 1;
      while (k >= 0 && str[k] === '\\') {
        bCount++;
        k--;
      }
      if (bCount % 2 === 0) {
        inString = !inString;
      }
      result += ch;
      continue;
    }
    if (!inString && ch === ',') {
      let j = i + 1;
      while (j < str.length && /\s/.test(str[j])) {
        j++;
      }
      if (j < str.length && (str[j] === '}' || str[j] === ']')) {
        continue;
      }
    }
    result += ch;
  }
  return result;
}

/**
 * Robustly extracts question JSON blocks even if one question contains broken quotes or unclosed braces.
 */
function extractQuestionBlocks(rawText: string): string[] {
  // Find start of questions array
  const qMatch = rawText.match(/"questions"\s*:\s*\[/) || rawText.match(/\[/);
  if (!qMatch || qMatch.index === undefined) return [];
  const qStart = qMatch.index + qMatch[0].length;
  const section = rawText.slice(qStart);

  const blocks: string[] = [];
  let i = 0;
  while (i < section.length) {
    const nextBrace = section.indexOf('{', i);
    if (nextBrace === -1) break;

    const closeBracket = section.indexOf(']', i);
    if (closeBracket !== -1 && closeBracket < nextBrace) {
      // End of questions array reached
      break;
    }

    let depth = 0;
    let inString = false;
    let end = -1;
    for (let j = nextBrace; j < section.length; j++) {
      const c = section[j];
      if (c === '"') {
        let b = 0;
        let k = j - 1;
        while (k >= 0 && section[k] === '\\') { b++; k--; }
        if (b % 2 === 0) inString = !inString;
      }
      if (!inString) {
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            end = j + 1;
            break;
          }
        } else if (c === ']' && depth === 0) {
          break;
        }
      }
    }

    if (end !== -1) {
      blocks.push(section.slice(nextBrace, end));
      i = end;
    } else {
      // Unclosed or broken question:
      // Look ahead for next question boundary: comma followed by '{'
      const nextQ = section.slice(nextBrace + 1).search(/\,\s*\{/);
      if (nextQ !== -1) {
        const faultyEnd = nextBrace + 1 + nextQ;
        const blockText = section.slice(nextBrace, faultyEnd).trim();
        blocks.push(blockText);
        i = faultyEnd + 1;
      } else {
        // Last question broken
        const lastBrace = section.lastIndexOf('}');
        const arrayEnd = section.lastIndexOf(']');
        const cut = lastBrace > nextBrace ? lastBrace + 1 : (arrayEnd > nextBrace ? arrayEnd : section.length);
        blocks.push(section.slice(nextBrace, cut).trim());
        break;
      }
    }
  }
  return blocks;
}

/**
 * Fault-tolerant JSON parser for mathematics assessments.
 * Automatically recovers from unescaped LaTeX backslashes.
 * If a syntax error is located in a specific question, isolates that question,
 * reports "Error in Question X: ...", and accepts all remaining valid questions!
 */
export function parseAssessmentJsonFaultTolerant(rawText: string): FaultTolerantParseResult {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('JSON text is empty.');
  }

  const cleaned = rawText.trim();

  // Step 1: Check if input passes with backslash repair and trailing comma cleanup
  const repaired = removeTrailingCommas(repairJsonBackslashes(cleaned));
  try {
    const parsed = JSON.parse(repaired);
    let questionsArray: any[] = [];
    if (Array.isArray(parsed)) {
      questionsArray = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
      questionsArray = parsed.questions;
    }

    if (questionsArray.length > 0) {
      const isBareArray = Array.isArray(parsed);
      return {
        test: isBareArray
          ? {
              title: 'Imported Assessment',
              topic: 'Matrices and Determinants',
              description: 'Imported from JSON',
              timeLimitMinutes: 15,
              passingScorePercentage: 60,
              questions: questionsArray,
            }
          : parsed,
        repairedJson: repaired,
        errors: [],
        hasRepairs: repaired !== cleaned,
      };
    }
  } catch {
    // Proceed to Step 2: Per-question segmentation and error isolation
  }

  // Step 2: Per-question segmentation and error isolation
  return isolateAndParseQuestions(cleaned);
}

function isolateAndParseQuestions(rawText: string): FaultTolerantParseResult {
  let title = 'Imported Assessment';
  let topic = 'Matrices and Determinants';
  let description = 'Imported from JSON';
  let time = 15;
  let passing = 60;

  const titleMatch = rawText.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (titleMatch) title = titleMatch[1];

  const topicMatch = rawText.match(/"topic"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (topicMatch) topic = topicMatch[1];

  const descMatch = rawText.match(/"description"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (descMatch) description = descMatch[1];

  const timeMatch = rawText.match(/"(?:time|timeLimitMinutes)"\s*:\s*(\d+)/);
  if (timeMatch) time = parseInt(timeMatch[1], 10);

  const passingMatch = rawText.match(/"passingScorePercentage"\s*:\s*(\d+)/);
  if (passingMatch) passing = parseInt(passingMatch[1], 10);

  const rawBlocks = extractQuestionBlocks(rawText);

  if (rawBlocks.length === 0) {
    throw new Error('No questions found in JSON. Please verify JSON format.');
  }

  const acceptedQuestions: any[] = [];
  const questionErrors: QuestionParseError[] = [];

  rawBlocks.forEach((blockRaw, idx) => {
    const qNum = idx + 1;
    let parsedQ: any = null;
    let blockError = '';

    // First try repaired block
    const cleanedBlock = removeTrailingCommas(repairJsonBackslashes(blockRaw));
    try {
      parsedQ = JSON.parse(cleanedBlock);
    } catch (e1: any) {
      // Try closing trailing open braces if truncated
      try {
        let trimmedBlock = cleanedBlock.trim();
        if (!trimmedBlock.endsWith('}')) {
          const lastBrace = trimmedBlock.lastIndexOf('}');
          if (lastBrace !== -1) {
            trimmedBlock = trimmedBlock.slice(0, lastBrace + 1);
            parsedQ = JSON.parse(trimmedBlock);
          }
        }
      } catch (e2: any) {
        blockError = e1.message || 'Syntax error in question string';
      }
      if (!parsedQ) {
        blockError = e1.message || 'Syntax error in question string';
      }
    }

    if (parsedQ && typeof parsedQ === 'object') {
      acceptedQuestions.push(parsedQ);
    } else {
      // Isolate this specific question!
      let extractedPrompt = '';
      const textMatch = blockRaw.match(/"(?:text|question|prompt)"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (textMatch) {
        extractedPrompt = textMatch[1];
      } else {
        const looseMatch = blockRaw.match(/"(?:text|question|prompt)"\s*:\s*([^,\}\n]+)/);
        if (looseMatch) {
          extractedPrompt = looseMatch[1].trim().replace(/^["']|["']$/g, '');
        }
      }

      let simplifiedError = blockError;
      if (simplifiedError.includes('Bad escaped character')) {
        simplifiedError = 'Unescaped backslash in question text or options';
      } else if (simplifiedError.includes('Unexpected token') || simplifiedError.includes('Expected')) {
        simplifiedError = 'Invalid syntax / unescaped quotes or symbols';
      }

      const qErrorMsg = `Error in Question ${qNum}: ${simplifiedError}`;
      questionErrors.push({
        questionNumber: qNum,
        message: qErrorMsg,
        rawSnippet: blockRaw.slice(0, 200),
      });

      // Insert placeholder so this question index is kept in position and other questions are NOT shifted
      acceptedQuestions.push({
        id: `q_${qNum}`,
        text: extractedPrompt ? `${extractedPrompt} [⚠️ Error in Question ${qNum}]` : `[⚠️ Error in Question ${qNum}: ${simplifiedError}]`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 0,
        explanation: `Original syntax error in Question ${qNum}:\n${blockError}\n\nRaw snippet:\n${blockRaw.slice(0, 300)}`,
        _hasSyntaxError: true,
        _errorMessage: qErrorMsg,
      });
    }
  });

  return {
    test: {
      title,
      topic,
      description,
      time,
      timeLimitMinutes: time,
      passingScorePercentage: passing,
      questions: acceptedQuestions,
    },
    repairedJson: rawText,
    errors: questionErrors,
    hasRepairs: questionErrors.length > 0,
  };
}
