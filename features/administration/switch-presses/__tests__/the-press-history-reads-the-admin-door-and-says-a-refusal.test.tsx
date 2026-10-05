/** @jest-environment jsdom */
/**
 * THE SWITCH'S PRESS HISTORY STAYS READABLE (lane ONE-HOME wave 4): the Final switch screen left with the
 * machinery; its record is read through the platform admin's one door and every press reaches the list,
 * with a refusal said in the refusal's own words. Break it (call another door, drop the rows, show `says`
 * over `refusal`, swallow a refused read) and these go red.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let answer: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const calls: Array<{ fn: string; args: Record<string, unknown>; schema: string }> = [];
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: (schema: string) => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args, schema });
        return answer;
      },
    }),
  }),
}));

let tableProps: MatrxDataTableProps<SwitchPress> | null = null;
jest.mock("@/components/agent-copy/page-capture/usePageCapture", () => ({ usePageCapture: () => {} }));
jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<SwitchPress>) => {
    tableProps = props;
    return null;
  },
}));

import { readSwitchPresses, SwitchPressHistory, type SwitchPress } from "../SwitchPressHistory";

// The two presses that ended the switch, as the record holds them (2026-10-01).
const FINAL: SwitchPress = {
  id: "7f0c2b1e-5d44-4a8e-9b61-2c3d4e5f6a70",
  seam_key: "final_switch",
  organization_id: null,
  direction: "new",
  outcome: "done",
  refusal: null,
  says: "Every organization is on the new system.",
  pressed_by: "87a6e699-3622-4869-8843-d0867456c0dd",
  pressed_at: "2026-10-01T19:57:10.302Z",
  note: "the final switch",
};
const REFUSED_UNDO: SwitchPress = {
  id: "0b9e8d7c-6a5b-4c3d-8e2f-1a0b9c8d7e6f",
  seam_key: "final_switch",
  organization_id: null,
  direction: "old",
  outcome: "refused",
  refusal: "The undo is retired; the switch is final.",
  says: "Nothing was changed.",
  pressed_by: "87a6e699-3622-4869-8843-d0867456c0dd",
  pressed_at: "2026-10-01T20:09:03.586Z",
  note: null,
};

beforeEach(() => {
  calls.length = 0;
  tableProps = null;
});

it("reads the presses through platform.cutover_press_history, newest first as the door answers", async () => {
  answer = { data: [REFUSED_UNDO, FINAL], error: null };
  const rows = await readSwitchPresses();
  expect(calls).toEqual([{ schema: "platform", fn: "cutover_press_history", args: { p_limit: 5000 } }]);
  expect(rows.map((r) => r.id)).toEqual([REFUSED_UNDO.id, FINAL.id]);
});

it("a refused read throws the door's own words, never an empty history", async () => {
  answer = { data: null, error: { message: "Only a platform admin reads the switch's press history." } };
  await expect(readSwitchPresses()).rejects.toThrow("Only a platform admin reads the switch's press history.");
});

it("every press reaches the list, and a refusal is said in the refusal's words", async () => {
  answer = { data: [REFUSED_UNDO, FINAL], error: null };
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<SwitchPressHistory />));
  await act(async () => {});
  expect(tableProps?.data.map((r) => r.id)).toEqual([REFUSED_UNDO.id, FINAL.id]);
  const said = tableProps!.columns.find((c) => c.id === "says")!;
  const text = (row: SwitchPress) => (said as { accessorFn: (r: SwitchPress) => string }).accessorFn(row);
  expect(text(REFUSED_UNDO)).toBe("The undo is retired; the switch is final.");
  expect(text(FINAL)).toBe("Every organization is on the new system.");
  act(() => root.unmount());
});
