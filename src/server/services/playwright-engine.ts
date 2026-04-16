import { chromium, Browser, Page, BrowserContext } from "playwright";
import path from "path";
import fs from "fs";
import { config } from "../config.js";
import { ISearchKnowledge } from "../models/EvaluationResult.js";

const SCREENSHOTS_DIR = path.resolve("screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });


export interface AgentCredentials {
  url: string;
  apiBaseUrl: string;
  backendUrl: string;
  username: string;
  password: string;
}

export interface PlaywrightResult {
  question: string;
  actualAnswer: string;
  searchKnowledge: ISearchKnowledge;
  responseTimeMs: number;
  rawApiResponses: unknown[];
  failed: boolean;
}

export type StageCallback = (stage: string) => void;

export class PlaywrightEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isLoggedIn = false;
  private onStage: StageCallback = () => {};
  private credentials: AgentCredentials | null = null;
  private _logs: string[] = [];
  private onLog: ((line: string) => void) | null = null;

  setStageCallback(cb: StageCallback) {
    this.onStage = cb;
  }

  setLogCallback(cb: (line: string) => void) {
    this.onLog = cb;
  }

  private appendLog(msg: string) {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    this._logs.push(entry);
    if (this._logs.length > 200) this._logs.shift();
    console.log(`[Playwright] ${msg}`);
    if (this.onLog) this.onLog(entry);
  }

  getLogs(): string[] {
    return [...this._logs];
  }

  clearLogs(): void {
    this._logs = [];
  }

  private async screenshot(name: string): Promise<string> {
    if (!this.page) return "";
    const file = path.join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: file, fullPage: true }).catch(() => {});
    this.appendLog(`Screenshot saved: ${file}`);
    return file;
  }

  async initialize(): Promise<void> {
    this.onStage("launching_browser");
    this.appendLog("Launching browser...");
    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-component-extensions-with-background-pages",
        "--no-first-run",
        "--disable-default-apps",
        "--disable-translate",
        "--disable-sync",
        "--single-process",
      ],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(10000);
    this.appendLog("Browser ready");
  }

  async login(creds?: AgentCredentials): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    this.onStage("logging_in");

    if (creds) {
      this.credentials = creds;
    }

    const url = this.credentials?.url || config.foldspace.url;
    const username = this.credentials?.username || config.foldspace.username;
    const password = this.credentials?.password || config.foldspace.password;

    if (!username || !password) {
      throw new Error("Agent username and password are required");
    }

    this.appendLog(`Navigating to ${url}...`);
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    await this.page.waitForTimeout(2000);
    this.appendLog(`Page loaded: ${this.page.url()}`);

    await this.page.locator('input[name="email"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);
    this.appendLog("Credentials filled, submitting...");

    await Promise.all([
      this.page
        .waitForNavigation({ timeout: 10000 })
        .catch(() =>
          this.page!.waitForLoadState("domcontentloaded", { timeout: 10000 })
        ),
      this.page.locator('button[type="submit"]').click(),
    ]);
    await this.page.waitForTimeout(3000);

    // Verify login succeeded by checking we're no longer on the login page
    const currentUrl = this.page.url();
    const onLoginPage = await this.page
      .locator('input[name="email"]')
      .isVisible()
      .catch(() => false);
    if (onLoginPage) {
      await this.screenshot("login-failed");
      const msg = `Login failed — still on login page (${currentUrl}). Check credentials.`;
      this.appendLog(msg);
      throw new Error(msg);
    }

    this.isLoggedIn = true;
    this.appendLog(`Login successful — now at ${this.page.url()}`);
  }

  async navigateToPlayground(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    if (!this.isLoggedIn) await this.login();
    this.onStage("navigating_to_playground");

    const playgroundUrl = this.credentials?.apiBaseUrl || config.foldspace.apiBaseUrl;
    this.appendLog(`Navigating to playground: ${playgroundUrl}`);
    try {
      await this.page.goto(playgroundUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
    } catch {
      this.appendLog(`goto domcontentloaded timed out, continuing anyway at ${this.page.url()}`);
    }
    await this.page.waitForTimeout(3000);
    this.appendLog(`Playground page loaded: ${this.page.url()}`);

    // The playground URL IS the copilot — wait for the textarea to confirm it's ready
    this.appendLog("Waiting for textarea to confirm playground is ready...");
    const textarea = this.page.locator("textarea").first();
    try {
      await textarea.waitFor({ state: "visible", timeout: 10000 });
      this.appendLog("Textarea found — playground is ready");
    } catch {
      await this.screenshot("playground-not-ready");
      this.appendLog(`Textarea not found on ${this.page.url()} — screenshot saved`);
      throw new Error(`Playground not ready — textarea not found on ${this.page.url()}`);
    }
  }

  async askQuestion(question: string): Promise<PlaywrightResult> {
    if (!this.page) throw new Error("Browser not initialized");

    // Capture chatId from the new-chat API response
    let chatId = "";

    const responseHandler = async (response: any) => {
      try {
        const url: string = response.url();
        const ct = response.headers()["content-type"] || "";
        if (response.status() < 200 || response.status() >= 300) return;
        if (!ct.includes("json")) return;

        if (url.includes("/playground/new/chat")) {
          const body = await response.json().catch(() => null);
          if (body?.chatId) chatId = body.chatId;
        }
      } catch {
        // Ignore
      }
    };

    this.page.on("response", responseHandler);

    // Start new chat — this gives us the chatId
    this.onStage("new_chat");
    this.appendLog(`askQuestion: "${question.substring(0, 80)}..." on page ${this.page.url()}`);
    const newChatBtn = this.page.locator('button[aria-label="New Chat"]');
    if (await newChatBtn.isVisible().catch(() => false)) {
      this.appendLog("Clicking New Chat button");
      await newChatBtn.click();
      await this.page.waitForTimeout(1000);
    } else {
      this.appendLog("New Chat button not visible, skipping");
    }

    // Type the question
    this.onStage("typing_question");
    this.appendLog("Looking for textarea...");
    const textarea = this.page.locator("textarea").first();
    try {
      await textarea.waitFor({ state: "visible", timeout: 10000 });
    } catch {
      await this.screenshot("textarea-not-found");
      this.appendLog("Textarea NOT visible — screenshot saved");
      throw new Error("Textarea not found on page");
    }
    this.appendLog("Textarea found, filling question");
    await textarea.fill(question);
    await this.page.waitForTimeout(300);

    // Submit
    this.onStage("waiting_for_response");
    this.appendLog("Pressing Enter to submit question");
    const startTime = Date.now();
    await textarea.press("Enter");

    // Wait for response to fully render:
    // "Thinking" gone + "View Analysis" visible + text stabilized
    let responseText = "";
    let lastTextLen = 0;
    let stableCount = 0;

    this.appendLog("Waiting for response (up to 30 polls x 2s = 60s)...");
    for (let attempt = 0; attempt < 30; attempt++) {
      await this.page.waitForTimeout(2000);

      const result = await this.page.evaluate(() => {
        const wrapper = document.querySelector(
          ".eucera-copilot-main-content-wrapper"
        );
        if (!wrapper) return { thinking: true, text: "", hasAnalysis: false };

        const thinking = !!wrapper.textContent?.includes("Thinking");
        const hasAnalysis = !!wrapper.textContent?.includes("View Analysis");

        const blocks: string[] = [];
        const contentEls = wrapper.querySelectorAll(
          "p, li, h1, h2, h3, h4"
        );
        contentEls.forEach((el) => {
          if (el.querySelector("p, li, h1, h2, h3, h4, ol, ul")) return;
          const t = el.textContent?.trim();
          if (
            t &&
            t.length > 3 &&
            !t.includes("Playground") &&
            !t.includes("Need help") &&
            !t.includes("Thinking") &&
            !t.includes(".cls-") &&
            !t.includes("Powered By") &&
            !t.includes("View Analysis")
          ) {
            blocks.push(t);
          }
        });

        return { thinking, text: blocks.join("\n"), hasAnalysis };
      });

      if (result.thinking || result.text.length === 0) {
        stableCount = 0;
        continue;
      }

      if (result.text.length === lastTextLen) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastTextLen = result.text.length;

      this.appendLog(`Poll ${attempt + 1}/30: thinking=${result.thinking}, textLen=${result.text.length}, stable=${stableCount}, hasAnalysis=${result.hasAnalysis}`);

      if (result.hasAnalysis || stableCount >= 3) {
        const lines = result.text.split("\n");
        const questionLine = lines.findIndex((l) =>
          l.toLowerCase().includes(question.toLowerCase().substring(0, 20))
        );
        if (questionLine >= 0 && questionLine < 2) {
          responseText = lines.slice(questionLine + 1).join("\n");
        } else {
          responseText = result.text;
        }
        this.appendLog(`Response captured after ${attempt + 1} polls (${((Date.now() - startTime) / 1000).toFixed(1)}s), ${responseText.length} chars`);
        break;
      }
    }

    const responseTimeMs = Date.now() - startTime;

    this.page.removeListener("response", responseHandler);

    if (!responseText) {
      await this.screenshot("response-timeout");
      this.appendLog(`TIMEOUT: no response after ${(responseTimeMs / 1000).toFixed(1)}s — screenshot saved`);
      responseText = "Unable to extract response after timeout";
    }

    this.onStage("fetching_analysis");
    this.appendLog(`chatId captured: ${chatId || "NONE"}, backendUrl: ${this.getBackendUrl()}`);
    let searchKnowledge: ISearchKnowledge = { queries: [], chunks: [] };
    const rawApiResponses: unknown[] = [];
    let failed = false;

    const ANALYSIS_TIMEOUT_MS = 30_000;
    const ANALYSIS_POLL_INTERVAL_MS = 3_000;

    if (!chatId) {
      this.appendLog("Waiting for chatId to be captured (up to 30s)...");
      const chatIdDeadline = Date.now() + ANALYSIS_TIMEOUT_MS;
      while (!chatId && Date.now() < chatIdDeadline) {
        await this.page.waitForTimeout(ANALYSIS_POLL_INTERVAL_MS);
        this.appendLog(`chatId poll: ${chatId || "still waiting..."}`);
      }
    }

    if (chatId) {
      const analysisDeadline = Date.now() + ANALYSIS_TIMEOUT_MS;
      let attemptNum = 0;

      while (Date.now() < analysisDeadline) {
        attemptNum++;
        try {
          this.appendLog(`Analysis fetch attempt ${attemptNum}: ${this.getBackendUrl()}/admin/ai/chats/${chatId}`);
          const chatData = await this.fetchChatData(chatId);
          if ((chatData as any).error) {
            this.appendLog(`Chat data returned error: ${(chatData as any).error}, retrying...`);
            await this.page.waitForTimeout(ANALYSIS_POLL_INTERVAL_MS);
            continue;
          }

          const messages = (chatData as any)?.messages;
          let messageId = "";
          if (Array.isArray(messages)) {
            for (let i = messages.length - 1; i >= 0; i--) {
              const msg = messages[i];
              if (msg.id && msg.type !== "USER_MESSAGE") {
                messageId = msg.id;
                break;
              }
            }
          }

          if (!messageId) {
            this.appendLog(`No assistant message ID found yet (attempt ${attemptNum}), retrying...`);
            await this.page.waitForTimeout(ANALYSIS_POLL_INTERVAL_MS);
            continue;
          }

          this.appendLog(`Fetching analysis: chatId=${chatId}, messageId=${messageId}`);
          const analysisData = await this.fetchMessageAnalysis(chatId, messageId);

          if ((analysisData as any).error) {
            this.appendLog(`Analysis returned error: ${(analysisData as any).error}, retrying...`);
            await this.page.waitForTimeout(ANALYSIS_POLL_INTERVAL_MS);
            continue;
          }

          rawApiResponses.push({ type: "chat", data: chatData });
          rawApiResponses.push({ type: "analysis", data: analysisData });
          searchKnowledge = this.extractSearchKnowledge(analysisData);
          this.appendLog(
            `Fetched analysis: ${searchKnowledge.chunks.length} chunks, ${searchKnowledge.queries.length} queries (chatId=${chatId}, messageId=${messageId})`
          );

          if (searchKnowledge.chunks.length > 0) {
            break;
          }

          this.appendLog(`No chunks found yet (attempt ${attemptNum}), retrying...`);
          rawApiResponses.length = 0;
          await this.page.waitForTimeout(ANALYSIS_POLL_INTERVAL_MS);
        } catch (err) {
          this.appendLog(`Analysis API attempt ${attemptNum} failed: ${err instanceof Error ? err.message : String(err)}`);
          if (Date.now() < analysisDeadline) {
            await this.page.waitForTimeout(ANALYSIS_POLL_INTERVAL_MS);
          }
        }
      }

      if (searchKnowledge.chunks.length === 0) {
        this.appendLog("FAILED to get results: could not retrieve analysis/articles after 30s of polling");
        failed = true;
      }
    } else {
      this.appendLog("FAILED to get results: could not capture chatId after 30s of polling");
      failed = true;
    }

    return {
      question,
      actualAnswer: responseText.trim(),
      searchKnowledge,
      responseTimeMs,
      rawApiResponses,
      failed,
    };
  }

  /**
   * Fetch conversation data including all messages.
   * GET {apiBaseUrl}/admin/ai/chats/{chatId}
   */
  private getBackendUrl(): string {
    if (this.credentials?.backendUrl) return this.credentials.backendUrl.replace(/\/$/, "");
    const playgroundUrl = this.credentials?.apiBaseUrl || config.foldspace.apiBaseUrl;
    try {
      const parsed = new URL(playgroundUrl);
      return parsed.origin.replace("app.", "app-be.");
    } catch {
      return playgroundUrl;
    }
  }

  private async fetchChatData(
    chatId: string
  ): Promise<Record<string, unknown>> {
    if (!this.page) throw new Error("Browser not initialized");

    const base = this.getBackendUrl();
    const apiUrl = `${base}/admin/ai/chats/${chatId}`;

    return (await this.page.evaluate(async (url: string) => {
      var resp = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "include",
      });
      if (!resp.ok) return { error: "HTTP " + resp.status };
      return resp.json();
    }, apiUrl)) as Record<string, unknown>;
  }

  /**
   * Fetch detailed message analysis including knowledge articles.
   * POST {apiBaseUrl}/v1/agent/playground/message
   */
  private async fetchMessageAnalysis(
    chatId: string,
    messageId: string
  ): Promise<Record<string, unknown>> {
    if (!this.page) throw new Error("Browser not initialized");

    const base = this.getBackendUrl();
    const apiUrl = `${base}/v1/agent/playground/message`;

    return (await this.page.evaluate(
      async (params: { apiUrl: string; chatId: string; messageId: string }) => {
        var resp = await fetch(params.apiUrl, {
          method: "POST",
          headers: {
            accept: "application/json, text/plain, */*",
            "content-type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            chatId: params.chatId,
            messageId: params.messageId,
          }),
        });
        if (!resp.ok) return { error: "HTTP " + resp.status };
        return resp.json();
      },
      { apiUrl, chatId, messageId }
    )) as Record<string, unknown>;
  }

  /**
   * Extract search queries and retrieved chunks from the playground/message API.
   * Structure: functions[] -> { functionName: "search_knowledge",
   *   arguments: { queryArray: string[] },
   *   result: { data: [{ id, title, content }] } }
   */
  private extractSearchKnowledge(
    data: Record<string, unknown>
  ): ISearchKnowledge {
    const result: ISearchKnowledge = { queries: [], chunks: [] };
    if (data.error) return result;

    try {
      const functions = data.functions as any[];
      if (!Array.isArray(functions)) return result;

      const seenIds = new Set<string>();

      for (const fn of functions) {
        if (fn.functionName !== "search_knowledge") continue;

        // Extract search queries from arguments
        const queryArray = fn.arguments?.queryArray;
        if (Array.isArray(queryArray)) {
          for (const q of queryArray) {
            if (q && !result.queries.includes(q)) {
              result.queries.push(q);
            }
          }
        }

        // Extract chunks from result.data — each item is one chunk
        const items = fn.result?.data;
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          const chunkId = item.id || "";
          if (chunkId && seenIds.has(chunkId)) continue;
          if (chunkId) seenIds.add(chunkId);

          result.chunks.push({
            chunkId,
            title: item.title || item.name || "Untitled",
            content: (item.content as string) || "",
            url: item.url || undefined,
            score: typeof item.score === "number" ? item.score : undefined,
          });
        }
      }
    } catch {
      // Best-effort
    }

    return result;
  }

  async close(): Promise<void> {
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.page = null;
    this.context = null;
    this.browser = null;
    this.isLoggedIn = false;
  }
}
