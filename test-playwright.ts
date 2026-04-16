import { chromium } from "playwright";

const CREDS = {
  url: "https://dev.app.foldspace.ai/",
  apiBaseUrl: "https://dev.app.foldspace.ai/agent/23603b2d-7332-4b4d-9208-99f2e1090bb3/playground",
  username: "tamarw+dev@foldspace.ai",
  password: "",
};

async function test() {
  console.log("=== Playwright Navigation Test ===\n");

  console.log("[1] Launching browser...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);

  // Step 1: Login
  console.log(`[2] Navigating to login: ${CREDS.url}`);
  await page.goto(CREDS.url, { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(2000);
  console.log(`    Page: ${page.url()}`);

  console.log("[3] Filling credentials...");
  await page.locator('input[name="email"]').fill(CREDS.username);
  await page.locator('input[name="password"]').fill(CREDS.password);

  console.log("[4] Submitting...");
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 })
      .catch(() => page.waitForLoadState("domcontentloaded", { timeout: 10000 })),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForTimeout(3000);
  console.log(`    After login: ${page.url()}`);

  // Step 2: Navigate to playground
  console.log(`[5] Navigating to playground: ${CREDS.apiBaseUrl}`);
  try {
    await page.goto(CREDS.apiBaseUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
  } catch {
    console.log(`    goto timed out, continuing at ${page.url()}`);
  }
  await page.waitForTimeout(3000);
  console.log(`    Page: ${page.url()}`);

  // Step 3: Wait for textarea
  console.log("[6] Waiting for textarea...");
  const textarea = page.locator("textarea").first();
  try {
    await textarea.waitFor({ state: "visible", timeout: 10000 });
    console.log("    Textarea FOUND!");
  } catch {
    console.error("    Textarea NOT FOUND");
    await page.screenshot({ path: "test-textarea-not-found.png", fullPage: true });
    
    // Debug: list all textareas and inputs
    const textareas = await page.locator("textarea").count();
    const inputs = await page.locator("input").count();
    console.log(`    Found ${textareas} textareas, ${inputs} inputs on page`);
    
    await browser.close();
    process.exit(1);
  }

  // Step 4: Type a question
  console.log("[7] Typing test question...");
  await textarea.fill("What is the capital of France?");
  await page.waitForTimeout(300);
  console.log("    Question filled");

  console.log("[8] Pressing Enter...");
  await textarea.press("Enter");
  console.log("    Submitted! Waiting for response...");

  // Wait for response
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    const text = await page.evaluate(() => {
      const wrapper = document.querySelector(".eucera-copilot-main-content-wrapper");
      if (!wrapper) return { thinking: true, text: "", hasAnalysis: false };
      const thinking = !!wrapper.textContent?.includes("Thinking");
      const hasAnalysis = !!wrapper.textContent?.includes("View Analysis");
      return { thinking, text: wrapper.textContent?.substring(0, 200) || "", hasAnalysis };
    });
    console.log(`    Poll ${i+1}/30: thinking=${text.thinking}, hasAnalysis=${text.hasAnalysis}, len=${text.text.length}`);
    if (text.hasAnalysis || (!text.thinking && text.text.length > 100)) {
      console.log("\n=== TEST PASSED === Response received!");
      break;
    }
  }

  console.log("\nKeeping browser open 5s...");
  await page.waitForTimeout(5000);
  await browser.close();
}

test().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
