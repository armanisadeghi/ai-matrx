/**
 * A TABLE BROUGHT BACK IS LISTED AT ONCE (lane TABLE-ACTIONS wave 1 fix round). The archive
 * toast's Undo and ⌘Z both run the one `undo` the host's notify port hands the announcer
 * (`RECORDS_NOTIFY.reversible`); once it lands, the Data home's list key moves so the shell reads
 * again. Before, the restored table stayed missing until a reload.
 *
 * The break this names: the port passing the package's undo through unwrapped, or the Data home
 * not listening — the list version does not move after a successful undo (and must not move after
 * a failed one).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReversibleAnnouncement } from "@ai-matrx/kit/reversible";

const announced: ReversibleAnnouncement[] = [];
jest.mock("@/lib/reversible/announceReversible", () => ({
  announceReversible: (a: ReversibleAnnouncement) => void announced.push(a),
}));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// eslint-disable-next-line import/first
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
// eslint-disable-next-line import/first
import { useReadAgainOnRestore } from "../useDataHomeRowMenus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let seen = -1;
function Probe() {
  seen = useReadAgainOnRestore();
  return null;
}

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Probe />));
  return () => act(() => root.unmount());
}

const wait = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
  announced.length = 0;
});

it.each([
  ["the toast's Undo button", "button"],
  ["⌘Z", "shortcut"],
])("after %s restores the table, the Data home reads its list again", async () => {
  const unmount = await mount();
  const restored = jest.fn(async () => {});
  RECORDS_NOTIFY.reversible({ verb: "archive", noun: "table", subject: "Referral Intake Queue", undo: restored });
  const before = seen;
  // Both the button and ⌘Z call the announcement's one `undo` (lib/reversible).
  await act(async () => announced[0]!.undo());
  await wait(400);
  expect(restored).toHaveBeenCalledTimes(1);
  expect(seen).toBe(before + 1);
  unmount();
});

it("a refused restore does not pretend: the list is not re-read, the refusal reaches the announcer", async () => {
  const unmount = await mount();
  RECORDS_NOTIFY.reversible({
    verb: "archive",
    noun: "table",
    subject: "Referral Intake Queue",
    undo: async () => {
      throw new Error("This could not be brought back as it was archived.");
    },
  });
  const before = seen;
  await expect(act(async () => announced[0]!.undo())).rejects.toThrow(/could not be brought back/);
  await wait(400);
  expect(seen).toBe(before);
  unmount();
});
