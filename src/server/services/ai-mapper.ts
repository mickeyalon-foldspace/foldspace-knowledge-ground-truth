import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

/**
 * AI-powered column mapper. Given the headers and a few sample rows from an
 * uploaded file, asks the LLM to produce a structured mapping to our
 * canonical golden-set schema.
 */

export interface AiColumnMapping {
  format: "flat" | "pivoted";

  // Flat format: direct column → field mapping
  flatMapping?: Record<string, string>;

  // Pivoted format: language-paired columns
  languagePairs?: Array<{
    language: string;
    questionColumn: string;
    answerColumn: string;
  }>;

  // Metadata columns (apply to both formats)
  categoryColumn?: string;
  topicColumn?: string;

  // Columns the AI decided to ignore
  ignoredColumns?: string[];

  reasoning: string;
}

const SYSTEM_PROMPT = `You are a data schema analyst. Your job is to look at spreadsheet column headers and a few sample rows, then map each column to a canonical golden-set schema used for evaluating an AI copilot.

The canonical schema has these fields:
- question (required): The user's question to test the copilot with
- expectedAnswer (required): The gold-standard correct answer
- language (required): ISO 639-1 language code, e.g. "en", "de", "he", "pt-br"
- category (optional): A product or module grouping
- topic (optional): A feature, view, or sub-topic
- expectedArticles (optional): Comma-separated article titles the copilot should retrieve

There are TWO possible file layouts:

1. FLAT: Each row is one question in one language. Columns map directly to the fields above (question, expectedAnswer, language, category, etc.)

2. PIVOTED (multi-language): Each row has a shared context (e.g. product, feature) and then PAIRS of columns for multiple languages. For example:
   "Product | View | User Question (EN) | Backend Prompt (EN) | User Question (DE) | Backend Prompt (DE) | ..."
   The question column and answer column repeat for each language, with the language code embedded in the column name.

Your job:
- Determine which layout the file uses (flat or pivoted)
- For FLAT: map each column header to the canonical field name, or mark it as ignored
- For PIVOTED: identify each (question_column, answer_column, language) triple, plus any metadata columns (category, topic)
- Extract language codes from column names when present (e.g. "(EN)" → "en", "(ES-LATAM)" → "es-latam", "(PT-BR)" → "pt-br")

IMPORTANT RULES:
- The "answer" column could be named anything: "expected answer", "backend prompt", "gold answer", "response", "correct answer", etc. Use context and sample data to decide which column holds the expected answer.
- The "question" column could be named: "user question", "query", "input", "q", etc.
- Columns like "#", "ID", "Row", "No." are row numbers — ignore them.
- Be case-insensitive.
- Language codes in parentheses like (EN), (DE), (HE), (ES-ES), (PT-BR) indicate the language of that column pair.

Respond ONLY with valid JSON in this exact format:
{
  "format": "flat" | "pivoted",
  "flatMapping": { "<original_column_name>": "<canonical_field_name>", ... },
  "languagePairs": [
    { "language": "<code>", "questionColumn": "<exact header>", "answerColumn": "<exact header>" },
    ...
  ],
  "categoryColumn": "<exact header or null>",
  "topicColumn": "<exact header or null>",
  "ignoredColumns": ["<header>", ...],
  "reasoning": "<1-2 sentence explanation>"
}

For flat format, populate flatMapping and leave languagePairs empty.
For pivoted format, populate languagePairs and leave flatMapping empty.
Always use the EXACT original column names from the input (case-sensitive).`;

function buildUserPrompt(
  headers: string[],
  sampleRows: Record<string, string>[]
): string {
  const headerList = headers.map((h, i) => `  ${i + 1}. "${h}"`).join("\n");

  let samplesText = "";
  if (sampleRows.length > 0) {
    samplesText = "\n\nSample rows (first 3):\n";
    for (let i = 0; i < Math.min(3, sampleRows.length); i++) {
      const row = sampleRows[i];
      const cells = headers
        .map((h) => {
          const val = (row[h] || "").substring(0, 120);
          return `  "${h}": "${val}"`;
        })
        .join("\n");
      samplesText += `\nRow ${i + 1}:\n${cells}\n`;
    }
  }

  return `Analyze these spreadsheet columns and map them to the canonical golden-set schema.

Columns (${headers.length} total):
${headerList}
${samplesText}
Return the mapping as JSON.`;
}

export async function aiMapColumns(
  headers: string[],
  sampleRows: Record<string, string>[]
): Promise<AiColumnMapping> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  if (!config.anthropic.apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. AI column mapping requires a valid API key."
    );
  }

  const userPrompt = buildUserPrompt(headers, sampleRows);

  console.log("Calling AI to map file columns to canonical schema...");

  const response = await client.messages.create({
    model: config.anthropic.judgeModel,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from AI mapper");
  }

  const rawText = textBlock.text.trim();
  const jsonMatch =
    rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    rawText.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    throw new Error(`AI mapper returned unparseable response: ${rawText}`);
  }

  const parsed = JSON.parse(jsonMatch[1]);

  // Validate that referenced columns actually exist in the headers
  const headerSet = new Set(headers);

  if (parsed.format === "pivoted" && Array.isArray(parsed.languagePairs)) {
    for (const pair of parsed.languagePairs) {
      if (!headerSet.has(pair.questionColumn)) {
        throw new Error(
          `AI mapped question column "${pair.questionColumn}" but it doesn't exist in the file`
        );
      }
      if (!headerSet.has(pair.answerColumn)) {
        throw new Error(
          `AI mapped answer column "${pair.answerColumn}" but it doesn't exist in the file`
        );
      }
    }
  }

  if (parsed.format === "flat" && parsed.flatMapping) {
    for (const col of Object.keys(parsed.flatMapping)) {
      if (!headerSet.has(col)) {
        throw new Error(
          `AI mapped column "${col}" but it doesn't exist in the file`
        );
      }
    }
  }

  if (parsed.categoryColumn && !headerSet.has(parsed.categoryColumn)) {
    parsed.categoryColumn = null;
  }
  if (parsed.topicColumn && !headerSet.has(parsed.topicColumn)) {
    parsed.topicColumn = null;
  }

  console.log(`AI mapper result: ${parsed.format} format — ${parsed.reasoning}`);

  return {
    format: parsed.format,
    flatMapping: parsed.flatMapping || undefined,
    languagePairs: parsed.languagePairs || undefined,
    categoryColumn: parsed.categoryColumn || undefined,
    topicColumn: parsed.topicColumn || undefined,
    ignoredColumns: parsed.ignoredColumns || [],
    reasoning: parsed.reasoning || "",
  };
}
