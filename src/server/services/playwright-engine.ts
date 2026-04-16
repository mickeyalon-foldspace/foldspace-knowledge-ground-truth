import { chromium, Browser, Page, BrowserContext } from "playwright";
import { config } from "../config.js";
import { ISearchKnowledge } from "../models/EvaluationResult.js";

export interface AgentCredentials {
  url: string;
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

  setStageCallback(cb: StageCallback) {
    this.onStage = cb;
  }

  async initialize(): Promise<void> {
    this.onStage("launching_browser");
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

    await this.page.goto(url, { waitUntil: "networkidle", timeout: 90000 });

    await this.page.locator('input[name="email"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);

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
      throw new Error(
        `Login failed — still on login page (${currentUrl}). Check credentials.`
      );
    }

    this.isLoggedIn = true;
    console.log(`Logged in to ${url}`);
  }

  async navigateToPlayground(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");
    if (!this.isLoggedIn) await this.login();
    this.onStage("navigating_to_playground");

    // Click the sidebar "PSR Copilot" button
    await this.page.locator('button[aria-label="PSR Copilot"]').click();
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(2000);

    console.log("Navigated to playground:", this.page.url());
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
    const newChatBtn = this.page.locator('button[aria-label="New Chat"]');
    if (await newChatBtn.isVisible().catch(() => false)) {
      await newChatBtn.click();
      await this.page.waitForTimeout(1500);
    }

    // Type the question
    this.onStage("typing_question");
    const textarea = this.page.locator("textarea.MuiInputBase-input").first();
    await textarea.waitFor({ state: "visible", timeout: 60000 });
    await textarea.fill(question);
    await this.page.waitForTimeout(300);

    // Submit
    this.onStage("waiting_for_response");
    const startTime = Date.now();
    await textarea.press("Enter");

    // Wait for response to fully render:
    // "Thinking" gone + "View Analysis" visible + text stabilized
    let responseText = "";
    let lastTextLen = 0;
    let stableCount = 0;

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
        break;
      }
    }

    const responseTimeMs = Date.now() - startTime;

    this.page.removeListener("response", responseHandler);

    if (!responseText) {
      responseText = "Unable to extract response after timeout";
    }

    // Fetch analysis via direct API calls:
    // 1. GET /admin/ai/chats/{chatId} → messages[] → find assistant messageId
    // 2. POST /agent/playground/message { chatId, messageId } → functions[].result.data[]
    this.onStage("fetching_analysis");
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
          console.log(
            `Fetched analysis: ${searchKnowledge.chunks.length} chunks, ${searchKnowledge.queries.length} queries (chatId=${chatId}, messageId=${messageId})`
          );
        } else {
          console.warn("No assistant message ID found in chat data");
        }
      } catch (err) {
        console.error("Analysis API call failed:", err);
      }
    } else {
      console.warn("Could not capture chatId from new-chat response");
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
