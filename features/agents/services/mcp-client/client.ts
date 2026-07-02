/**
 * MCP Client
 *
 * High-level client for connecting to MCP servers. Manages initialization,
 * tool discovery, and tool invocation for a single server connection.
 *
 * Usage:
 *   const client = new McpClient({ url, headers });
 *   await client.connect();
 *   const tools = client.getTools();
 *   const result = await client.callTool("search", { query: "hello" });
 */

import { extractErrorMessage } from "@/utils/errors";
import {
  initializeConnection,
  type HttpTransportOptions,
  type McpServerCapabilities,
  McpAuthError,
} from "./http-transport";
import { discoverTools, discoverResources, discoverPrompts } from "./tool-discovery";
import type { McpToolSchema, McpResource, McpPrompt } from "./tool-discovery";
import { invokeTool, readResource, executePrompt } from "./tool-invoker";
import type { McpToolResult, McpResourceContent, McpPromptMessage } from "./tool-invoker";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpClientConfig {
  /** Server endpoint URL */
  url: string;
  /** Auth headers (Bearer token, API key, etc.) */
  headers?: Record<string, string>;
  /** Connection timeout in ms (default 30s) */
  timeout?: number;
  /** Max retries for transient failures */
  maxRetries?: number;
  /** Backoff base in ms (default 1000) */
  backoffMs?: number;
}

export type McpClientStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface McpClientState {
  status: McpClientStatus;
  serverInfo: McpServerCapabilities | null;
  tools: McpToolSchema[];
  resources: McpResource[];
  prompts: McpPrompt[];
  error: string | null;
  lastConnected: string | null;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class McpClient {
  private transportOptions: HttpTransportOptions;
  private maxRetries: number;
  private backoffMs: number;
  private state: McpClientState = {
    status: "disconnected",
    serverInfo: null,
    tools: [],
    resources: [],
    prompts: [],
    error: null,
    lastConnected: null,
  };

  constructor(config: McpClientConfig) {
    this.transportOptions = {
      url: config.url,
      headers: config.headers,
      timeout: config.timeout ?? 30_000,
    };
    this.maxRetries = config.maxRetries ?? 3;
    this.backoffMs = config.backoffMs ?? 1000;
  }

  /**
   * Connect to the MCP server: initialize + discover tools.
   * Throws McpAuthError if the server requires authentication.
   */
  async connect(): Promise<McpClientState> {
    this.state.status = "connecting";
    this.state.error = null;

    try {
      // Step 1: Initialize the protocol handshake
      const serverInfo = await this.withRetry(() =>
        initializeConnection(this.transportOptions),
      );
      this.state.serverInfo = serverInfo;

      // Step 2: Discover capabilities in parallel
      const [tools, resources, prompts] = await Promise.allSettled([
        this.withRetry(() => discoverTools(this.transportOptions)),
        this.withRetry(() => discoverResources(this.transportOptions)).catch(
          () => [] as McpResource[],
        ),
        this.withRetry(() => discoverPrompts(this.transportOptions)).catch(
          () => [] as McpPrompt[],
        ),
      ]);

      this.state.tools =
        tools.status === "fulfilled" ? tools.value : [];
      this.state.resources =
        resources.status === "fulfilled" ? resources.value : [];
      this.state.prompts =
        prompts.status === "fulfilled" ? prompts.value : [];

      this.state.status = "connected";
      this.state.lastConnected = new Date().toISOString();

      return this.getState();
    } catch (err) {
      this.state.status = "error";
      this.state.error =
        err instanceof Error ? err.message : "Connection failed";

      if (err instanceof McpAuthError) {
        throw err; // Re-throw auth errors for the caller to handle
      }

      throw err;
    }
  }

  /**
   * Invoke a tool by name with the given arguments.
   */
  async callTool(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<McpToolResult> {
    if (this.state.status !== "connected") {
      throw new Error(`MCP client not connected (status: ${this.state.status})`);
    }

    return this.withRetry(() =>
      invokeTool(this.transportOptions, { name, arguments: args }),
    );
  }

  /**
   * Read a resource by URI.
   */
  async getResource(uri: string): Promise<McpResourceContent[]> {
    if (this.state.status !== "connected") {
      throw new Error(`MCP client not connected (status: ${this.state.status})`);
    }

    return this.withRetry(() => readResource(this.transportOptions, uri));
  }

  /**
   * Execute a prompt template.
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<McpPromptMessage[]> {
    if (this.state.status !== "connected") {
      throw new Error(`MCP client not connected (status: ${this.state.status})`);
    }

    return this.withRetry(() =>
      executePrompt(this.transportOptions, name, args),
    );
  }

  /**
   * Re-discover tools (e.g., after reconnection or token refresh).
   */
  async refreshTools(): Promise<McpToolSchema[]> {
    const tools = await this.withRetry(() =>
      discoverTools(this.transportOptions),
    );
    this.state.tools = tools;
    return tools;
  }

  /**
   * Update the auth headers (e.g., after token refresh).
   */
  updateHeaders(headers: Record<string, string>): void {
    this.transportOptions.headers = {
      ...this.transportOptions.headers,
      ...headers,
    };
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  getState(): McpClientState {
    return { ...this.state };
  }

  getTools(): McpToolSchema[] {
    return this.state.tools;
  }

  getResources(): McpResource[] {
    return this.state.resources;
  }

  getPrompts(): McpPrompt[] {
    return this.state.prompts;
  }

  getStatus(): McpClientStatus {
    return this.state.status;
  }

  /**
   * Find a tool by name in the discovered tools.
   */
  findTool(name: string): McpToolSchema | undefined {
    return this.state.tools.find((t) => t.name === name);
  }

  // ─── Retry Logic ───────────────────────────────────────────────────────────

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(extractErrorMessage(err));

        // Don't retry auth errors
        if (err instanceof McpAuthError) throw err;

        if (attempt < this.maxRetries) {
          const delay = this.backoffMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // The loop runs at least once (attempt starts at 0, condition is <=) and
    // every iteration either returns or sets lastError, so this is always set
    // by the time the loop exits. Guard honestly rather than assert.
    throw lastError ?? new Error("withRetry exhausted with no captured error");
  }
}
