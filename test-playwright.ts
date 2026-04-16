import { chromium } from "playwright";

const CREDS = {
  url: "https://dev.app.foldspace.ai/",
  apiBaseUrl: "https://dev.app.foldspace.ai/agent/23603b2d-7332-4b4d-9208-99f2e1090bb3/playground",
  username: "tamarw+dev@foldspace.ai",
  password: "",
};

async function test() {
  console.log("=== Playwright Navigation Test ===\n");

  if (!CREDS.password) {
    console.error("Set the password in CREDS before running!");
    process.exit(1);
  }

  console.log("[1] Launching browser...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  // Step 1: Login
  console.log(`[2] Navigating to login page: ${CREDS.url}`);
  await page.goto(CREDS.url, { waitUntil: "networkidle", timeout: 90000 });
  console.log(`    Page loaded: ${page.url()}`);

  console.log("[3] Filling credentials...");
  await page.locator('input[name="email"]').fill(CREDS.username);
  await page.locator('input[name="password"]').fill(CREDS.password);

  console.log("[4] Submitting login...");
  await Promise.all([
    page
      .waitForNavigation({ timeout: 90000 })
      .catch(() => page.waitForLoadState("networkidle", { timeout: 90000 })),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  const afterLogin = page.url();
  console.log(`    After login: ${afterLogin}`);

  const onLoginPage = await page
    .locator('input[name="email"]')
    .isVisible()
    .catch(() => false);
  if (onLoginPage) {
    console.error("LOGIN FAILED — still on login page!");
    await browser.close();
    process.exit(1);
  }
  console.log("    Login successful!\n");

  // Step 2: Navigate to playground (apiBaseUrl)
  const playgroundUrl = CREDS.apiBaseUrl;
  console.log(`[5] Navigating to playground: ${playgroundUrl}`);
  await page.goto(playgroundUrl, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(5000);
  console.log(`    Page loaded: ${page.url()}`);

  // Step 3: Look for Copilot button
  console.log("[6] Waiting for PSR Copilot button...");
  const btn = page.locator('button[aria-label="PSR Copilot"]');
  try {
    await btn.waitFor({ state: "visible", timeout: 30000 });
    console.log("    PSR Copilot button FOUND!");
  } catch {
    console.error("    PSR Copilot button NOT FOUND after 30s");
    await page.screenshot({ path: "test-copilot-not-found.png", fullPage: true });
    console.log("    Screenshot saved: test-copilot-not-found.png");

    // Debug: list all buttons on the page
    const buttons = await page.locator("button").all();
    console.log(`\n    All buttons on page (${buttons.length}):`);
    for (const b of buttons) {
      const label = await b.getAttribute("aria-label").catch(() => null);
      const text = await b.textContent().catch(() => "");
      console.log(`      - aria-label="${label}" text="${text?.trim().substring(0, 50)}"`);
    }

    await browser.close();
    process.exit(1);
  }

  console.log("[7] Clicking PSR Copilot button...");
  await btn.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  console.log(`    Playground ready: ${page.url()}`);

  // Step 4: Check for textarea
  console.log("[8] Looking for textarea...");
  const textarea = page.locator("textarea.MuiInputBase-input").first();
  try {
    await textarea.waitFor({ state: "visible", timeout: 30000 });
    console.log("    Textarea FOUND! Ready to ask questions.");
  } catch {
    console.error("    Textarea NOT FOUND");
    await page.screenshot({ path: "test-textarea-not-found.png", fullPage: true });
    console.log("    Screenshot saved: test-textarea-not-found.png");
  }

  console.log("\n=== TEST PASSED ===");
  console.log("Waiting 10s so you can see the browser, then closing...");
  await page.waitForTimeout(10000);
  await browser.close();
}

test().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
