import { z } from "zod";
import { parse as csvParse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { IGoldenSetEntry } from "../models/GoldenSet.js";
import { aiMapColumns, AiColumnMapping } from "./ai-mapper.js";

// ── Canonical entry validation ──────────────────────────────────────────────

const goldenSetEntrySchema = z.object({
  question: z.string().min(1, "Question is required"),
  expectedAnswer: z
    .string()
    .min(1, "Expected answer is required")
    .transform((v) => v.trim()),
  language: z
    .string()
    .min(1, "Language code is required")
    .transform((v) => v.toLowerCase().trim()),
  category: z.string().optional(),
  topic: z.string().optional(),
  expectedArticles: z
    .union([
      z.array(z.string()),
      z
        .string()
        .transform((v) =>
          v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        ),
    ])
    .optional(),
});

export type ParsedGoldenSet = z.infer<typeof goldenSetEntrySchema>;

/**
 * Validates and filters an array of raw entries, skipping incomplete rows
 * instead of throwing. Returns only rows that pass validation.
 */
function validateAndFilter(
  rawEntries: unknown[]
): { entries: IGoldenSetEntry[]; skipped: number } {
  const entries: IGoldenSetEntry[] = [];
  let skipped = 0;

  for (const raw of rawEntries) {
    const result = goldenSetEntrySchema.safeParse(raw);
    if (result.success) {
      entries.push(result.data as IGoldenSetEntry);
    } else {
      skipped++;
    }
  }

  if (entries.length === 0) {
    const total = rawEntries.length;
    throw new Error(
      `All ${total} row(s) were incomplete or invalid. ` +
        `Each row needs at minimum: question, expectedAnswer, and language.`
    );
  }

  if (skipped > 0) {
    console.log(
      `Skipped ${skipped} incomplete row(s), kept ${entries.length} valid entries`
    );
  }

  return { entries, skipped };
}

// ── Header validation result ────────────────────────────────────────────────

export interface HeaderValidation {
  format: "flat" | "pivoted";
  errors: string[];
  warnings: string[];
  languagePairs?: LanguagePair[];
  flatMapping?: Record<string, string>;
  aiMapped?: boolean;
  aiReasoning?: string;
}

interface LanguagePair {
  language: string;
  questionColumn: string;
  answerColumn: string;
}

// ── Pivoted format detection ────────────────────────────────────────────────
// Matches: "User Question (EN)", "User Question (ES-LATAM)", etc.
const QUESTION_PATTERN = /^user\s*question\s*\(([a-z]{2}(?:-[a-z]+)?)\)$/i;
// Matches: "expected answer (EN)", "Backend Prompt (EN)", "Answer (EN)", "Gold Answer (EN)", "Response (EN)"
const ANSWER_PATTERNS = [
  /^expected\s*answer\s*\(([a-z]{2}(?:-[a-z]+)?)\)$/i,
  /^backend\s*prompt\s*\(([a-z]{2}(?:-[a-z]+)?)\)$/i,
  /^(?:gold\s*)?answer\s*\(([a-z]{2}(?:-[a-z]+)?)\)$/i,
  /^(?:expected\s*)?response\s*\(([a-z]{2}(?:-[a-z]+)?)\)$/i,
];

// Columns that map to product/feature metadata in the pivoted format
const PRODUCT_ALIASES = ["product", "product_name", "module"];
const VIEW_ALIASES = ["view", "feature", "screen", "page", "component"];
const IGNORED_COLUMNS = ["#", "id", "row", "index", "no", "no."];

function matchAnswerColumn(header: string): string | null {
  for (const pattern of ANSWER_PATTERNS) {
    const m = header.match(pattern);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function detectPivotedLayout(headers: string[]): LanguagePair[] | null {
  const questionCols: Map<string, string> = new Map();
  const answerCols: Map<string, string> = new Map();

  for (const h of headers) {
    const qMatch = h.match(QUESTION_PATTERN);
    if (qMatch) {
      questionCols.set(qMatch[1].toLowerCase(), h);
      continue;
    }
    const aLang = matchAnswerColumn(h);
    if (aLang) {
      answerCols.set(aLang, h);
    }
  }

  if (questionCols.size === 0) return null;

  const pairs: LanguagePair[] = [];
  for (const [lang, qCol] of questionCols) {
    const aCol = answerCols.get(lang);
    if (aCol) {
      pairs.push({ language: lang, questionColumn: qCol, answerColumn: aCol });
    }
  }

  return pairs.length > 0 ? pairs : null;
}

function findMetadataColumn(
  headers: string[],
  aliases: string[]
): string | null {
  for (const h of headers) {
    const normalized = h.toLowerCase().replace(/[\s_-]+/g, "");
    for (const alias of aliases) {
      if (normalized === alias.replace(/[\s_-]+/g, "")) {
        return h;
      }
    }
  }
  return null;
}

// ── Header validation ───────────────────────────────────────────────────────

export function validateHeaders(headers: string[]): HeaderValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (headers.length === 0) {
    return { format: "flat", errors: ["File has no columns"], warnings };
  }

  // Try pivoted format first
  const pivotPairs = detectPivotedLayout(headers);

  if (pivotPairs && pivotPairs.length > 0) {
    // Pivoted multi-language format detected

    // Check for orphan question columns (no matching answer)
    const questionCols = new Map<string, string>();
    const answerCols = new Map<string, string>();
    for (const h of headers) {
      const qm = h.match(QUESTION_PATTERN);
      if (qm) {
        questionCols.set(qm[1].toLowerCase(), h);
        continue;
      }
      const aLang = matchAnswerColumn(h);
      if (aLang) answerCols.set(aLang, h);
    }

    for (const [lang, col] of questionCols) {
      if (!answerCols.has(lang)) {
        errors.push(
          `Column "${col}" has no matching answer column for language ${lang.toUpperCase()}`
        );
      }
    }
    for (const [lang, col] of answerCols) {
      if (!questionCols.has(lang)) {
        errors.push(
          `Column "${col}" has no matching "User Question (${lang.toUpperCase()})" column`
        );
      }
    }

    const productCol = findMetadataColumn(headers, PRODUCT_ALIASES);
    const viewCol = findMetadataColumn(headers, VIEW_ALIASES);
    if (!productCol) {
      warnings.push(
        'No "product" column found — entries will have no category'
      );
    }
    if (!viewCol) {
      warnings.push('No "view" / "feature" column found — entries will have no topic');
    }

    const langs = pivotPairs.map((p) => p.language.toUpperCase());
    console.log(
      `Detected pivoted format with ${pivotPairs.length} language(s): ${langs.join(", ")}`
    );

    return { format: "pivoted", errors, warnings, languagePairs: pivotPairs };
  }

  // Fall back to flat format validation
  const flatMapping = normalizeHeaders(headers);

  if (!Object.values(flatMapping).includes("question")) {
    errors.push(
      `No question column found. Expected one of: question, q, user_question, query, input. ` +
        `Got columns: ${headers.join(", ")}`
    );
  }
  if (!Object.values(flatMapping).includes("expectedAnswer")) {
    errors.push(
      `No expected answer column found. Expected one of: expected_answer, answer, expected, golden_answer. ` +
        `Got columns: ${headers.join(", ")}`
    );
  }
  if (!Object.values(flatMapping).includes("language")) {
    errors.push(
      `No language column found. Expected one of: language, lang, locale. ` +
        `Got columns: ${headers.join(", ")}`
    );
  }

  return { format: "flat", errors, warnings, flatMapping };
}

// ── AI-powered fallback mapping ─────────────────────────────────────────────

async function resolveMapping(
  headers: string[],
  sampleRows: Record<string, string>[]
): Promise<HeaderValidation> {
  // Fast path: try regex-based detection first (no API call)
  const regex = validateHeaders(headers);
  if (regex.errors.length === 0) {
    return regex;
  }

  // Regex couldn't map the headers — fall back to AI
  console.log(
    "Regex-based header detection failed, falling back to AI column mapper..."
  );

  try {
    const ai = await aiMapColumns(headers, sampleRows);
    return aiMappingToValidation(ai);
  } catch (aiError) {
    // If AI also fails, return the original regex errors augmented with the AI error
    const aiMsg =
      aiError instanceof Error ? aiError.message : String(aiError);
    regex.errors.push(`AI fallback also failed: ${aiMsg}`);
    return regex;
  }
}

function aiMappingToValidation(ai: AiColumnMapping): HeaderValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (ai.format === "pivoted") {
    if (!ai.languagePairs || ai.languagePairs.length === 0) {
      errors.push("AI detected pivoted format but found no language pairs");
    }
    return {
      format: "pivoted",
      errors,
      warnings,
      languagePairs: ai.languagePairs,
      aiMapped: true,
      aiReasoning: ai.reasoning,
    };
  }

  // Flat
  if (!ai.flatMapping || Object.keys(ai.flatMapping).length === 0) {
    errors.push("AI detected flat format but produced no column mapping");
  } else {
    const fields = Object.values(ai.flatMapping);
    if (!fields.includes("question")) {
      errors.push("AI mapping has no question column");
    }
    if (!fields.includes("expectedAnswer")) {
      errors.push("AI mapping has no expectedAnswer column");
    }
    if (!fields.includes("language")) {
      errors.push("AI mapping has no language column");
    }
  }

  return {
    format: "flat",
    errors,
    warnings,
    flatMapping: ai.flatMapping,
    aiMapped: true,
    aiReasoning: ai.reasoning,
  };
}

// ── Pivoted row parsing ─────────────────────────────────────────────────────

function unpivotRows(
  records: Record<string, string>[],
  pairs: LanguagePair[],
  headers: string[],
  overrideCategoryCol?: string,
  overrideTopicCol?: string
): IGoldenSetEntry[] {
  const productCol = overrideCategoryCol || findMetadataColumn(headers, PRODUCT_ALIASES);
  const viewCol = overrideTopicCol || findMetadataColumn(headers, VIEW_ALIASES);

  const entries: IGoldenSetEntry[] = [];

  for (const row of records) {
    const category = productCol ? (row[productCol] || "").trim() : undefined;
    const topic = viewCol ? (row[viewCol] || "").trim() : undefined;

    for (const pair of pairs) {
      const question = (row[pair.questionColumn] || "").trim();
      const answer = (row[pair.answerColumn] || "").trim();

      // Skip empty Q&A pairs (some languages may be blank for a given row)
      if (!question && !answer) continue;

      if (question && !answer) {
        console.warn(
          `Row has question but no answer for language ${pair.language}: "${question.substring(0, 60)}..."`
        );
        continue;
      }
      if (!question && answer) {
        console.warn(
          `Row has answer but no question for language ${pair.language}`
        );
        continue;
      }

      entries.push({
        question,
        expectedAnswer: answer,
        language: pair.language,
        ...(category ? { category } : {}),
        ...(topic ? { topic } : {}),
      });
    }
  }

  return entries;
}

// ── Flat format helpers ─────────────────────────────────────────────────────

function normalizeHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const knownFields: Record<string, string[]> = {
    question: ["question", "q", "user_question", "query", "input"],
    expectedAnswer: [
      "expected_answer",
      "expectedanswer",
      "answer",
      "expected",
      "golden_answer",
      "gold",
    ],
    language: ["language", "lang", "locale", "lng"],
    category: ["category", "cat", "group", "type", "product"],
    topic: ["topic", "domain", "subject", "view", "feature"],
    expectedArticles: [
      "expected_articles",
      "expectedarticles",
      "articles",
      "expected_docs",
    ],
  };

  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[\s_-]+/g, "");
    for (const [field, aliases] of Object.entries(knownFields)) {
      const normalizedAliases = aliases.map((a) => a.replace(/[\s_-]+/g, ""));
      if (normalizedAliases.includes(normalized)) {
        mapping[header] = field;
        break;
      }
    }
  }
  return mapping;
}

function mapRow(
  row: Record<string, string>,
  headerMap: Record<string, string>
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [originalHeader, fieldName] of Object.entries(headerMap)) {
    if (row[originalHeader] !== undefined && row[originalHeader] !== "") {
      mapped[fieldName] = row[originalHeader];
    }
  }
  return mapped;
}

// ── Format-specific parsers ─────────────────────────────────────────────────

function applyMapping(
  records: Record<string, string>[],
  headers: string[],
  validation: HeaderValidation
): IGoldenSetEntry[] {
  if (validation.format === "pivoted" && validation.languagePairs) {
    const raw = unpivotRows(records, validation.languagePairs, headers);
    return validateAndFilter(raw).entries;
  }

  const headerMap = validation.flatMapping || normalizeHeaders(headers);
  const mapped = records.map((row) => mapRow(row, headerMap));
  return validateAndFilter(mapped).entries;
}

export async function parseCSV(buffer: Buffer): Promise<IGoldenSetEntry[]> {
  const content = buffer.toString("utf-8");
  const records = csvParse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  if (records.length === 0) {
    throw new Error("CSV file is empty");
  }

  const headers = Object.keys(records[0]);
  const validation = await resolveMapping(headers, records.slice(0, 3));

  if (validation.errors.length > 0) {
    throw new Error(
      `CSV header validation failed:\n${validation.errors.join("\n")}`
    );
  }

  return applyMapping(records, headers, validation);
}

export async function parseJSON(buffer: Buffer): Promise<IGoldenSetEntry[]> {
  const content = buffer.toString("utf-8");
  const data = JSON.parse(content);
  const entries = Array.isArray(data) ? data : data.entries || data.questions;
  if (!Array.isArray(entries)) {
    throw new Error(
      "JSON must be an array or an object with an 'entries' or 'questions' field"
    );
  }
  return validateAndFilter(entries).entries;
}

export async function parseXLSX(buffer: Buffer): Promise<IGoldenSetEntry[]> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("XLSX file has no sheets");
  }
  const sheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
  });

  if (records.length === 0) {
    throw new Error("XLSX sheet is empty");
  }

  const headers = Object.keys(records[0]);
  const validation = await resolveMapping(headers, records.slice(0, 3));

  if (validation.errors.length > 0) {
    throw new Error(
      `XLSX header validation failed:\n${validation.errors.join("\n")}`
    );
  }

  return applyMapping(records, headers, validation);
}

export async function parseFile(
  buffer: Buffer,
  format: "csv" | "json" | "xlsx"
): Promise<IGoldenSetEntry[]> {
  switch (format) {
    case "csv":
      return parseCSV(buffer);
    case "json":
      return parseJSON(buffer);
    case "xlsx":
      return parseXLSX(buffer);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

export function detectFormat(
  filename: string
): "csv" | "json" | "xlsx" | null {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "csv":
      return "csv";
    case "json":
      return "json";
    case "xlsx":
    case "xls":
      return "xlsx";
    default:
      return null;
  }
}
