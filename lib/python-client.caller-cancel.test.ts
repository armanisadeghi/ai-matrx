/** @jest-environment node */

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-token" } },
        error: null,
      })),
    },
  },
}));

jest.mock("@/lib/redux/store-singleton", () => ({ getStore: () => null }));
jest.mock("@/lib/services/fingerprint-service", () => ({
  getCachedFingerprint: () => null,
}));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/diagnostics/capturePythonClientError", () => ({
  capturePythonClientError: jest.fn(),
  relationPathFromUrl: (path: string) => path.split("?")[0],
}));

import { capturePythonClientError } from "@/lib/diagnostics/capturePythonClientError";
import { getJson, postJson, requestRaw, uploadWithProgress } from "@/lib/python-client";

/**
 * A request the caller cancelled is not an incident (live 2026-10-01: the
 * inspector filed "signal is aborted without reason" for a superseded search).
 * python-client's one failure chokepoint (`failClient`) skips the capture when
 * the caller's own signal aborted; a TimeoutError reason still captures.
 */
const captureMock = jest.mocked(capturePythonClientError);
const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

function hangUntilAborted() {
  global.fetch = jest.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const fail = () =>
          reject(init?.signal?.reason ?? new DOMException("signal is aborted without reason", "AbortError"));
        if (init?.signal?.aborted) fail();
        init?.signal?.addEventListener("abort", fail);
      }),
  ) as unknown as typeof fetch;
}

describe("python-client and a cancelled request", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hangUntilAborted();
  });

  it.each([
    ["postJson", (signal: AbortSignal) =>
      postJson("/knowledge/search", { query: "renewal terms" }, {
        signal, baseUrlOverride: "https://server.example.test", organizationId: ORG,
      })],
    ["getJson", (signal: AbortSignal) =>
      getJson("/knowledge/search", {
        signal, baseUrlOverride: "https://server.example.test", organizationId: ORG,
      })],
    ["requestRaw", (signal: AbortSignal) =>
      requestRaw("/knowledge/search", { method: "POST", signal }, {
        baseUrlOverride: "https://server.example.test", organizationId: ORG,
      })],
  ])("%s: the caller aborts — it rejects, nothing is filed", async (_name, call) => {
    const controller = new AbortController();
    const pending = call(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("the caller's signal times out: a failure, filed", async () => {
    const controller = new AbortController();
    const pending = postJson("/knowledge/search", { query: "renewal terms" }, {
      signal: controller.signal, baseUrlOverride: "https://server.example.test", organizationId: ORG,
    });
    await new Promise((r) => setTimeout(r, 0));
    controller.abort(new DOMException("timed out", "TimeoutError"));
    await expect(pending).rejects.toBeDefined();
    expect(captureMock).toHaveBeenCalledTimes(1);
  });
});

/** The upload transport is an XHR: a minimal stand-in that only knows abort. */
class FakeXhr {
  upload = { addEventListener: () => {} };
  timeout = 0;
  private listeners: Record<string, Array<() => void>> = {};
  open() {}
  setRequestHeader() {}
  send() {}
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  abort() {
    for (const fn of this.listeners.abort ?? []) fn();
  }
}

describe("uploadWithProgress and a cancelled upload", () => {
  const original = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
  });
  afterAll(() => {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = original;
  });

  function upload(signal: AbortSignal) {
    return uploadWithProgress("/files/upload", new FormData(), () => {}, {
      signal, baseUrlOverride: "https://server.example.test", organizationId: ORG,
    });
  }

  it("the person cancels: it rejects, nothing is filed", async () => {
    const controller = new AbortController();
    const pending = upload(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("an abort the caller never asked for is filed", async () => {
    const controller = new AbortController();
    let xhr: FakeXhr | undefined;
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = class extends FakeXhr {
      constructor() {
        super();
        xhr = this;
      }
    };
    const pending = upload(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    xhr!.abort();
    await expect(pending).rejects.toBeDefined();
    expect(captureMock).toHaveBeenCalledTimes(1);
  });
});
