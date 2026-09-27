/**
 * A WORD THAT IS NONE OF A CHOICE COLUMN'S CHOICES IS ASKED ABOUT BEFORE IT IS SAVED — THE ENUM
 * NUDGE ON THE SHEET'S GRID CELL (lane CHOICE-COLUMN-EDIT, 2026-09-27).
 *
 * Arman: "when I'm editing cells, it's supposed to allow me to add any value and if the value is
 * not in the defined list of enums, it needs to ask me if I want to add it or not and if I want to
 * add it, then it needs to do it."
 *
 * THE USE CASE: a software team's "Accounts" table. Account Type offers Cursor · Claude · Codex;
 * somebody types "Gemini" into a cell.
 *   · ask (the organization default): the cell asks `Add "Gemini" to the choices for Account
 *     Type?` — Add / Keep as typed / Cancel — and nothing is saved until they answer; Keep as typed
 *     is offered only when the column takes other values.
 *   · Add saves through `upsertCellAddingChoice` (one transaction on the record store: the choice
 *     is added and the cell takes it), then the grid re-reads its columns.
 *   · Keep as typed saves the words through the ordinary `upsertCell`.
 *   · always_add adds without asking; never_add on a closed column says it is not a choice.
 *
 * WHAT IS STOOD IN FOR: the service (the network), and the choice picker, reduced to the one
 * gesture that matters here (it hands the cell the words the person chose or typed).
 *
 * RED on the HEAD bytes: EditableCell saved "Gemini" through upsertCell at once and asked nothing
 * (the older "Add as option" toast came after the save, from the grid).
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const upsertCell = jest.fn();
const upsertCellAddingChoice = jest.fn();
const readChoiceNudge = jest.fn();

jest.mock("../service", () => ({
  upsertCell: (...args: unknown[]) => upsertCell(...args),
  upsertCellAddingChoice: (...args: unknown[]) => upsertCellAddingChoice(...args),
  readChoiceNudge: (...args: unknown[]) => readChoiceNudge(...args),
}));

jest.mock("../components/ChoiceInput", () => ({
  ChoiceInput: ({ onDone }: { onDone: (value: unknown) => void }) => (
    <button type="button" data-test-choose="" onClick={() => onDone("Gemini")}>
      choose Gemini
    </button>
  ),
}));

jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

import { EditableCell } from "../components/EditableCell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const ACCOUNT_TYPE = (allowOther: boolean) => ({
  id: "choice" as const,
  options: {
    choices: [{ value: "Cursor" }, { value: "Claude" }, { value: "Codex" }],
    allowOther,
  },
});

beforeEach(() => {
  upsertCell.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-09-27T16:40:00Z" } });
  upsertCellAddingChoice.mockReset().mockResolvedValue({ success: true, data: { updated_at: "2026-09-27T16:40:00Z" } });
  readChoiceNudge.mockReset().mockResolvedValue("ask");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const onSaved = jest.fn();
const onChoicesAdded = jest.fn();

function renderCell(allowOther: boolean) {
  onSaved.mockReset();
  onChoicesAdded.mockReset();
  act(() => {
    root.render(
      <table>
        <tbody>
          <tr>
            <td>
              <EditableCell
                tableId="t-accounts"
                rowId="r-northwind"
                fieldName="account_type"
                fieldDisplayName="Account Type"
                dataType="string"
                format={ACCOUNT_TYPE(allowOther)}
                value="Claude"
                display={<span>Claude</span>}
                editing
                onSaved={onSaved}
                onChoicesAdded={onChoicesAdded}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
  });
}

async function chooseGemini() {
  const button = container.querySelector("[data-test-choose]") as HTMLButtonElement | null;
  if (!button) throw new Error("the choice editor did not render");
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

function ask(): HTMLElement | null {
  return document.querySelector("[data-matrx-choice-nudge]");
}

function buttonsOfTheAsk(): string[] {
  return [...(ask()?.querySelectorAll("button") ?? [])].map((b) => (b.textContent ?? "").trim());
}

async function press(label: string) {
  const b = [...(ask()?.querySelectorAll("button") ?? [])].find((x) => (x.textContent ?? "").trim() === label) as
    | HTMLButtonElement
    | undefined;
  if (!b) throw new Error(`the ask has no "${label}" button (it has ${buttonsOfTheAsk().join(", ")})`);
  await act(async () => {
    b.click();
    await Promise.resolve();
  });
}

describe("the Sheet's grid cell — a typed word that is none of the choices", () => {
  it("1 · asks before saving, with Add / Keep as typed / Cancel where the column takes other values", async () => {
    renderCell(true);
    await chooseGemini();
    expect(ask()).not.toBeNull();
    expect((ask()?.textContent ?? "").replace(/\s+/g, " ")).toContain('Add "Gemini" to the choices for Account Type?');
    expect(buttonsOfTheAsk()).toEqual(["Add", "Keep as typed", "Cancel"]);
    expect(upsertCell).not.toHaveBeenCalled();
    expect(upsertCellAddingChoice).not.toHaveBeenCalled();
  });

  it("2 · offers only Add and Cancel on a column that takes no other values", async () => {
    renderCell(false);
    await chooseGemini();
    expect(buttonsOfTheAsk()).toEqual(["Add", "Cancel"]);
  });

  it("3 · Add saves the cell AND the new choice in one save, then the grid re-reads its columns", async () => {
    renderCell(false);
    await chooseGemini();
    await press("Add");
    expect(upsertCell).not.toHaveBeenCalled();
    expect(upsertCellAddingChoice).toHaveBeenCalledTimes(1);
    expect(upsertCellAddingChoice.mock.calls[0]![0]).toMatchObject({
      tableId: "t-accounts",
      rowId: "r-northwind",
      fieldName: "account_type",
      value: "Gemini",
      add: ["Gemini"],
    });
    expect(onSaved).toHaveBeenCalledWith("Gemini", "2026-09-27T16:40:00Z");
    expect(onChoicesAdded).toHaveBeenCalledTimes(1);
    expect(ask()).toBeNull();
  });

  it("4 · Keep as typed saves the words through the ordinary cell save, adding no choice", async () => {
    renderCell(true);
    await chooseGemini();
    await press("Keep as typed");
    expect(upsertCellAddingChoice).not.toHaveBeenCalled();
    expect(upsertCell).toHaveBeenCalledTimes(1);
    expect(upsertCell.mock.calls[0]![0]).toMatchObject({ fieldName: "account_type", value: "Gemini" });
    expect(onChoicesAdded).not.toHaveBeenCalled();
  });

  it("5 · Cancel saves nothing and closes the question", async () => {
    renderCell(true);
    await chooseGemini();
    await press("Cancel");
    expect(upsertCell).not.toHaveBeenCalled();
    expect(upsertCellAddingChoice).not.toHaveBeenCalled();
    expect(ask()).toBeNull();
  });

  it("6 · the organization's knob: always_add adds without asking; never_add on a closed column says it is not a choice", async () => {
    readChoiceNudge.mockResolvedValue("always_add");
    renderCell(false);
    await chooseGemini();
    expect(ask()).toBeNull();
    expect(upsertCellAddingChoice).toHaveBeenCalledTimes(1);

    readChoiceNudge.mockResolvedValue("never_add");
    upsertCellAddingChoice.mockClear();
    renderCell(false);
    await chooseGemini();
    expect((ask()?.textContent ?? "").replace(/\s+/g, " ")).toContain('"Gemini" is not one of the choices for Account Type.');
    expect(buttonsOfTheAsk()).toEqual(["Cancel"]);
    expect(upsertCell).not.toHaveBeenCalled();
    expect(upsertCellAddingChoice).not.toHaveBeenCalled();
  });

  it("7 · a word that already names a choice (any case) is not asked about; only the new words are", async () => {
    const { decideTypedChoice } = await import("../choice-option-nudge");
    expect(decideTypedChoice(ACCOUNT_TYPE(false), "codex", "ask")).toEqual({ kind: "none" });
    expect(decideTypedChoice(ACCOUNT_TYPE(false), ["Cursor", "Gemini"], "ask")).toEqual({ kind: "ask", words: ["Gemini"], canKeep: false });
  });
});
