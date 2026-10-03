/**
 * @jest-environment jsdom
 */
/**
 * A SCOPE VALUE NOT READ WHOLE SAYS "PARTIAL" ON EVERY SCREEN THAT SHOWS IT (lane 9 SCOPES-ON-THE-STORE,
 * D-LAST, 2026-10-02).
 *
 * Use case: Castellano & Reyes, LLP's workers' compensation matter holds the official QME report,
 * 139,950 characters, kept by the store as a file. When the web cannot read that file whole (gone, a
 * SHA-256 mismatch, no Web Crypto, still being saved) `wholeScopeValues` hands the first words plus a
 * sentence and marks the cell `value_incomplete`. Without a visible state the inline field and the
 * value editor show 1000 characters as if they were the report.
 *
 * Driven through the REAL derived view (`selectValuesByScope` → `toRow`) over a hand-built store state,
 * and the two real screens (EditScopeValueSheet, ScopeFieldInput); only their heavy children (panel
 * host, value input, definition sheet, autosave hook) are stood in. The break each test names: the
 * view drops `value_incomplete`; a screen omits the badge; the badge shows on a value held whole.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const MATTER = "2645730c-97a9-4080-9471-2546d0ce2b66";
const TYPE = "1aaba65d-68de-457e-8a0c-0f2731161d13";
const I_QME = "054c12b6-fac9-45b3-a022-5cedc24ed2b2";
const I_ANALYSIS = "7d1e2f30-4a5b-4c6d-8e7f-90a1b2c3d4e5";
const HEAD = "Panel QME Dr. Miriam Okafor, orthopedic surgery: lumbar L4-L5 disc protrusion. ".repeat(13).slice(0, 1000);

function item(id: string, key: string, display_name: string) {
  return { id, key, slug: key, display_name, description: "", category: null, value_type: "text", scope_type_id: TYPE };
}
function value(itemId: string, text: string, incomplete?: unknown) {
  return {
    id: `v-${itemId}`, scope_id: MATTER, context_item_id: itemId, version: 4, is_current: true,
    value_text: text, value_number: null, value_boolean: null, value_date: null, value_json: null,
    value_document_url: null, value_document_size_bytes: null, value_reference_id: null, value_reference_type: null,
    source_type: "manual", authored_by: null, created_at: "2026-09-25T09:12:24.305Z",
    ...(incomplete ? { value_incomplete: incomplete } : {}),
  };
}

const state = {
  scopesTree: {
    organizations: {},
    contextItemsByTypeId: {
      [TYPE]: {
        status: "ready", fetchedAt: 1,
        items: [item(I_QME, "official_qme_report", "Official QME report"), item(I_ANALYSIS, "qme_discrepancy_analysis", "QME discrepancy analysis")],
      },
    },
  },
  contextValues: {
    byScope: {
      [MATTER]: {
        status: "ready", fetchedAt: 1, scopeTypeId: TYPE,
        values: {
          [I_QME]: value(I_QME, `${HEAD}… [This is the start of a 139950-character text kept as file ebad7d37-bde9-5f14-b96f-0e43f2e1fe40.]`,
            { head: HEAD, chars: 139950, file_id: "ebad7d37-bde9-5f14-b96f-0e43f2e1fe40" }),
          [I_ANALYSIS]: value(I_ANALYSIS, "The QME's apportionment conflicts with the March 2024 Kaiser imaging."),
        },
      },
    },
  },
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: (sel: (s: unknown) => unknown) => sel(state),
}));
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/components/matrx/resizable/MatrxDynamicPanelHost", () => ({
  // A closed panel renders nothing (as the real host does), so the inline field's own badge is what
  // the inline-field test sees — never the closed value editor's.
  MatrxDynamicPanelHost: ({ children, title, open }: { children: ReactNode; title: string; open: boolean }) =>
    open ? <section data-title={title}>{children}</section> : null,
}));
jest.mock("@/features/scopes/components/reference/ContextValueInput", () => ({
  ...jest.requireActual("@/features/scopes/components/reference/ContextValueInput"),
  ContextValueInput: () => <textarea readOnly />,
}));
jest.mock("@/features/scope-system/components/EditContextItemSheet", () => ({ EditContextItemSheet: () => null }));
jest.mock("@/features/scope-system/hooks/useScopeAutoSave", () => ({
  useScopeAutoSave: () => ({ commit: () => undefined, status: "idle" }),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { selectValuesByScope } = require("@/features/scopes/redux/scopeContextView");
const { EditScopeValueSheet } = require("@/features/scope-system/components/EditScopeValueSheet");
const { ScopeFieldInput } = require("@/features/scope-system/components/ScopeFieldInput");
/* eslint-enable @typescript-eslint/no-require-imports */

const PARTIAL = 'data-testid="scope-value-partial"';
const rows = () => selectValuesByScope(state, MATTER) as Array<{ item_id: string; value_incomplete?: unknown }>;

describe("a scope value not read whole shows Partial", () => {
  it("the derived view carries value_incomplete onto the row (and only onto that row)", () => {
    const r = rows();
    expect(r.find((x) => x.item_id === I_QME)?.value_incomplete).toEqual({
      head: HEAD, chars: 139950, file_id: "ebad7d37-bde9-5f14-b96f-0e43f2e1fe40",
    });
    expect(r.find((x) => x.item_id === I_ANALYSIS)?.value_incomplete ?? null).toBeNull();
  });

  it("the value editor shows Partial with its tooltip for the cut report", () => {
    const html = renderToStaticMarkup(<EditScopeValueSheet open onOpenChange={() => undefined} scopeId={MATTER} itemId={I_QME} />);
    expect(html).toContain(PARTIAL);
    expect(html).toContain(">Partial<");
    expect(html).toContain('aria-label="Why partial"');
  });

  it("the value editor shows no Partial for a value held whole", () => {
    const html = renderToStaticMarkup(<EditScopeValueSheet open onOpenChange={() => undefined} scopeId={MATTER} itemId={I_ANALYSIS} />);
    expect(html).not.toContain(PARTIAL);
  });

  it("the inline field shows Partial for the cut report and nothing for the whole one", () => {
    const [qme, analysis] = [I_QME, I_ANALYSIS].map((id) => rows().find((x) => x.item_id === id));
    expect(renderToStaticMarkup(<ScopeFieldInput scopeId={MATTER} row={qme} />)).toContain(PARTIAL);
    expect(renderToStaticMarkup(<ScopeFieldInput scopeId={MATTER} row={analysis} />)).not.toContain(PARTIAL);
  });
});
