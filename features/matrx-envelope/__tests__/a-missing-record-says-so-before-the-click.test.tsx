/**
 * A reference to a record that does not exist says so UP FRONT.
 *
 * THE DEFECT (G2 review, 2026-10-02): a link to a deleted task rendered as an
 * ordinary, clickable "Task" chip and only said "couldn't be found" after the
 * click. The resolvers folded "no such row" and "the read failed" into one
 * `undefined`, so no chip could tell a missing record from a slow network.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

let row: { data: unknown; error: unknown } = { data: null, error: null };

function query() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => row,
  };
  return chain;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: query }), from: query },
}));

// A door that WOULD open — the old chip drew it as a working button.
jest.mock("@/features/matrx-envelope/components/useReferenceDoor", () => ({
  useReferenceDoor: () => ({
    door: { kind: "open" },
    canOpen: true,
    title: "Open",
    primaryHref: null,
    activate: () => undefined,
    newTabHref: null,
    peek: null,
  }),
}));

import { supabase } from "@/utils/supabase/client";
import { getReferenceResolver } from "@/features/matrx-envelope/referenceResolvers";
import { ReferencePickerChip } from "@/features/matrx-envelope/components/ReferencePickerChip";
import type { ReferenceItem } from "@ai-matrx/agents/envelope";

const MISSING = "4127fbc8-0000-4000-8000-00000000dead";

async function flush() {
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("a reference to a record that does not exist", () => {
  it("the resolver tells 'no such record' (null) from 'could not read' (undefined)", async () => {
    const resolver = getReferenceResolver("task")!;
    row = { data: null, error: null };
    await expect(resolver.resolveValue(supabase as never, { id: MISSING })).resolves.toBeNull();
    row = { data: null, error: { message: "timeout" } };
    await expect(resolver.resolveValue(supabase as never, { id: MISSING })).resolves.toBeUndefined();
  });

  it("renders as Not found before any click, with no button to press", async () => {
    row = { data: null, error: null };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <ReferencePickerChip
          item={{ id: MISSING, label: "G2 deleted task" } as unknown as ReferenceItem}
          type="task"
        />,
      );
    });
    await flush();

    expect(host.querySelector("[data-reference-missing]")).not.toBeNull();
    expect(host.textContent).toContain("Not found");
    expect(host.querySelector("button")).toBeNull();

    act(() => root.unmount());
    host.remove();
  });
});
