/**
 * The first-response wait for a run is the organization's knob per output
 * kind — never a fixed 15 seconds (2026-09-22: an image run in the agent
 * builder died at 15 s while the server was still preparing it).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resilientFetch } from "@ai-matrx/data/net";

jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  ensureEffectiveKnob: jest.fn(),
}));

import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  RUN_STREAM_LIFETIME_BACKSTOP_MS,
  describeSeconds,
  resolveRunWait,
  runJobLabel,
  runOutputKindFromModalities,
  runWaitTimeoutMessage,
} from "../run-wait";

const knob = ensureEffectiveKnob as jest.MockedFunction<typeof ensureEffectiveKnob>;
const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const originalFetch = globalThis.fetch;

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  knob.mockReset();
  if (originalFetch) globalThis.fetch = originalFetch;
  else Reflect.deleteProperty(globalThis, "fetch");
});

describe("run output kind", () => {
  it("reads the slowest output a model can produce", () => {
    expect(runOutputKindFromModalities(["text"])).toBe("text");
    expect(runOutputKindFromModalities(["text", "image"])).toBe("image");
    expect(runOutputKindFromModalities(["image", "video"])).toBe("video");
    expect(runOutputKindFromModalities(["audio"])).toBe("audio");
    expect(runOutputKindFromModalities(undefined)).toBe("text");
  });
});

describe("resolveRunWait", () => {
  it("reads the organization's knob for the run's output kind", async () => {
    knob.mockResolvedValue(300);
    const wait = await resolveRunWait(ORG, "user-1", "image");
    expect(knob).toHaveBeenCalledWith(ORG, "user-1", {
      feature: "agents.run_wait",
      key: "image_seconds",
    });
    expect(wait).toEqual({ firstResponseMs: 300_000, seconds: 300, kind: "image" });
  });

  it("never invents a limit when the setting cannot be read — it says so", async () => {
    knob.mockRejectedValue(new Error("snapshot unavailable"));
    const scream = jest.spyOn(console, "error").mockImplementation(() => {});
    const wait = await resolveRunWait(ORG, null, "image");
    expect(wait.firstResponseMs).toBe(RUN_STREAM_LIFETIME_BACKSTOP_MS);
    expect(wait.seconds).toBeNull();
    expect(scream).toHaveBeenCalledWith(expect.stringContaining("agents.run_wait.image_seconds"));
  });

  it("keeps an image run's handshake alive past the old 15-second cutoff", async () => {
    jest.useFakeTimers();
    knob.mockResolvedValue(300);
    const { firstResponseMs } = await resolveRunWait(ORG, null, "image");
    globalThis.fetch = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(
            () => resolve({ ok: true, status: 200 } as Response),
            40_000,
          );
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(init.signal?.reason ?? new Error("aborted"));
          });
        }),
    ) as typeof fetch;
    const pending = resilientFetch(
      "https://server.example/v2/ai/manual",
      { method: "POST" },
      { connectTimeoutMs: firstResponseMs, totalTimeoutMs: null, throwOnHttpError: false },
    );
    await jest.advanceTimersByTimeAsync(40_000);
    await expect(pending).resolves.toMatchObject({ response: { status: 200 } });
  });
});

describe("what the person is told", () => {
  it("names the job, the model and the wait, and says the run may still finish", () => {
    expect(runJobLabel("image", "Gemini 3.1 Flash Image")).toBe(
      "Generating an image with Gemini 3.1 Flash Image",
    );
    expect(describeSeconds(300)).toBe("5 minutes");
    expect(describeSeconds(90)).toBe("1 minute 30 seconds");
    const message = runWaitTimeoutMessage("image", "Gemini 3.1 Flash Image", 300);
    expect(message).toContain("within 5 minutes");
    expect(message).toContain("Gemini 3.1 Flash Image");
    expect(message).toContain("may still finish");
  });
});

describe("no agent run path carries a fixed first-response wait", () => {
  // The class: a literal connectTimeoutMs on an agent-run stream. Every such
  // wait is the organization's knob, resolved through resolveRunWait.
  const RUN_PATHS = [
    "features/agents/redux/execution-system/thunks/execute-manual-instance.thunk.ts",
    "features/agents/redux/execution-system/thunks/run-ai-stream.ts",
  ];
  it.each(RUN_PATHS)("%s", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).not.toMatch(/connectTimeoutMs:\s*[\d_]+/);
    expect(source).not.toMatch(/CONNECT_TIMEOUT_MS\s*=\s*[\d_]+/);
  });
});
