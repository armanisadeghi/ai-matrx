/**
 * V6-B (2026-10-01): /transcripts and the Knowledge library must show ONE duration for a
 * transcript. /transcripts reads `transcripts.duration_seconds` — the stored recording length,
 * else the last segment's end. The library read only the last segment's end, so a recording with
 * a stored length showed two different numbers. The stored length wins on both screens.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TRANSCRIPT = "11111111-2222-4333-8444-555555555555";

function result(data: unknown) {
  const b: Record<string, unknown> = {};
  for (const op of ["select", "or", "in", "eq"]) b[op] = () => b;
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (schema: string) => ({
      from: () =>
        schema === "transcripts"
          ? result([{ id: TRANSCRIPT, duration: 1003.6 }])
          : result([{ processed_document_id: "doc", locator: { t1_ms: 998_000 } }]),
    }),
  },
}));

import { useTranscriptEnds } from "@/features/sources/hooks/useTranscriptEnds";

it("the library's transcript length is the stored recording length when one is stored", async () => {
  let seen = new Map<string, number>();
  function Probe() {
    seen = useTranscriptEnds([{ id: "doc", source_kind: "transcript", total_pages: 40, source_id: TRANSCRIPT }]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<Probe />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(seen.get("doc")).toBe(1_003_600);
  root.unmount();
});
