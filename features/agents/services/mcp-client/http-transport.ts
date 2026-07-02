/**
 * MCP HTTP Transport
 *
 * Implements the Streamable HTTP transport (MCP spec Nov 2025).
 * Handles JSON-RPC 2.0 over HTTP POST, including SSE streaming responses.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  id: number | string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface HttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

let requestCounter = 0;

function nextId(): number {
  return ++requestCounter;
}

/**
 * Send a JSON-RPC 2.0 request over HTTP POST.
 * Returns the parsed response or throws on transport/protocol errors.
 */
export async function sendJsonRpc<T = unknown>(
  options: HttpTransportOptions,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse<T>> {
  const id = nextId();
  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    method,
    id,
    ...(params && { params }),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...options.headers,
  };

  const response = await fetch(options.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeout ?? 30_000),
  });

  if (response.status === 401) {
    throw new McpAuthError(
      "Authentication required",
      response.headers.get("www-authenticate"),
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new McpTransportError(
      `HTTP ${response.status}: ${text.slice(0, 500)}`,
      response.status,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  // Standard JSON response
  if (contentType.includes("application/json")) {
    const json = (await response.json()) as JsonRpcResponse<T>;
    if (json.error) {
      throw new McpRpcError(json.error.code, json.error.message, json.error.data);
    }
    return json;
  }

  // SSE streaming response — collect events and return the final result
  if (contentType.includes("text/event-stream")) {
    return collectSseResponse<T>(response, id);
  }

  throw new McpTransportError(
    `Unexpected content type: ${contentType}`,
    response.status,
  );
}

/**
 * Collect SSE events from a streaming MCP response.
 * MCP servers may stream progress notifications before the final result.
 */
async function collectSseResponse<T>(
  response: Response,
  expectedId: number | string,
): Promise<JsonRpcResponse<T>> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new McpTransportError("No response body for SSE stream", 0);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let result: JsonRpcResponse<T> | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // `split` on a string always yields at least one element, so this is
      // never undefined.
      buffer = lines[lines.length - 1];
      lines.length -= 1;

      let currentData = "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          currentData += line.slice(6);
        } else if (line === "" && currentData) {
          // End of event — parse accumulated data
          try {
            const parsed = JSON.parse(currentData) as JsonRpcResponse<T>;
            if (
              parsed.id === expectedId &&
              (parsed.result !== undefined || parsed.error)
            ) {
              result = parsed;
            }
          } catch {
            // Skip malformed events
          }
          currentData = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!result) {
    throw new McpTransportError("SSE stream ended without a result", 0);
  }

  if (result.error) {
    throw new McpRpcError(result.error.code, result.error.message, result.error.data);
  }

  return result;
}

/**
 * Send the MCP initialize handshake.
 * Must be called before any other method on a new connection.
 */
export async function initializeConnection(
  options: HttpTransportOptions,
): Promise<McpServerCapabilities> {
  const response = await sendJsonRpc<InitializeResult>(options, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {
      roots: { listChanged: false },
    },
    clientInfo: {
      name: "AI Matrx",
      version: "1.0.0",
    },
  });

  if (!response.result) {
    throw new McpTransportError("Empty initialize response", 0);
  }

  // Send initialized notification (no response expected)
  // Per spec, this is a notification (no id field), but we use our helper
  // and ignore the response.
  try {
    await sendJsonRpc(options, "notifications/initialized");
  } catch {
    // Notifications may not return a response — that's OK
  }

  return {
    protocolVersion: response.result.protocolVersion,
    serverInfo: response.result.serverInfo,
    capabilities: response.result.capabilities ?? {},
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpServerCapabilities {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities: Record<string, unknown>;
}

interface InitializeResult {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities?: Record<string, unknown>;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class McpAuthError extends Error {
  constructor(
    message: string,
    public wwwAuthenticate: string | null,
  ) {
    super(message);
    this.name = "McpAuthError";
  }
}

export class McpTransportError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "McpTransportError";
  }
}

export class McpRpcError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "McpRpcError";
  }
}
