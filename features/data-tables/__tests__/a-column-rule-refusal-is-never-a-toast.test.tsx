/**
 * A COLUMN'S OWN REFUSAL IS A NOTICE ON THE FIELD, NOT A TOAST ON A TIMER.
 *
 * The red twin for lane VALIDATION-REFUSAL (2026-09-23), covering the two
 * surface families that hold an open editor: the GRID CELL and the shape every
 * form field (row modal, paste preview) draws.
 *
 * WHAT IT PINS, and what it looked like before:
 *   · `EditableCell` called `toast({ variant: "destructive" })` and returned. The
 *     message timed out, the editor stayed open holding the typed text with
 *     nothing on screen saying why it had not saved, and the two ways out
 *     (correct it / throw it away) were never named.
 *   · The rule the value broke, and every other rule the column carries, reached
 *     the person only as a bare sentence with no remedy.
 *
 * RED PROOF (recorded 2026-09-23, run by restoring the pre-fix bytes in place and
 * putting them back in the same command): with the `toast(...)` call back in
 * `EditableCell.commitEdit`, clauses 1–5 fail — `expected the refusal notice to be
 * on screen, found none`.
 *
 * The notice is the REAL `RefusalNotice` from the published `@ai-matrx/records-ui`,
 * driven through the REAL `validateCellValue`. Nothing about the refusal path is
 * stubbed; the only double is `upsertCell`, because a rule refusal must never
 * reach it and that is one of the clauses.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const upsertCell = jest.fn();
jest.mock("../service", () => ({
  upsertCell: (...args: unknown[]) => upsertCell(...args),
}));

const toasted = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => toasted(...args),
}));

import { EditableCell } from "../components/EditableCell";
import { FieldRuleRefusal } from "../components/FieldRuleRefusal";
import { columnRuleRefusal } from "../validation-refusal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  upsertCell.mockReset();
  toasted.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Everything the notice put on screen, wherever it was portalled to. */
function noticeText(): string {
  const found = document.querySelector("[data-matrx-cell-refusal]");
  return (found?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function renderCell(props: Partial<React.ComponentProps<typeof EditableCell>> = {}) {
  act(() => {
    root.render(
      <table>
        <tbody>
          <tr>
            <td>
              <EditableCell
                tableId="t1"
                rowId="r1"
                fieldName="invoice_reference"
                fieldDisplayName="Invoice reference"
                dataType="string"
                value="JOB-4471"
                display={<span>JOB-4471</span>}
                editing
                validationRules={{
                  pattern: "^JOB-[0-9]{4}$",
                  patternHint: "JOB-1234",
                  maxLength: 8,
                }}
                {...props}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
  });
}

/** Type into the cell's editor and commit with Enter, the spreadsheet gesture. */
function typeAndCommit(text: string) {
  const editor = container.querySelector("textarea, input") as
    | HTMLTextAreaElement
    | HTMLInputElement
    | null;
  if (!editor) throw new Error("the cell rendered no editor to type into");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      editor instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(editor, text);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  return editor;
}

describe("the grid cell — a column rule refuses a value", () => {
  it("1 · shows the refusal on the cell instead of a toast, and never sends the write", () => {
    renderCell();
    typeAndCommit("not a job number at all");

    expect(toasted).not.toHaveBeenCalled();
    expect(upsertCell).not.toHaveBeenCalled();
    expect(noticeText()).not.toEqual("");
  });

  it("2 · says what happened AND what to do — never a sentence with no way out", () => {
    renderCell();
    typeAndCommit("not a job number at all");

    const said = noticeText();
    // The store's own heading for a Rule refusal, so a browser refusal and a
    // database refusal are one object on screen.
    expect(said).toContain("That value was not accepted");
    expect(said).toContain("Correct it and save again, or discard what you typed");
  });

  it("3 · carries the column's own rules, in the author's words, verbatim", () => {
    renderCell();
    typeAndCommit("not a job number at all");

    const rules = document.querySelector("[data-matrx-column-rules]");
    const said = (rules?.textContent ?? "").replace(/\s+/g, " ");
    // 🚨 THE WHOLE REASON THE RULES ARE NOT IN THE MESSAGE. `JOB-1234` matches the
    // refusal formatter's contract-row-id shape, so a pattern hint a dispatcher
    // wrote would be excised from any sentence handed to it — and the one control
    // that exists to say what the column wants would say nothing.
    expect(said).toContain("JOB-1234");
    expect(said).toContain("At most 8 characters");
  });

  it("4 · offers Keep editing and Discard, and keeps the typed text until one is pressed", () => {
    renderCell();
    const editor = typeAndCommit("not a job number at all");

    expect(document.querySelector("[data-refusal-keep-editing]")).not.toBeNull();
    const discard = document.querySelector(
      "[data-refusal-discard]",
    ) as HTMLButtonElement | null;
    expect(discard).not.toBeNull();
    expect(editor.value).toBe("not a job number at all");
  });

  it("5 · the notice is drawn OUTSIDE the table, where no column width can clip it", () => {
    renderCell();
    typeAndCommit("not a job number at all");

    const notice = document.querySelector("[data-matrx-cell-refusal]");
    expect(notice).not.toBeNull();
    expect(notice!.closest("table")).toBeNull();
  });

  it("6 · Keep editing puts the person back in the editor with their text intact", () => {
    renderCell();
    const editor = typeAndCommit("not a job number at all");

    const keep = document.querySelector(
      "[data-refusal-keep-editing]",
    ) as HTMLButtonElement;
    act(() => keep.click());

    expect(noticeText()).toEqual("");
    expect(
      (container.querySelector("textarea, input") as HTMLTextAreaElement).value,
    ).toBe("not a job number at all");
  });

  it("7 · a value that PASSES the rules still reaches the store", async () => {
    upsertCell.mockResolvedValue({ data: { updated_at: "2026-09-23T00:00:00Z" } });
    renderCell();
    typeAndCommit("JOB-9012");
    await act(async () => {
      await Promise.resolve();
    });

    expect(upsertCell).toHaveBeenCalledTimes(1);
    expect(noticeText()).toEqual("");
  });
});

describe("the primitive — one refusal object for every surface", () => {
  it("8 · keeps the validator's own sentence when it is a person's sentence", () => {
    const built = columnRuleRefusal({
      fieldDisplayName: "Crew size",
      reason: "Must be at most 12",
      rules: { max: 12 },
    });
    expect(built.error.code).toBe("refused_by_rule");
    expect(built.error.message).toBe("Must be at most 12.");
    expect(built.reasonWasReshaped).toBe(false);
    expect(built.rules).toEqual(["At most 12"]);
  });

  it("9 · reshapes a sentence the refusal formatter would have mutilated, and keeps the rule", () => {
    const built = columnRuleRefusal({
      fieldDisplayName: "Invoice reference",
      // What `validateCellValue` actually returns for a hinted pattern — and the
      // exact shape `plainWords.ts` excises as a contract row id.
      reason: "Must match the pattern JOB-123",
      rules: { pattern: "^JOB-[0-9]{3}$", patternHint: "JOB-123" },
    });
    expect(built.reasonWasReshaped).toBe(true);
    expect(built.error.message).toBe("That is not a value this column accepts.");
    // Nothing was lost: the rule the person needs is still on the object.
    expect(built.rules).toEqual(["Pattern JOB-123"]);
    expect(built.reason).toBe("Must match the pattern JOB-123");
  });
});

describe("the form-field shape — row modals and the paste preview", () => {
  it("10 · renders the same notice with a remedy, and no editor doors", () => {
    act(() => {
      root.render(
        <FieldRuleRefusal
          refusal={columnRuleRefusal({
            fieldDisplayName: "Crew size",
            reason: "Must be at most 12",
            rules: { max: 12 },
          })}
        />,
      );
    });
    const said = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(said).toContain("That value was not accepted");
    expect(said).toContain("Must be at most 12");
    expect(said).toContain("Correct it and save again");
    expect(said).toContain("Crew size accepts: At most 12");
    // No editor is open here, so there is nothing to keep and nothing to discard.
    expect(container.querySelector("[data-refusal-keep-editing]")).toBeNull();
    expect(container.querySelector("[data-refusal-discard]")).toBeNull();
  });
});
