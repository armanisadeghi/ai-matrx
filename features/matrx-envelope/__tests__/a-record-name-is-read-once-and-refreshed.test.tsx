/**
 * ONE RECORD, ONE NAME — read once for every label naming it, and read again
 * when an apply changes it (LANE-C, 2026-10-02).
 *
 * Two defects on the directive card, one class (`useResolvedReferenceLabel`):
 *  - the Delete dialog's title showed "LANE-C timing probe 1" while its
 *    sentence still showed "Task 31fc9198": two labels, two independent reads;
 *  - after an Update applied, the card's own row kept the OLD name beside its
 *    "Updated task. → LANE-C probe renamed" tally: a label never re-read.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/utils/supabase/client", () => (require("@/tests/helpers/emptySupabaseClient") as typeof import("@/tests/helpers/emptySupabaseClient")).emptySupabaseClientModule());

import {
  getReferenceResolver,
  invalidateReferenceLabel,
  useResolvedReferenceLabel,
} from "@/features/matrx-envelope/referenceResolvers";
import type { ReferenceItem } from "@ai-matrx/agents/envelope";

const ID = "4127fbc8-0000-4000-8000-0000000000c1";

function Label({ testId }: { testId: string }) {
  const { display } = useResolvedReferenceLabel({ id: ID } as ReferenceItem, "task");
  return <span data-testid={testId}>{display}</span>;
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it("two labels naming one record share ONE read, and an invalidation re-reads both", async () => {
  const resolver = getReferenceResolver("task");
  expect(resolver).toBeDefined();
  expect(getReferenceResolver("task")).toBe(resolver); // a stable object to spy on
  let name = "Before";
  const read = jest.spyOn(resolver!, "resolveValue").mockImplementation(async () => name);

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <>
        <Label testId="title" />
        <Label testId="sentence" />
      </>,
    );
  });
  await flush();

  const text = (id: string) => host.querySelector(`[data-testid="${id}"]`)?.textContent;
  expect(text("title")).toBe("Before");
  expect(text("sentence")).toBe("Before");
  expect(read).toHaveBeenCalledTimes(1);

  name = "After";
  await act(async () => invalidateReferenceLabel(ID));
  await flush();
  expect(text("title")).toBe("After");
  expect(text("sentence")).toBe("After");
  expect(read).toHaveBeenCalledTimes(2);

  act(() => root.unmount());
  host.remove();
  read.mockRestore();
});
