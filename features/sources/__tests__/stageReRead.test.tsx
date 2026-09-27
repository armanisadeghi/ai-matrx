/**
 * THE STAGE RE-READ (2026-09-27). A Source opened while its processing job was
 * running showed "Indexing…" for ten minutes although the job succeeded twelve
 * seconds after the save: the facts row was read once and never again. The
 * screen must keep re-reading the facts while a job is open and settle on the
 * real stage when it ends — and say so in words when the job ended with no
 * searchable text.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }),
  },
}));

import {
  JOB_ENDED_WITHOUT_TEXT,
  useCurrentVersion,
} from "@/features/sources/hooks/useCurrentVersion";
import { factsPollDelayMs, sourceStage } from "@/features/sources/sourceRows";

function row(indexing: boolean, chunks: number) {
  return {
    data: [
      {
        processed_document_id: "src",
        chunk_count: chunks,
        has_entities: false,
        attachments: [],
        current_document_id: "src",
        current_chunk_count: chunks,
        current_has_entities: false,
        stale_chunk_count: 0,
        indexing,
        head_document_id: "src",
      },
    ],
    error: null,
  };
}

function mount() {
  const seen: { current: ReturnType<typeof useCurrentVersion> | null } = {
    current: null,
  };
  function Probe() {
    seen.current = useCurrentVersion("src");
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  return { seen, root, Probe };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("the Source stage re-reads until the job ends", () => {
  beforeEach(() => {
    rpc.mockReset();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it("an Indexing… read settles to Searchable once the job finishes", async () => {
    rpc
      .mockResolvedValueOnce(row(true, 0))
      .mockResolvedValueOnce(row(true, 0))
      .mockResolvedValue(row(false, 30));
    const { seen, root, Probe } = mount();
    await act(async () => root.render(<Probe />));
    await flush();
    expect(sourceStage(seen.current!.facts!)).toBe("indexing");

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    await flush();
    expect(sourceStage(seen.current!.facts!)).toBe("indexing");

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    await flush();
    expect(sourceStage(seen.current!.facts!)).toBe("searchable");
    expect(seen.current!.jobEndedWithoutText).toBeNull();

    // Settled: it stops asking.
    const calls = rpc.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(rpc.mock.calls.length).toBe(calls);
    act(() => root.unmount());
  });

  it("a job that ends with no chunks says so instead of a bare stage", async () => {
    rpc.mockResolvedValueOnce(row(true, 0)).mockResolvedValue(row(false, 0));
    const { seen, root, Probe } = mount();
    await act(async () => root.render(<Probe />));
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    await flush();
    expect(seen.current!.facts!.indexing).toBe(false);
    expect(seen.current!.jobEndedWithoutText).toBe(JOB_ENDED_WITHOUT_TEXT);
    act(() => root.unmount());
  });

  it("a settled Source is read once and never polled", async () => {
    rpc.mockResolvedValue(row(false, 3));
    const { root, Probe } = mount();
    await act(async () => root.render(<Probe />));
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("the delay is fast while a job is young, slower later, and null when settled", () => {
    expect(factsPollDelayMs(false, 0)).toBeNull();
    expect(factsPollDelayMs(true, 0)).toBe(2_000);
    expect(factsPollDelayMs(true, 120_000)).toBe(5_000);
    expect(factsPollDelayMs(true, 600_000)).toBe(15_000);
  });
});
