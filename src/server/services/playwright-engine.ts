import { chromium, Browser, Page, BrowserContext } from "playwright";
import path from "path";
import fs from "fs";
import { config } from "../config.js";
import { ISearchKnowledge } from "../models/EvaluationResult.js";

const SCREENSHOTS_DIR = path.resolve("screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });


export interface AgentCredentials {
  url: string;
  playgroundUrl?: string;
  apiBaseUrl: string;
  username: string;
  password: string;
}

export interface PlaywrightResult {
  question: string;
  actualAnswer: string;
  searchKnowledge: ISearchKnowledge;
  responseTimeMs: number;
  rawApiResponses: unknown[];
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
    this.page.setDefaultTimeout(90000);
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
    await this.page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
    this.appendLog(`Page loaded: ${this.page.url()}`);

    await this.page.locator('input[name="email"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);
    this.appendLog("Credentials filled, submitting...");

    await Promise.all([
      this.page
        .waitForNavigation({ timeout: 90000 })
        .catch(() =>
          this.page!.waitForLoadState("networkidle", { timeout: 90000 })
        ),
      this.page.locator('button[type="submit"]').click(),
    ]);
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(2000);

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

    // Navigate to the playground URL (the page with the Copilot button)
    const playgroundUrl = this.credentials?.playgroundUrl;
    if (playgroundUrl) {
      this.appendLog(`Navigating to playground URL: ${playgroundUrl}`);
      await this.page.goto(playgroundUrl, { waitUntil: "networkidle", timeout: 90000 });
      await this.page.waitForTimeout(2000);
      this.appendLog(`Playground page loaded: ${this.page.url()}`);
    } else {
      this.appendLog(`No playground URL set, staying on current page: ${this.page.url()}`);
    }

    this.appendLog("Looking for PSR Copilot button...");
    const btn = this.page.locator('button[aria-label="PSR Copilot"]');
    const visible = await btn.isVisible().catch(() => false);

    if (!visible) {
      await this.screenshot("copilot-button-not-found");
      this.appendLog(`PSR Copilot button not visible on ${this.page.url()} — screenshot saved`);
    }

    await btn.click();
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(2000);

    this.appendLog(`Playground ready: ${this.page.url()}`);
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
      await this.page.waitForTimeout(1500);
    } else {
      this.appendLog("New Chat button not visible, skipping");
    }

    // Type the question
    this.onStage("typing_question");
    this.appendLog("Looking for textarea...");
    const textarea = this.page.locator("textarea.MuiInputBase-input").first();
    const textareaVisible = await textarea.isVisible().catch(() => false);
    if (!textareaVisible) {
      await this.screenshot("textarea-not-found");
      this.appendLog("Textarea NOT visible — screenshot saved");
    }
    await textarea.waitFor({ state: "visible", timeout: 60000 });
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

    this.appendLog("Waiting for response (up to 90 polls x 2s = 180s)...");
    for (let attempt = 0; attempt < 90; attempt++) {
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

      if (attempt % 10 === 9) {
        this.appendLog(`Poll ${attempt + 1}/90: thinking=${result.thinking}, textLen=${result.text.length}, stable=${stableCount}, hasAnalysis=${result.hasAnalysis}`);
      }

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
    this.appendLog(`chatId captured: ${chatId || "NONE"}`);
    let searchKnowledge: ISearchKnowledge = { queries: [], chunks: [] };
    const rawApiResponses: unknown[] = [];

    if (chatId) {
      try {
        const chatData = await this.fetchChatData(chatId);
        rawApiResponses.push({ type: "chat", data: chatData });

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

        if (messageId) {
          const analysisData = await this.fetchMessageAnalysis(
            chatId,
            messageId
          );
          rawApiResponses.push({ type: "analysis", data: analysisData });
          searchKnowledge =
            this.extractSearchKnowledge(analysisData);
          this.appendLog(
            `Fetched analysis: ${searchKnowledge.chunks.length} chunks, ${searchKnowledge.queries.length} queries (chatId=${chatId}, messageId=${messageId})`
          );
        } else {
          this.appendLog("WARNING: No assistant message ID found in chat data");
        }
      } catch (err) {
        this.appendLog(`Analysis API call failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      this.appendLog("WARNING: Could not capture chatId from new-chat response");
    }

    return {
      question,
      actualAnswer: responseText.trim(),
      searchKnowledge,
      responseTimeMs,
      rawApiResponses,
    };
  }

  /**
   * Fetch conversation data including all messages.
   * GET {apiBaseUrl}/admin/ai/chats/{chatId}
   */
  private async fetchChatData(
    chatId: string
  ): Promise<Record<string, unknown>> {
    if (!this.page) throw new Error("Browser not initialized");

    const base = this.credentials?.apiBaseUrl || config.foldspace.apiBaseUrl;
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

    const base = this.credentials?.apiBaseUrl || config.foldspace.apiBaseUrl;
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
