import { Router } from "express";
import { handleGenerateDiagram, handleAiEditTest } from "../../../src/server/testStudioAiServices.ts";
import { getAiClient, generateWithFallback } from "../../lib/ai.js";

const router = Router();

router.post("/generate-diagram", handleGenerateDiagram);
router.post("/ai-edit-test", handleAiEditTest);

router.post("/explain-math-question", async (req, res) => {
  try {
    const { questionText, options, userAnswer, correctAnswer, explanation } = req.body || {};
    if (!questionText) {
      return res.status(400).json({ error: "Missing questionText parameter" });
    }

    const ai = getAiClient();
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

    const response = await generateWithFallback(ai, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const explanationText = response?.text || (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (explanationText) {
      return res.json({ explanation: explanationText });
    }
    return res.json({
      explanation: `**Correct Answer:** \`${correctAnswer}\`\n\n**Step-by-Step Explanation:**\n${explanation || 'Review the core definitions and formulas for this question.'}`,
    });
  } catch (err: any) {
    console.error("Error in /api/explain-math-question:", err);
    const fallback = req.body?.explanation || `**Correct Answer:** \`${req.body?.correctAnswer || 'N/A'}\`\n\nApply foundational theorems and identities to verify this solution.`;
    return res.json({ explanation: fallback });
  }
});

export default router;
