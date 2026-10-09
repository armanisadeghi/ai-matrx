/**
 * @jest-environment jsdom
 *
 * THE INSTALLED GRID DRAWS ITS ROW BUTTONS ON THE INSTALLED TABLE (defect 2026-10-02).
 *
 * `@ai-matrx/design-system` 0.55 changed the data table's `rowActions` contract to icon action
 * descriptors and threw on React content. records-ui's source moved to a `customActions` column,
 * but its publishes failed for hours, so npm still served records-ui 0.93.146 — which hands JSX
 * to `rowActions`. Every `@ai-matrx/*` dependency resolves `latest`, so THIS app installed the
 * broken pair, and every record-store grid (/data, the Board's Table tile) fell into its error
 * boundary. Each package's own suite was green: each tests its source against its sibling's
 * SOURCE, never against the version npm actually serves.
 *
 * This mounts the INSTALLED `Grid` (no mock of either package) on the INSTALLED data table with a
 * writable table and asserts what a person sees on a row: Duplicate and Delete — never a throw,
 * never the table's "older format" warning cell. RED on records-ui 0.93.146 + design-system 0.56.1
 * (throws in `TableIconActions`). GREEN once the installed pair agrees.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RecordsProvider } from "@ai-matrx/records/react";
import { Grid, RecordsUiProvider } from "@ai-matrx/records-ui";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks the layout APIs Radix and the virtualizer read.
class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
Object.assign(globalThis, { ResizeObserver: NoopObserver, IntersectionObserver: NoopObserver });
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

/* Rincon Plumbing's Camarillo service board: three jobs, one table the dispatcher administers. */
const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const TABLE = "60f2f9f7-2f0a-4fba-a419-3e88b7f8e7fa";
const TABLE_KERNEL = "11111111-0000-4000-8000-000000000001";
const DISPATCHER = "87a6e699-3622-4869-8843-d0867456c0dd";
const F = { customer: "a0000000-0000-4000-8000-000000000001", job: "a0000000-0000-4000-8000-000000000002" };
const field = (id: string, data: Record<string, unknown>) => ({
  id,
  version: 1,
  table_id: "11111111-0000-4000-8000-000000000002",
  organization_id: ORG,
  data: {
    dated: false, multi: false, rules: [], config: {}, required: false, depends_on: [], sensitivity: "internal",
    context_policy: "include", applies_to_types: [], entity_definition_id: TABLE, ...data,
  },
});
const FIELDS = [
  field(F.customer, { key: "customer", label: "Customer", type: "text", sort: 10 }),
  field(F.job, { key: "job", label: "Job", type: "text", sort: 20 }),
];
const TABLE_DOC = {
  name: "Service board", slug: "service_board", type: "entity", label_singular: "Job", label_plural: "Jobs",
  title_field: "customer", display: "list", weight: "light", fields: Object.values(F),
};
const ROWS = [
  { id: "b0000000-0000-4000-8000-000000000001", level: "editor", document: { customer: "Hollis residence", job: "Water heater flush" } },
  { id: "b0000000-0000-4000-8000-000000000002", level: "editor", document: { customer: "Ferreira Dental", job: "Backflow test" } },
  { id: "b0000000-0000-4000-8000-000000000003", level: "editor", document: { customer: "Lindqvist duplex", job: "Slab leak locate" } },
];

type Answer = { data: unknown; error: null } | { data: null; error: Record<string, unknown> };
const ok = (data: unknown): Answer => ({ data, error: null });
const doors: Record<string, (args: Record<string, unknown>) => Answer> = {
  table_kernel_id: () => ok(TABLE_KERNEL),
  person_kernel_id: () => ok("11111111-0000-4000-8000-000000000005"),
  read_records: (a) => (a.p_table_id === TABLE_KERNEL ? ok([{ id: TABLE, level: "viewer", document: TABLE_DOC }]) : ok(ROWS)),
  read_records_by_ids: (a) => {
    const ids = (a.p_record_ids as string[]) ?? [];
    return a.p_table_id === TABLE_KERNEL
      ? ok([{ id: TABLE, level: "viewer", document: TABLE_DOC }].filter((r) => ids.includes(r.id)))
      : ok(ROWS.filter((r) => ids.includes(r.id)));
  },
  read_records_matching: () => ok(ROWS),
  read_records_page: (a) => ok({ total: ROWS.length, limit: Number(a.p_limit ?? 50), offset: 0, rows: ROWS }),
  applicable_fields: () => ok(FIELDS),
  my_levels: (a) => ok(((a.p_ids as string[]) ?? []).map((id) => ({ id, level: "admin" }))),
  enrich_cells: () => ok([]),
  table_decorations: () => ok({ version: 1, colors: [], rule_ops: [], rules: [], rows: {}, columns: {}, cells: {}, stale: [] }),
  row_actions: () => ok({ actions: [], stale: [] }),
  grid_layout: () => ok({
    layout: { mode: "auto", wrap: false, row_height: "normal", fit_max_columns: 8, freeze_first_column: false },
    source: { mode: "platform", wrap: "platform", row_height: "platform", fit_max_columns: "platform", freeze_first_column: "platform" },
    refused: [], view_id: null,
  }),
  agg_operations: () => ok(["count"]),
  record_aggregate: () => ok([{ groups: {}, measures: { count: 3 }, row_count: 3 }]),
  record_headers: (a) => ok(((a.p_ids as string[]) ?? []).filter((id) => id !== TABLE && id !== TABLE_KERNEL).map((id) => ({
    id, table_id: TABLE, created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-01T09:00:00Z", version: 1, deleted_at: null, mine: true, created_by: DISPATCHER,
  }))),
  choice_nudge: () => ok("ask"),
  reverse_columns: () => ok([]),
  reverse_links_many: () => ok([]),
};
const config = {
  dataSource: {
    async rpc(name: string, args: Record<string, unknown>) {
      const door = doors[name];
      return door ? door(args ?? {}) : { data: null, error: { code: "P0001", message: `Not modelled: custom.${name}` } };
    },
  },
  organizationId: ORG,
  actor: { actor: "user", user_id: DISPATCHER, on_behalf_of: null },
  onError: () => undefined,
} as unknown as React.ComponentProps<typeof RecordsProvider>["config"];

class Catch extends React.Component<{ children: React.ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error) { this.props.onError(error); }
  override render() { return this.state.failed ? null : this.props.children; }
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe("the installed record-store grid on the installed data table", () => {
  it("draws each row's Duplicate and Delete, never a crash or the older-format warning", async () => {
    const caught: Error[] = [];
    const quiet = jest.spyOn(console, "error").mockImplementation(() => undefined);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <Catch onError={(e) => caught.push(e)}>
          <RecordsProvider config={config}>
            <RecordsUiProvider value={{ density: "condensed", grid: "merged" }}>
              <Grid tableId={TABLE as never} />
            </RecordsUiProvider>
          </RecordsProvider>
        </Catch>,
      );
    });
    for (let i = 0; i < 30; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
    quiet.mockRestore();

    expect(caught.map((e) => e.message)).toEqual([]);
    expect(host.querySelector("[data-matrx-table-actions-contract-broken]")).toBeNull();
    expect(host.textContent).toContain("Hollis residence");
    expect(host.querySelectorAll("[data-records-duplicate]").length).toBe(ROWS.length);
    expect(Array.from(host.querySelectorAll("button")).filter((b) => b.textContent === "Delete").length).toBe(ROWS.length);
  });
});
