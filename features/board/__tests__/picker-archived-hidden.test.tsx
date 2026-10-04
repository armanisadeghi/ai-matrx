/**
 * THE ARCHIVED-ITEMS LAW for Board pickers: a "Bring in" list hides archived
 * rows until the person opens the Archived disclosure (one click).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { RecordList } from "../items/feature-items";

jest.mock("@/components/ui/command", () => {
  const React = require("react");
  const box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Command: box,
    CommandInput: () => null,
    CommandList: box,
    CommandEmpty: () => null,
    CommandItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect?: () => void }) => (
      <div role="option" onClick={onSelect}>{children}</div>
    ),
  };
});

type Row = { id: string; name: string; archived: boolean };
const ROWS: Row[] = [
  { id: "a", name: "Front desk checklist", archived: false },
  { id: "b", name: "Old intake choices", archived: true },
];

function list() {
  return (
    <RecordList
      rows={ROWS}
      read={{ loading: false, error: null, what: "your picklists" } as never}
      rowKey={(r) => r.id}
      rowText={(r) => r.name}
      renderRow={(r) => <span>{r.name}</span>}
      onChoose={() => undefined}
      onCancel={() => undefined}
      emptyState="none"
      isArchived={(r) => r.archived}
    />
  );
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("a Board picker hides archived rows by default", () => {
  it("shows live rows only, then reveals the archived ones in one click", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => {
      createRoot(host).render(list());
    });
    expect(host.textContent).toContain("Front desk checklist");
    expect(host.textContent).not.toContain("Old intake choices");
    const reveal = Array.from(host.querySelectorAll("button")).find((b) => /archived/i.test(b.textContent ?? ""));
    expect(reveal).toBeTruthy();
    act(() => {
      reveal!.click();
    });
    expect(host.textContent).toContain("Old intake choices");
  });
});
