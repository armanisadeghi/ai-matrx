/** @jest-environment jsdom */
/**
 * THE DIRECTIVE CATALOG ON A PHONE (G10B review, 2026-10-02, nightly clone).
 * At 375px the body split one screen between three panes: the type table
 * shrank to almost nothing, "CUSTOM ACTIONS (PLANE 2) & LEGACY DIRECTIVES"
 * drew over the "Writable only" row, and the builder sat in a ~148px strip under
 * the floating chips. The contract, below lg:
 *   - the body is the ONE scroll area and the panes stack (no height split);
 *   - the type table has a definite height of its own;
 *   - the other actions flow in the page — no nested scroller — under a plain
 *     label, never an internal plane name;
 *   - the builder keeps room at its foot for the floating chips.
 * From lg up the panes sit side by side, each scrolling itself.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import type { DirectiveCatalog, NounDirectives } from "@/features/directive-catalog/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<NounDirectives> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<NounDirectives>) => {
    tableProps = props;
    return <div data-table="">{props.toolbar?.leading}</div>;
  },
}));
jest.mock("@/features/directive-catalog/components/StateCell", () => ({
  StateBadge: ({ state }: { state: string }) => <span>{state}</span>,
  StateCell: () => null,
}));
jest.mock("@/features/directive-catalog/nounOptions", () => ({
  nounLabel: (n: { noun: string }) => n.noun,
}));
const catalog = {
  directive_version: 1,
  nouns: [
    { noun: "task", table: "projects.tasks", family: "Work", reference: "yes", view: "yes", create: "yes", update: "yes", delete: "yes" },
  ],
  actions: [{ slug: "context_groom", name: "context_groom", doc: "Groom conversation context." }],
} as unknown as DirectiveCatalog;

jest.mock("@/features/directive-catalog/hooks/useDirectiveCatalog", () => ({
  useDirectiveCatalog: () => ({ catalog, isLoading: false, error: null, baseUrl: "x", lastUpdatedAt: null, refresh: jest.fn() }),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => true }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectIsAdmin: () => true }));
jest.mock("@/lib/redux/slices/apiConfigSlice", () => ({ selectActiveServer: () => null }));
jest.mock("@/lib/api/server-identity", () => ({
  describeServerTarget: () => ({ kind: "clone", label: "Clone", host: null }),
}));
jest.mock("@ai-matrx/canvas/react", () => ({ useOptionalCanvas: () => null }));
jest.mock("@/features/canvas/host/openCanvasItem", () => ({ openCanvasItem: jest.fn() }));
jest.mock("@/features/directive-catalog/canvas/directiveShapeKind", () => ({ directiveShapeOpenInput: jest.fn() }));
jest.mock("@/features/admin/relationships/entityTypeMutations", () => ({ setEntityTypeAgentWritable: jest.fn() }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/features/directive-catalog/components/DirectiveBuilderPanel", () => ({
  DirectiveBuilderPanel: () => <div data-builder="" />,
}));

import { DirectiveCatalogClient } from "@/features/directive-catalog/components/DirectiveCatalogClient";

/** Classes that apply below lg: unprefixed, or max-lg:. */
function phoneClasses(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((c) => c && (!c.includes(":") || c.startsWith("max-lg:")));
}

describe("the directive catalog on a phone", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(async () => {
    tableProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<DirectiveCatalogClient />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("the body is the one scroll area and its panes stack, never split one screen", () => {
    const body = host.querySelector("[data-directive-catalog-body]");
    expect(phoneClasses(body)).toContain("overflow-y-auto");
    const panes = body?.firstElementChild ?? null;
    const phone = phoneClasses(panes);
    expect(phone).toContain("flex-col");
    expect(phone).not.toContain("grid");
    expect(phone).not.toContain("h-full");
  });

  it("the type table has a definite height of its own", () => {
    const phone = (tableProps?.className ?? "").split(/\s+/).filter((c) => c && !c.includes(":"));
    expect(phone.some((c) => /^h-\[\d+dvh\]$/.test(c))).toBe(true);
    expect(phone).toContain("shrink-0");
  });

  it("the other actions flow in the page under a plain label", () => {
    const section = host.querySelector("[data-directive-other-actions]");
    expect(section?.textContent).toContain("Other actions");
    expect(host.textContent).not.toMatch(/plane|legacy/i);
    const phone = phoneClasses(section);
    expect(phone.some((c) => c.startsWith("max-h-") || c.startsWith("overflow-y"))).toBe(false);
  });
});
