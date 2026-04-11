import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { IJudgeScores, IRetrievedArticle } from "../models/EvaluationResult.js";

interface JudgeInput {
  question: string;
  expectedAnswer: string;
  actualAnswer: string;
  language: string;
  retrievedArticles: IRetrievedArticle[];
}

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluation judge for a customer support AI copilot system. Your job is to evaluate the quality of AI-generated answers by comparing them against expected (gold standard) answers.

You MUST evaluate across four criteria, each scored 1-5:

1. **Correctness** (1-5): Is the actual answer factually correct compared to the expected answer? Does it contain accurate information?
   - 1: Completely wrong or contradicts the expected answer
   - 3: Partially correct, some key facts present
   - 5: Fully correct, matches the expected answer's facts

2. **Completeness** (1-5): Does the actual answer cover all the key points from the expected answer?
   - 1: Misses all major points
   - 3: Covers some key points but misses others
   - 5: Covers all key points from the expected answer

3. **Relevance** (1-5): Is the actual answer relevant to the question asked? Does it stay on-topic?
   - 1: Completely off-topic
   - 3: Partially relevant but includes significant irrelevant content
   - 5: Highly relevant, directly addresses the question

4. **Faithfulness** (1-5): Is the actual answer faithful to the retrieved knowledge articles/chunks? Does it avoid hallucinating information not present in the sources?
   - 1: Contains significant hallucinations or unsupported claims
   - 3: Mostly faithful but includes some unsupported statements
   - 5: Fully grounded in the retrieved knowledge sources

You must also:
- Detect the language of the actual response
- Check if the response language matches the expected language for the question
- Provide a brief explanation for each score

IMPORTANT: You are multilingual. Evaluate answers in whatever language they are written. The question, expected answer, and actual answer may all be in the same non-English language. Evaluate them in that language's context.

Respond ONLY with valid JSON in this exact format:
{
  "correctness": { "score": <1-5>, "explanation": "<brief explanation>" },
  "completeness": { "score": <1-5>, "explanation": "<brief explanation>" },
  "relevance": { "score": <1-5>, "explanation": "<brief explanation>" },
  "faithfulness": { "score": <1-5>, "explanation": "<brief explanation>" },
  "detectedLanguage": "<ISO 639-1 code, e.g. en, he, ar, fr>",
  "languageMatch": <true/false>
}`;

function buildJudgeUserPrompt(input: JudgeInput): string {
  const articlesText =
    input.retrievedArticles.length > 0
      ? input.retrievedArticles
          .map((a) => {
            const chunksText = a.chunks
              .map((c, i) => `  Chunk ${i + 1}: ${c.content}`)
              .join("\n");
            return `Article: "${a.title}" (${a.chunkCount} chunks)\n${chunksText}`;
          })
          .join("\n\n")
      : "No articles retrieved.";

  return `## Evaluation Task

**Expected response language:** ${input.language}

**Question:**
${input.question}

**Expected Answer (Gold Standard):**
${input.expectedAnswer}

**Actual Answer (AI Response):**
${input.actualAnswer}

**Retrieved Knowledge Articles/Chunks:**
${articlesText}

Please evaluate the actual answer against the expected answer and retrieved knowledge. Return your evaluation as JSON.`;
}

export class JudgeService {
  private client: Anthropic;
  private model: string;

  constructor(model?: string) {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.model = model || config.anthropic.judgeModel;
  }

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  async evaluate(input: JudgeInput): Promise<IJudgeScores> {
    const userPrompt = buildJudgeUserPrompt(input);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from judge model");
    }

    const rawText = textBlock.text.trim();
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      rawText.match(/(\{[\s\S]*\})/);
    
    if (!jsonMatch) {
      throw new Error(`Could not parse judge response as JSON: ${rawText}`);
    }

    const parsed = JSON.parse(jsonMatch[1]);

    const scores: IJudgeScores = {
      correctness: {
        score: clampScore(parsed.correctness?.score),
        explanation: parsed.correctness?.explanation || "",
      },
      completeness: {
        score: clampScore(parsed.completeness?.score),
        explanation: parsed.completeness?.explanation || "",
      },
      relevance: {
        score: clampScore(parsed.relevance?.score),
        explanation: parsed.relevance?.explanation || "",
      },
      faithfulness: {
        score: clampScore(parsed.faithfulness?.score),
        explanation: parsed.faithfulness?.explanation || "",
      },
      overallScore: 0,
      detectedLanguage: parsed.detectedLanguage || input.language,
      languageMatch:
        parsed.languageMatch !== undefined ? parsed.languageMatch : true,
    };

    // Weighted average: equal weights by default
    scores.overallScore = parseFloat(
      (
        (scores.correctness.score +
          scores.completeness.score +
          scores.relevance.score +
          scores.faithfulness.score) /
        4
      ).toFixed(2)
    );

    return scores;
  }
}

function clampScore(value: unknown): number {
  const num = Number(value);
  if (isNaN(num)) return 1;
  return Math.max(1, Math.min(5, Math.round(num)));
}
