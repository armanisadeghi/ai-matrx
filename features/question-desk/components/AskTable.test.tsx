/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";

import type { DecisionQuestionRow } from "../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<DecisionQuestionRow> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<DecisionQuestionRow>) => {
    tableProps = props;
    const row = props.data[0];
    return row ? <div>{props.rowActions?.(row, {} as never)}</div> : null;
  },
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (event: { target: { value: string } }) => void;
  }) => (
    <textarea
      aria-label="Answer"
      value={value}
      onChange={(event) => onChange(event)}
    />
  ),
}));

jest.mock("@/features/audio/RecordingOriginProvider", () => ({
  RecordingOriginProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { AskTable } from "./AskTable";

const question = {
  id: "question-1",
  title: "Should the table keep the fast editor?",
  kind: "choice",
  door: "two_way",
  verdict: null,
  status_note: null,
  answer_text: null,
  answered_at: null,
  recommendation: "Keep it",
} as unknown as DecisionQuestionRow;

describe("AskTable", () => {
  let host: HTMLDivElement;
  let root: Root;
  const onOpen = jest.fn();
  const onTakeRecommendation = jest.fn();
  const onSkip = jest.fn();
  const onHandBack = jest.fn();
  const onWrite = jest.fn();

  beforeEach(() => {
    tableProps = null;
    jest.clearAllMocks();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root.render(
        <AskTable
          interviewId="interview-1"
          questions={[question]}
          onOpen={onOpen}
          onTakeRecommendation={onTakeRecommendation}
          onSkip={onSkip}
          onHandBack={onHandBack}
          onWrite={onWrite}
          skipShipsRecommendation={false}
          lines={{}}
          busyId={null}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses the canonical table while retaining independent decision columns", () => {
    if (!tableProps) throw new Error("AskTable did not render MatrxDataTable");

    expect(tableProps.density).toBe("condensed");
    expect(tableProps.detail).toEqual({ enabled: false });
    expect(tableProps.copy).toBe(false);
    expect(tableProps.toolbar).toMatchObject({
      title: "Every question at once",
      search: true,
    });
    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "question",
      "kind",
      "door",
      "verdict",
      "status-note",
      "answer",
    ]);
    for (const column of tableProps.columns) {
      expect(column.filter).not.toBe(false);
      expect(column.accessorKey ?? column.accessorFn).toBeDefined();
    }
  });

  it("keeps direct actions and refuses whitespace before writing", () => {
    const buttons = [...host.querySelectorAll("button")];
    act(() => buttons.find((button) => button.textContent === "1")?.click());
    act(() => buttons.find((button) => button.textContent === "2")?.click());
    act(() => buttons.find((button) => button.textContent === "3")?.click());
    expect(onTakeRecommendation).toHaveBeenCalledWith(question);
    expect(onSkip).toHaveBeenCalledWith(question);
    expect(onHandBack).toHaveBeenCalledWith(question);

    act(() => buttons.find((button) => button.textContent === "W")?.click());
    act(() => host.querySelector<HTMLTextAreaElement>("textarea")?.dispatchEvent(new Event("change", { bubbles: true })));
    act(() => [...host.querySelectorAll("button")].find((button) => button.textContent === "Save")?.click());
    expect(onWrite).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Write something first, or use one of the buttons.");
  });
});
