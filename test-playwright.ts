import { chromium } from "playwright";

const CREDS = {
  url: "https://dev.app.foldspace.ai/",
  apiBaseUrl: "https://dev.app.foldspace.ai/agent/23603b2d-7332-4b4d-9208-99f2e1090bb3/playground",
  backendUrl: "https://dev.app-be.foldspace.ai",
  username: "tamarw+dev@foldspace.ai",
  password: "",
};

async function test() {
  console.log("=== Playwright Full Flow Test ===\n");

  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  })).newPage();
  page.setDefaultTimeout(10000);

  console.log("[1] Login...");
  await page.goto(CREDS.url, { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.locator('input[name="email"]').fill(CREDS.username);
  await page.locator('input[name="password"]').fill(CREDS.password);
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForTimeout(3000);
  console.log(`    OK: ${page.url()}`);

  console.log(`[2] Playground: ${CREDS.apiBaseUrl}`);
  try { await page.goto(CREDS.apiBaseUrl, { waitUntil: "domcontentloaded", timeout: 10000 }); } catch {}
  await page.waitForTimeout(3000);

  let chatId = "";
  page.on("response", async (r) => {
    try {
      if (r.url().includes("/playground/new/chat") && r.status() < 300) {
        const b = await r.json().catch(() => null);
        if (b?.chatId) chatId = b.chatId;
      }
    } catch {}
  });

  console.log("[3] Asking...");
  const textarea = page.locator("textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 10000 });
  await textarea.fill("What is Optibus?");
  await textarea.press("Enter");

  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const done = await page.evaluate(() =>
      document.querySelector(".eucera-copilot-main-content-wrapper")?.textContent?.includes("View Analysis") || false
    );
    console.log(`    Poll ${i + 1}: done=${done}, chatId=${chatId || "..."}`);
    if (done) break;
  }

  if (!chatId) { console.error("No chatId!"); await browser.close(); process.exit(1); }

  const chatData = await page.evaluate(async (url: string) => {
    const r = await fetch(url, { headers: { accept: "application/json" }, credentials: "include" });
    return r.ok ? r.json() : { error: r.status };
  }, `${CREDS.backendUrl}/admin/ai/chats/${chatId}`) as any;

  if (chatData.error) { console.error(`Chat data: ${chatData.error}`); await browser.close(); process.exit(1); }

  const messages = chatData.messages || [];
  let messageId = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type !== "USER_MESSAGE" && messages[i].id) { messageId = messages[i].id; break; }
  }

  if (!messageId) { console.error("No messageId!"); await browser.close(); process.exit(1); }

  const analysis = await page.evaluate(async (p: { url: string; chatId: string; messageId: string }) => {
    const r = await fetch(p.url, {
      method: "POST",
      headers: { accept: "application/json, text/plain, */*", "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ chatId: p.chatId, messageId: p.messageId }),
    });
    return r.ok ? r.json() : { error: r.status };
  }, { url: `${CREDS.backendUrl}/v1/agent/playground/message`, chatId, messageId }) as any;

  if (analysis.error) {
    console.error(`Analysis: ${analysis.error}`);
  } else {
    const fns = analysis.functions || [];
    for (const fn of fns) {
      if (fn.functionName !== "search_knowledge") continue;
      console.log(`\n[4] search_knowledge: ${fn.result?.data?.length || 0} chunks`);
      console.log(`    queries: ${JSON.stringify(fn.arguments?.queryArray)}`);
      for (const item of (fn.result?.data || [])) {
        console.log(`    - ${item.title} | score=${item.score?.toFixed(3)} | url=${item.url || "none"}`);
      }
    }
  }

  console.log("\n=== DONE ===");
  await page.waitForTimeout(3000);
  await browser.close();
}

test().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
