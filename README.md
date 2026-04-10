# Foldspace Ground Truth Evaluation Service

A ground truth evaluation service for the Foldspace FSR Copilot. Upload golden sets of questions and expected answers, run them against the live copilot via Playwright, and score the results with an Anthropic-powered LLM judge.

## Features

- **Golden Set Ingestion**: Upload CSV, JSON, or XLSX files with questions and expected answers
- **Automated Testing**: Playwright logs into Foldspace, sends each question, and captures the response
- **Knowledge Retrieval Tracking**: Intercepts API calls to capture which articles and chunks were retrieved
- **Multi-Criteria LLM Judge**: Evaluates responses on correctness, completeness, relevance, and faithfulness (1-5 scale)
- **Multi-Language Support**: Dynamic language per question, RTL display for Hebrew/Arabic, language match detection
- **Dashboard**: Next.js web UI with score charts, per-language breakdowns, expandable result details

## Prerequisites

- Node.js 18+
- Docker (for MongoDB) or a MongoDB Atlas connection string
- An Anthropic API key
- Foldspace account credentials

## Setup

1. **Clone and install**:
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Start MongoDB**:
   ```bash
   docker compose up -d
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Run the app**:
   ```bash
   npm run dev
   ```

   This starts:
   - API server on `http://localhost:3001`
   - Dashboard on `http://localhost:3000`

## Golden Set Format

Your golden set file should have these columns/fields:

| Field | Required | Description |
|-------|----------|-------------|
| `question` | Yes | The user question to test |
| `expected_answer` | Yes | The gold standard answer |
| `language` | Yes | ISO 639-1 language code (en, he, ar, fr, etc.) |
| `category` | No | Optional grouping |
| `topic` | No | Optional domain/topic |
| `expected_articles` | No | Comma-separated list of expected article titles |

Column header names are flexible (e.g., `q`, `query`, `input` all map to `question`).

## Usage

1. Navigate to **Golden Sets** and upload your file
2. Go to **Evaluation Runs**, select a golden set and judge model, click **Start Evaluation**
3. Monitor progress in real time
4. View detailed results with score breakdowns, retrieved articles, and judge explanations

## Architecture

```
src/
  server/           # Express API + services
    services/
      ingestion.ts        # File parsing (CSV, JSON, XLSX)
      playwright-engine.ts # Browser automation
      judge.ts             # Anthropic LLM judge
      runner.ts            # Evaluation orchestrator
    routes/
      goldenSets.ts  # Upload, list, delete golden sets
      runs.ts        # Start, cancel, monitor runs
      results.ts     # Query results, stats
    models/          # Mongoose schemas
  client/            # Next.js dashboard
    app/             # Pages (dashboard, golden-sets, runs)
    components/      # Reusable UI components
    lib/             # API client, RTL utilities
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `FOLDSPACE_URL` | Foldspace app URL | `https://app.foldspace.ai/` |
| `FOLDSPACE_USERNAME` | Login email | - |
| `FOLDSPACE_PASSWORD` | Login password | - |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/ground-truth` |
| `ANTHROPIC_API_KEY` | Anthropic API key for judge | - |
| `JUDGE_MODEL` | Default judge model | `claude-sonnet-4-20250514` |
| `PORT` | API server port | `3001` |
# foldspace-knowledge-ground-truth
