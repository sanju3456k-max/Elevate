import type { MathQuestion, MathTest } from '../types';

/**
 * Universal Test Format Converter
 * Bi-directional converter between the human-friendly sequential .txt format
 * and the internal MathTest / JSON schema.
 */

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Canonical Sample Dynamic Math Questions used for templates and previews
 */
export const SAMPLE_DYNAMIC_TEST_QUESTIONS: MathQuestion[] = [
  {
    id: 'q1',
    text: 'A block of mass {m} kg rests on an inclined plane of inclination {theta}° with coefficient of static friction \\mu. What is the minimum coefficient \\mu required to prevent slipping down the incline?',
    topic: 'Statics, Dynamics & Conic Sections',
    subtopic: 'Inclined Plane & Limiting Friction',
    type: 'mcq',
    options: [
      '\\mu \\ge \\tan({theta}°)',
      '\\mu \\ge \\sin({theta}°)',
      '\\mu \\ge \\cos({theta}°)',
      '\\mu \\ge \\cot({theta}°)',
    ],
    correctAnswer: 'A',
    correctOptionIndex: 0,
    explanation: 'Resolving forces along the incline: $mg \\sin\\theta - f_s = 0$. Normal reaction $N = mg \\cos\\theta$. Since maximum static friction $f_s \\le \\mu N$, we have $mg \\sin\\theta \\le \\mu mg \\cos\\theta \\implies \\mu \\ge \\tan\\theta$.',
    hint: 'Equate the component of gravity along the incline to the limiting friction force.',
    fixedVars: {
      m: 5,
      theta: 30,
    },
    isDynamic: true,
    points: 1,
  },
  {
    id: 'q2',
    text: 'A projectile is launched from ground level with initial speed {u} m/s at an angle {angle}° to the horizontal. Assuming gravitational acceleration $g = {g}$ m/s², what is the total horizontal range $R$?',
    topic: 'Statics, Dynamics & Conic Sections',
    subtopic: 'Projectile Motion & Range',
    type: 'mcq',
    options: [
      'R = \\frac{u^2 \\sin(2\\theta)}{g}',
      'R = \\frac{u^2 \\sin^2\\theta}{2g}',
      'R = \\frac{2u \\sin\\theta}{g}',
      'R = \\frac{u^2 \\cos(2\\theta)}{g}',
    ],
    correctAnswer: 'A',
    correctOptionIndex: 0,
    explanation: 'Total flight time is $T = \\frac{2u \\sin\\theta}{g}$. Horizontal speed is constant at $u_x = u \\cos\\theta$. Therefore, horizontal range $R = u_x T = \\frac{u^2 \\sin(2\\theta)}{g}$.',
    hint: 'Multiply the horizontal velocity component by the total time of flight.',
    fixedVars: {
      u: 20,
      angle: 45,
      g: 10,
    },
    isDynamic: true,
    points: 1,
  },
];

/**
 * Standard High-Yield Dynamic Test Template for Test Creator & Exporter
 */
export const SAMPLE_DYNAMIC_TEST_TEMPLATE: Partial<MathTest> = {
  title: 'Sample Mathematics Assessment',
  topic: 'Statics, Dynamics & Conic Sections',
  time: 15,
  timeLimitMinutes: 15,
  difficulty: 'Medium',
  description: 'High-yield practice test with algorithmic dynamic math variables and LaTeX equations.',
  questions: SAMPLE_DYNAMIC_TEST_QUESTIONS,
};

/**
 * Checks whether the input text is raw JSON format
 */
export function isJsonFormat(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/**
 * Formats a single MathQuestion into clean, bracket-free sequential text.
 */
export function formatQuestionToText(q: MathQuestion, index?: number): string {
  const lines: string[] = [];
  const qNum = index !== undefined ? index + 1 : 1;

  lines.push(`Q${qNum}`);

  const qTopic = (q.topic || '').trim();
  lines.push(`Topic: ${qTopic.toLowerCase() === 'general mathematics' ? '' : qTopic}`);

  const qSubtopic = (q.subtopic || '').trim();
  lines.push(`Subtopic: ${qSubtopic}`);

  lines.push(`Question: ${q.text || ''}`);

  if (q.imageUrl) {
    lines.push(`Image: ${q.imageUrl}`);
  }

  // Options
  if (Array.isArray(q.options) && q.options.length > 0) {
    q.options.forEach((opt, idx) => {
      const letter = OPTION_LETTERS[idx] || String(idx + 1);
      lines.push(`${letter}: ${opt}`);
    });
  } else {
    lines.push('A: ');
    lines.push('B: ');
    lines.push('C: ');
    lines.push('D: ');
  }

  // Correct answer
  let correctLetter = 'A';
  if (typeof q.correctOptionIndex === 'number' && q.correctOptionIndex >= 0 && q.correctOptionIndex < OPTION_LETTERS.length) {
    correctLetter = OPTION_LETTERS[q.correctOptionIndex];
  } else if (typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer < OPTION_LETTERS.length) {
    correctLetter = OPTION_LETTERS[q.correctAnswer];
  } else if (typeof q.correctAnswer === 'string') {
    const trimmed = q.correctAnswer.trim().toUpperCase();
    if (OPTION_LETTERS.includes(trimmed)) {
      correctLetter = trimmed;
    } else {
      const parsedNum = parseInt(trimmed, 10);
      if (!isNaN(parsedNum) && parsedNum >= 0 && parsedNum < OPTION_LETTERS.length) {
        correctLetter = OPTION_LETTERS[parsedNum];
      } else if (Array.isArray(q.options)) {
        const foundIdx = q.options.findIndex(o => String(o).trim().toLowerCase() === q.correctAnswer.toString().trim().toLowerCase());
        if (foundIdx >= 0 && foundIdx < OPTION_LETTERS.length) {
          correctLetter = OPTION_LETTERS[foundIdx];
        } else {
          correctLetter = q.correctAnswer || 'A';
        }
      } else {
        correctLetter = q.correctAnswer || 'A';
      }
    }
  }
  lines.push(`Correct: ${correctLetter}`);

  // Explanation
  const explanation = q.explanation || q.solution;
  if (explanation && explanation.trim()) {
    lines.push(`Explanation: ${explanation.trim()}`);
  } else {
    lines.push('Explanation: ');
  }

  if (q.explanationImageUrl) {
    lines.push(`ExplanationImage: ${q.explanationImageUrl}`);
  }

  // Hint (only if present)
  if (q.hint && q.hint.trim()) {
    lines.push(`Hint: ${q.hint.trim()}`);
  }

  // Fixed Variables for Algorithmic Dynamic Questions
  if (q.fixedVars && Object.keys(q.fixedVars).length > 0) {
    lines.push('Vars:');
    for (const [k, v] of Object.entries(q.fixedVars)) {
      lines.push(`${k}: ${v}`);
    }
  }

  // Question Paper Layout overrides (options grid, page/col break, keepTogether/flow, imageWidth)
  if (q.paperLayout && typeof q.paperLayout === 'object' && Object.keys(q.paperLayout).length > 0) {
    lines.push(`PaperLayout: ${JSON.stringify(q.paperLayout)}`);
  }

  return lines.join('\n');
}

/**
 * Formats an entire MathTest into a sequential .txt document.
 */
export function formatTestToText(test: Partial<MathTest>): string {
  const headerLines: string[] = [];

  const rawTitle = (test.title || '').trim();
  headerLines.push(`Title: ${rawTitle.toLowerCase() === 'untitled assessment' ? '' : rawTitle}`);

  const rawTopic = (test.topic || '').trim();
  headerLines.push(`Topic: ${rawTopic.toLowerCase() === 'general mathematics' ? '' : rawTopic}`);
  
  const timeLimit = test.timeLimitMinutes ?? test.time ?? 15;
  headerLines.push(`Time: ${timeLimit}`);

  if (test.description && test.description.trim()) {
    headerLines.push(`Description: ${test.description.trim()}`);
  }

  const questions = test.questions || [];
  if (questions.length === 0) {
    return headerLines.join('\n');
  }

  const formattedQuestions = questions.map((q, idx) => formatQuestionToText(q, idx));

  return `${headerLines.join('\n')}\n\n${formattedQuestions.join('\n\n')}\n`;
}

/**
 * Scans text for inline variable definitions like {speed = 60} or [speed: 60]
 * Extracts the variable name and value into target dictionary,
 * and returns the cleaned text with standard {varName} placeholders.
 */
export function extractInlineVariables(
  text: string,
  targetVars: Record<string, number | string>
): string {
  if (!text) return '';

  // 1. Matches {name = val} or {name: val}
  let result = text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*([^}]+)\}/g, (_, key, valStr) => {
    const trimmedVal = valStr.trim();
    const num = parseFloat(trimmedVal);
    targetVars[key] = !isNaN(num) && String(num) === trimmedVal ? num : trimmedVal;
    return `{${key}}`;
  });

  // 2. Matches [name = val] or [name: val]
  result = result.replace(/\[([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*([^\]]+)\]/g, (_, key, valStr) => {
    const trimmedVal = valStr.trim();
    const num = parseFloat(trimmedVal);
    targetVars[key] = !isNaN(num) && String(num) === trimmedVal ? num : trimmedVal;
    return `{${key}}`;
  });

  return result;
}

/**
 * Helper to parse variable definitions like "speed: 60, time: 2.5" or "speed: 60"
 */
function parseVarDefinitions(rawLine: string, target: Record<string, number | string>) {
  if (!rawLine) return;
  const tokens = rawLine.includes(',') ? rawLine.split(',') : [rawLine];
  for (const token of tokens) {
    const trimmedToken = token.trim();
    if (!trimmedToken) continue;
    const m = trimmedToken.match(/^([a-zA-Z0-9_]+)\s*[:=]\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      const valStr = m[2].trim();
      const num = parseFloat(valStr);
      target[key] = !isNaN(num) && String(num) === valStr ? num : valStr;
    }
  }
}

/**
 * Parses a single question block from sequential plain text.
 */
export function parseQuestionFromText(rawBlock: string, fallbackTopic?: string, defaultId?: string): MathQuestion {
  const lines = rawBlock.split(/\r?\n/);
  
  let qTopic = fallbackTopic || 'General Mathematics';
  let qSubtopic = '';
  let qText = '';
  let qImageUrl = '';
  let qExplanationImageUrl = '';
  const optionsMap: Record<string, string> = {};
  const fixedVars: Record<string, number | string> = {};
  let correctRaw = 'A';
  let explanation = '';
  let hint = '';
  let qPaperLayout: any = undefined;

  let currentField: 'text' | 'explanation' | 'hint' | 'opt' | 'vars' | 'none' = 'none';
  let currentOptKey = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines between fields, unless continuing a multi-line field
    if (!trimmed) {
      if (currentField === 'text' && qText) qText += '\n';
      else if (currentField === 'explanation' && explanation) explanation += '\n';
      else if (currentField === 'hint' && hint) hint += '\n';
      continue;
    }

    // When inside vars block, parse variable definitions directly until a known section keyword is encountered
    if (currentField === 'vars') {
      const isNewSection = /^(?:(?:Q|Question)\s*\d+|Topic:|Subtopic:|Question:|Text:|Prompt:|Image:|ExplanationImage:|Correct(?:\s*Answer)?:\s*[A-H]|Explanation:|Solution:|Exp:|Hint:|PaperLayout:)/i.test(trimmed);
      if (!isNewSection) {
        parseVarDefinitions(line, fixedVars);
        continue;
      } else {
        currentField = 'none';
      }
    }

    // Question number header e.g. "Q1", "Question 1:", "::Q1"
    if (/^(::\s*)?(Q|Question)\s*\d+[:.]?/i.test(trimmed)) {
      currentField = 'none';
      continue;
    }

    // Topic
    const topicMatch = trimmed.match(/^Topic:\s*(.*)$/i);
    if (topicMatch) {
      qTopic = topicMatch[1].trim() || qTopic;
      currentField = 'none';
      continue;
    }

    // Subtopic
    const subtopicMatch = trimmed.match(/^Subtopic:\s*(.*)$/i);
    if (subtopicMatch) {
      qSubtopic = subtopicMatch[1].trim();
      currentField = 'none';
      continue;
    }

    // Question Text prefix
    const qMatch = trimmed.match(/^(?:Question|Text|Prompt):\s*(.*)$/i);
    if (qMatch) {
      qText = qMatch[1];
      currentField = 'text';
      continue;
    }

    // Image diagram URL
    const imgMatch = trimmed.match(/^(?:Image|ImageUrl|Diagram):\s*(.*)$/i);
    if (imgMatch) {
      qImageUrl = imgMatch[1].trim();
      currentField = 'none';
      continue;
    }

    // Explanation Image diagram URL
    const explImgMatch = trimmed.match(/^(?:ExplanationImage|SolutionImage):\s*(.*)$/i);
    if (explImgMatch) {
      qExplanationImageUrl = explImgMatch[1].trim();
      currentField = 'none';
      continue;
    }

    // Options prefix e.g. "A:", "A)", "(A)", "Option A:"
    const optMatch = trimmed.match(/^(?:Option\s*)?([A-H])(?:\:|\)|\.)\s*(.*)$/i);
    if (optMatch) {
      const optLetter = optMatch[1].toUpperCase();
      optionsMap[optLetter] = optMatch[2] || '';
      currentField = 'opt';
      currentOptKey = optLetter;
      continue;
    }

    // Correct Answer prefix e.g. "Correct: A", "Answer: A", "Ans: B"
    const correctMatch = trimmed.match(/^(?:Correct(?:\s*Answer)?|Answer|Ans):\s*(.*)$/i);
    if (correctMatch) {
      correctRaw = correctMatch[1].trim();
      currentField = 'none';
      continue;
    }

    // Explanation / Solution prefix (supports Explanation:, Solution:, Sol:, Exp:)
    const explMatch = trimmed.match(/^(?:Explanation|Solution|Sol|Exp):\s*(.*)$/i);
    if (explMatch) {
      explanation = explMatch[1];
      currentField = 'explanation';
      continue;
    }

    // Hint prefix
    const hintMatch = trimmed.match(/^Hint:\s*(.*)$/i);
    if (hintMatch) {
      hint = hintMatch[1];
      currentField = 'hint';
      continue;
    }

    // Question Paper Layout directive
    const paperLayoutMatch = trimmed.match(/^PaperLayout:\s*(.*)$/i);
    if (paperLayoutMatch) {
      try {
        const parsedLayout = JSON.parse(paperLayoutMatch[1].trim());
        if (parsedLayout && typeof parsedLayout === 'object') {
          qPaperLayout = parsedLayout;
        }
      } catch {}
      currentField = 'none';
      continue;
    }

    // Fixed Variables prefix e.g. "Vars:", "Variables:", "FixedVars:"
    const varsMatch = trimmed.match(/^(?:Vars|Variables|FixedVars):\s*(.*)$/i);
    if (varsMatch) {
      currentField = 'vars';
      const inlineRest = varsMatch[1].trim();
      if (inlineRest) {
        parseVarDefinitions(inlineRest, fixedVars);
      }
      continue;
    }

    // If no keyword matches, append to currently active multi-line field!
    if (currentField === 'text') {
      qText = qText ? `${qText}\n${line}` : line;
    } else if (currentField === 'explanation') {
      explanation = explanation ? `${explanation}\n${line}` : line;
    } else if (currentField === 'hint') {
      hint = hint ? `${hint}\n${line}` : line;
    } else if (currentField === 'vars') {
      parseVarDefinitions(line, fixedVars);
    } else if (currentField === 'opt' && currentOptKey) {
      optionsMap[currentOptKey] = optionsMap[currentOptKey] ? `${optionsMap[currentOptKey]}\n${line}` : line;
    } else if (!qText && trimmed) {
      // If we haven't seen a "Question:" prefix yet and line is non-empty, assume it's question text
      qText = trimmed;
      currentField = 'text';
    }
  }

  // Construct options array
  const sortedOptionKeys = Object.keys(optionsMap).sort();
  const options: string[] = sortedOptionKeys.length > 0
    ? sortedOptionKeys.map(k => optionsMap[k].trim())
    : ['', '', '', ''];

  // Resolve correct answer index
  let correctIdx = 0;
  const upperCorrect = correctRaw.toUpperCase().replace(/[^A-H0-9]/g, '');
  const letterIdx = OPTION_LETTERS.indexOf(upperCorrect);
  if (letterIdx >= 0 && letterIdx < options.length) {
    correctIdx = letterIdx;
  } else {
    const num = parseInt(upperCorrect, 10);
    if (!isNaN(num) && num >= 0 && num < options.length) {
      correctIdx = num;
    } else {
      const matchOptIdx = options.findIndex(o => o.toLowerCase() === correctRaw.toLowerCase());
      if (matchOptIdx >= 0) correctIdx = matchOptIdx;
    }
  }

  // Extract any inline variable assignments: {speed = 60} or [speed: 60]
  qText = extractInlineVariables(qText, fixedVars);
  const cleanedOptions = options.map(opt => extractInlineVariables(opt, fixedVars));
  explanation = extractInlineVariables(explanation, fixedVars);
  if (hint) hint = extractInlineVariables(hint, fixedVars);

  const question: MathQuestion = {
    id: defaultId || `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: qText.trim(),
    topic: qTopic,
    subtopic: qSubtopic || undefined,
    type: 'mcq',
    options: cleanedOptions,
    correctAnswer: String(correctIdx),
    correctOptionIndex: correctIdx,
    explanation: explanation.trim() || undefined,
    solution: explanation.trim() || undefined,
    hint: hint.trim() || undefined,
    points: 1,
  };

  if (qImageUrl) question.imageUrl = qImageUrl;
  if (qExplanationImageUrl) question.explanationImageUrl = qExplanationImageUrl;
  if (qPaperLayout) {
    question.paperLayout = qPaperLayout;
    if (typeof qPaperLayout.imageWidth === 'number' && qPaperLayout.imageWidth > 0) {
      question.imageWidth = qPaperLayout.imageWidth;
    }
    if (Array.isArray(qPaperLayout.imageWidths)) {
      question.imageWidths = qPaperLayout.imageWidths;
    }
  }

  // Fixed variables & dynamic template registration
  const hasFixedVars = Object.keys(fixedVars).length > 0;
  if (hasFixedVars) {
    question.fixedVars = fixedVars;
    question.isDynamic = true;
  } else if (/\{[a-zA-Z0-9_]+\}/.test(qText)) {
    question.isDynamic = true;
  }

  return question;
}

/**
 * Universal Parser: Parses plain text (.txt) OR raw JSON into a MathTest object.
 */
export function parseTestFromText(rawInput: string, fallbackTopic: string = 'General Mathematics'): Partial<MathTest> {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    throw new Error('Input is empty.');
  }

  // 1. If it's JSON, parse using JSON parser
  if (isJsonFormat(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return {
          title: 'Imported Assessment',
          topic: fallbackTopic,
          questions: parsed,
        };
      }
      return parsed;
    } catch (err: any) {
      throw new Error(`JSON Syntax Error: ${err?.message || 'Invalid JSON format'}`);
    }
  }

  // 2. Parse Plain Text (.txt) format
  let title = '';
  let topic = '';
  let timeLimitMinutes = 15;
  let description = '';

  // Separate header metadata from question body
  // Split on first occurrence of major divider "====" or "----"
  const dividerMatch = trimmed.match(/\n[=\-_]{3,}\n/);
  let headerPart = '';
  let bodyPart = '';

  if (dividerMatch && dividerMatch.index !== undefined) {
    headerPart = trimmed.slice(0, dividerMatch.index);
    bodyPart = trimmed.slice(dividerMatch.index + dividerMatch[0].length);
  } else {
    // If no explicit divider, check if first few lines contain Title:/Topic:/Time:
    const lines = trimmed.split(/\r?\n/);
    const headerLines: string[] = [];
    let bodyStartIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (/^(?:Title|Topic|Time|Description):/i.test(l)) {
        headerLines.push(l);
        bodyStartIndex = i + 1;
      } else if (l === '') {
        continue;
      } else {
        break;
      }
    }

    if (headerLines.length > 0) {
      headerPart = headerLines.join('\n');
      bodyPart = lines.slice(bodyStartIndex).join('\n');
    } else {
      bodyPart = trimmed;
    }
  }

  // Parse Header fields
  const hLines = headerPart.split(/\r?\n/);
  for (const hl of hLines) {
    const tMatch = hl.match(/^Title:\s*(.*)$/i);
    if (tMatch && tMatch[1].trim()) title = tMatch[1].trim();

    const topMatch = hl.match(/^Topic:\s*(.*)$/i);
    if (topMatch && topMatch[1].trim()) topic = topMatch[1].trim();

    const timeMatch = hl.match(/^Time:\s*(.*)$/i);
    if (timeMatch && timeMatch[1].trim()) {
      const parsedTime = parseInt(timeMatch[1].trim(), 10);
      if (!isNaN(parsedTime) && parsedTime > 0) timeLimitMinutes = parsedTime;
    }

    const descMatch = hl.match(/^Description:\s*(.*)$/i);
    if (descMatch && descMatch[1].trim()) description = descMatch[1].trim();
  }

  // Split Question blocks in bodyPart
  // Blocks can be separated by dividers "---", "===", or headers "Q1", "Q2", etc.
  const rawBlocks: string[] = [];
  const normalizedBody = bodyPart.trim();

  if (normalizedBody) {
    // Split on divider lines (3 or more dashes/equals/underscores)
    const blocksByDivider = normalizedBody.split(/\n\s*[-=_]{3,}\s*\n/);
    
    for (const b of blocksByDivider) {
      const bTrimmed = b.trim();
      if (!bTrimmed) continue;

      // Check if this block contains multiple questions starting with Q1, Q2, etc.
      // Regex matches lines starting with "Q1", "Q 1", "Question 1", "::Q1"
      const subQuestionStarts = [...bTrimmed.matchAll(/(?:^|\n)(?:(?:Q|Question)\s*\d+[:.]?)/gi)];
      if (subQuestionStarts.length > 1) {
        // Split by question indicators
        const splitIndices: number[] = subQuestionStarts.map(m => m.index!);
        for (let j = 0; j < splitIndices.length; j++) {
          const start = splitIndices[j];
          const end = j + 1 < splitIndices.length ? splitIndices[j + 1] : bTrimmed.length;
          const piece = bTrimmed.slice(start, end).trim();
          if (piece) rawBlocks.push(piece);
        }
      } else {
        rawBlocks.push(bTrimmed);
      }
    }
  }

  const effectiveTopic = topic || fallbackTopic || 'General Mathematics';
  const questions: MathQuestion[] = rawBlocks.map((block, idx) => {
    return parseQuestionFromText(block, effectiveTopic, `q-${idx + 1}`);
  });

  const result: Partial<MathTest> = {
    questions,
    timeLimitMinutes,
    time: timeLimitMinutes,
  };
  if (title) result.title = title;
  if (topic) result.topic = topic;
  if (description) result.description = description;

  return result;
}

/**
 * Safely resolves the exact total time/duration in minutes of a test across all schema variants
 * (timeLimitMinutes, time, durationMinutes, duration).
 */
export function getTestDurationMinutes(test: any): number {
  if (!test) return 15;
  if (typeof test.timeLimitMinutes === 'number' && test.timeLimitMinutes > 0) return test.timeLimitMinutes;
  if (typeof test.time === 'number' && test.time > 0) return test.time;
  if (typeof test.durationMinutes === 'number' && test.durationMinutes > 0) return test.durationMinutes;
  if (typeof test.duration === 'number' && test.duration > 0) return test.duration;
  return 15;
}

/**
 * Cleanly formats test duration into human-readable string (e.g. "45m", "60m").
 */
export function formatTestDurationDisplay(test: any): string {
  const mins = getTestDurationMinutes(test);
  return `${mins}m`;
}
