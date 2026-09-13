/** @jest-environment node */

import { createServer, type IncomingMessage, type Server } from "node:http";
import { gzipSync, gunzipSync, zstdCompressSync } from "node:zlib";
import { NextRequest } from "next/server";

jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  lookupSandboxAndOrchestrator: jest.fn(),
}));

import { forwardToOrchestrator } from "@/lib/sandbox/proxy-helpers";

const target = {
  url: "http://unused.invalid",
  apiKey: "test-api-key",
  tier: "hosted" as const,
};

const payloads = {
  gzip: Buffer.from('{"codec":"gzip","items":[3,5,8]}'),
  zstd: Buffer.from('{"codec":"zstd","items":[13,21,34]}'),
  plain: Buffer.from([0x00, 0xff, 0x7f, 0x42, 0x19]),
  sse: Buffer.from('event: result\ndata: {"answer":55}\n\n'),
  error: Buffer.from('{"error":"sandbox path refused"}'),
} satisfies Record<string, Buffer>;

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Loopback server did not expose a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function toHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

describe("forwardToOrchestrator response compression", () => {
  let upstream: Server;
  let downstream: Server;
  let upstreamBaseUrl: string;
  let downstreamBaseUrl: string;

  beforeAll(async () => {
    upstream = createServer(async (request, response) => {
      switch (request.url) {
        case "/gzip":
          response.writeHead(206, {
            "content-encoding": "gzip",
            "content-type": "application/json",
            "x-sandbox-case": "gzip",
          });
          response.end(gzipSync(payloads.gzip));
          return;
        case "/zstd":
          response.writeHead(200, {
            "content-encoding": "zstd",
            "content-type": "application/json",
            "x-sandbox-case": "zstd",
          });
          response.end(zstdCompressSync(payloads.zstd));
          return;
        case "/plain":
          response.writeHead(201, {
            "content-type": "application/octet-stream",
            "x-sandbox-case": "plain",
          });
          response.end(payloads.plain);
          return;
        case "/sse":
          response.writeHead(202, {
            "content-encoding": "gzip",
            "content-type": "text/event-stream",
            "x-sandbox-case": "sse",
          });
          response.end(gzipSync(payloads.sse));
          return;
        case "/error":
          response.writeHead(418, {
            "content-encoding": "gzip",
            "content-type": "application/json",
            "x-sandbox-case": "error",
          });
          response.end(gzipSync(payloads.error));
          return;
        case "/request-encoding": {
          const body = await readRequestBody(request);
          const decoded = gunzipSync(body);
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              contentEncoding: request.headers["content-encoding"],
              authorization: request.headers.authorization ?? null,
              apiKey: request.headers["x-api-key"],
              decoded: decoded.toString("utf8"),
            }),
          );
          return;
        }
        default:
          response.writeHead(404).end();
      }
    });
    upstreamBaseUrl = `http://127.0.0.1:${await listen(upstream)}`;

    downstream = createServer(async (request, response) => {
      const body = await readRequestBody(request);
      const nextRequest = new NextRequest(
        new URL(request.url ?? "/", "http://proxy.test"),
        {
          method: request.method,
          headers: toHeaders(request),
          body: body.length > 0 ? new Uint8Array(body) : undefined,
        },
      );
      const forwarded = await forwardToOrchestrator(
        nextRequest,
        `${upstreamBaseUrl}${request.url}`,
        target,
        { stream: request.url === "/sse" },
      );
      const forwardedBody = Buffer.from(await forwarded.arrayBuffer());
      response.writeHead(
        forwarded.status,
        forwarded.statusText,
        Object.fromEntries(forwarded.headers.entries()),
      );
      response.end(forwardedBody);
    });
    downstreamBaseUrl = `http://127.0.0.1:${await listen(downstream)}`;
  });

  afterAll(async () => {
    await Promise.all([close(downstream), close(upstream)]);
  });

  test.each([
    ["gzip", 206, "application/json", payloads.gzip],
    ["zstd", 200, "application/json", payloads.zstd],
    ["plain", 201, "application/octet-stream", payloads.plain],
    ["sse", 202, "text/event-stream", payloads.sse],
    ["error", 418, "application/json", payloads.error],
  ])(
    "returns the original %s payload through native fetch without a stale representation header",
    async (path, status, contentType, expectedBody) => {
      const response = await fetch(`${downstreamBaseUrl}/${path}`, {
        headers: { "accept-encoding": "gzip, zstd" },
      });

      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain(contentType);
      expect(response.headers.get("x-sandbox-case")).toBe(path);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(expectedBody);
      expect(response.headers.get("content-encoding")).toBeNull();
    },
  );

  test("preserves a compressed request body and its content-encoding while replacing authorization", async () => {
    const requestBody = Buffer.from("request bytes must be decoded exactly once upstream");
    const response = await fetch(`${downstreamBaseUrl}/request-encoding`, {
      method: "POST",
      headers: {
        authorization: "Bearer browser-token-must-not-pass",
        "content-encoding": "gzip",
        "content-type": "application/octet-stream",
      },
      body: gzipSync(requestBody),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contentEncoding: "gzip",
      authorization: null,
      apiKey: "test-api-key",
      decoded: requestBody.toString("utf8"),
    });
  });
});
