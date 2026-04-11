/**
 * End-to-end test using the actual PlaywrightEngine class.
 * Run: npx tsx test-e2e.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

// Patch the engine to run headed
import { chromium } from "playwright";
import { PlaywrightEngine } from "./src/server/services/playwright-engine.js";

async function main() {
  console.log("=== Foldspace Ground Truth – E2E Test (headed) ===\n");

  const engine = new PlaywrightEngine();

  // Override initialize to use headed mode
  const origInit = engine.initialize.bind(engine);
  engine.initialize = async () => {
    (engine as any).browser = await chromium.launch({
      headless: false,
      slowMo: 150,
    });
    (engine as any).context = await (engine as any).browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
    (engine as any).page = await (engine as any).context.newPage();
  };

  // Report stages to console
  engine.setStageCallback((stage) => {
    console.log(`   [stage] ${stage}`);
  });

  try {
    console.log("1. Initializing browser...");
    await engine.initialize();

    console.log("2. Logging in...");
    await engine.login();

    console.log("3. Navigating to playground...");
    await engine.navigateToPlayground();

    const question = "How do I create folders?";
    console.log(`4. Asking: "${question}"`);
    const result = await engine.askQuestion(question);

    console.log("\n═══════════════════════════════════════════════");
    console.log("QUESTION:", result.question);
    console.log("───────────────────────────────────────────────");
    console.log("ANSWER (first 600 chars):");
    console.log(result.actualAnswer.substring(0, 600));
    console.log("───────────────────────────────────────────────");
    console.log("RESPONSE TIME:", result.responseTimeMs, "ms");
    console.log("RETRIEVED ARTICLES:", result.retrievedArticles.length);
    for (const article of result.retrievedArticles) {
      console.log(`  • ${article.title} (${article.chunkCount} chunks)`);
      for (const chunk of article.chunks.slice(0, 2)) {
        console.log(`    - ${chunk.content.substring(0, 100)}...`);
      }
    }
    console.log("RAW API RESPONSES:", result.rawApiResponses.length);
    console.log("═══════════════════════════════════════════════");

    console.log("\n✓ E2E test passed! Browser closing in 5s...");
    await new Promise((r) => setTimeout(r, 5000));
  } catch (err) {
    console.error("\n✗ E2E test failed:", err);
  } finally {
    await engine.close();
    console.log("Done.");
  }
}

main();
