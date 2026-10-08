import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
function fragment(file: string, name: string): string {
  const source = ts.createSourceFile(file, readFileSync(resolve(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      found = ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === "useCallback"
        ? node.initializer.arguments[0] : node.initializer;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (name === "selectionActions" && ts.isJsxAttribute(node) && node.name.getText(source) === "selection" && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isObjectLiteralExpression(node.initializer.expression)) {
      const action = node.initializer.expression.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(source) === "actions");
      if (action && ts.isPropertyAssignment(action)) found = action.initializer;
    }
    if (name === "gscSelectionActions" && ts.isPropertyAssignment(node) && node.name.getText(source) === "actions" && ts.isArrowFunction(node.initializer) && node.initializer.parameters[0]?.name.getText(source) === "selected") found = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!found) throw new Error(`Missing production ${name}`);
  return found.getText(source);
}
function execute(file: string, expression: string, context: Record<string, unknown>): unknown {
  const code = ts.transpileModule(`return (${fragment(file, expression)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(context), code)(...Object.values(context));
}
const STORE = "features/administration/custom-tables/CustomTablesAdmin.tsx";
const LEAVE = "features/hr/leave/manager/LeaveQueueSurface.tsx";
const SCRAPE = "features/scraper/batch/BatchScrapePage.tsx";
const noop = () => undefined;

describe("copy selection and production write boundaries", () => {
  it("archives only eligible selected tables and does nothing for a copy-only selection", async () => {
    const archiveTables = jest.fn(async (_targets: unknown[]) => []);
    const selectedRows = [{ id: "kept", kept: true }, { id: "ordinary", kept: false, organizationId: "org-1", name: "Ordinary" }];
    const archiveRows = execute(STORE, "archiveRows", { selectedRows, protectionOf: (row: { kept: boolean }) => row.kept ? "kept" : null });
    const context = { selectedRows, archiveRows, archiveTables, tableArchiveDoor: noop, setRunning: noop, setConfirming: noop, setRefusals: noop, setSelectedIds: noop, setNonce: noop, toast: { success: noop, error: noop } };
    await (execute(STORE, "runArchive", context) as () => Promise<void>)();
    expect(archiveTables.mock.calls[0]?.[0]).toEqual([{ tableId: "ordinary", organizationId: "org-1", name: "Ordinary" }]);
    archiveTables.mockClear();
    await (execute(STORE, "runArchive", { ...context, archiveRows: [] }) as () => Promise<void>)();
    expect(archiveTables).not.toHaveBeenCalled();
  });

  it("decides only selected current rows whose flow permits bulk, never stale or copy-only IDs", async () => {
    const selectedIds = ["allowed", "copy-only", "stale"];
    const focused = [{ step_id: "allowed", allow_bulk_decide: true }, { step_id: "copy-only", allow_bulk_decide: false }, { step_id: "not-selected", allow_bulk_decide: true }];
    const currentSelectedIds = execute(LEAVE, "currentSelectedIds", { selectedIds, focused });
    expect(currentSelectedIds).toEqual(["allowed", "copy-only"]);
    const bulkIds = execute(LEAVE, "bulkIds", { currentSelectedIds, focused });
    const bulkDecide = jest.fn(async () => ({ data: { results: [], succeeded: 1, skipped: 0 } }));
    const context = { bulkIds, bulkDecide, HR_DECISION_VERB: { approve: "approve" }, isRefusal: () => false, setBulkBusy: noop, setBulkRefusal: noop, setBulkOutcomes: noop, setSelectedIds: noop, toast: { success: noop }, queue: { reload: async () => undefined } };
    await (execute(LEAVE, "runBulk", context) as (intent: string) => Promise<void>)("approve");
    expect(bulkDecide).toHaveBeenCalledWith(["allowed"], "approve", null);
    bulkDecide.mockClear();
    await (execute(LEAVE, "runBulk", { ...context, bulkIds: [] }) as (intent: string) => Promise<void>)("approve");
    expect(bulkDecide).not.toHaveBeenCalled();
  });

  it("opens Save only for landed successful Sources, while failures remain available to copy", () => {
    const setSaveRows = jest.fn();
    const toast = { error: jest.fn(), warning: jest.fn() };
    const open = execute(SCRAPE, "openSaveForSelected", { setSaveRows, toast }) as (rows: unknown[]) => void;
    const landed = { status: "success", processedDocumentId: "source-1" };
    open([landed, { status: "failed" }, { status: "success", processedDocumentId: null, sourceNotices: [] }]);
    expect(setSaveRows).toHaveBeenCalledWith([landed]);
    expect(toast.warning).toHaveBeenCalled();
    setSaveRows.mockClear();
    open([{ status: "failed" }]);
    expect(setSaveRows).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
  it("shows the actual landed Source count and disables Save for copy-only rows", () => {
    const createElement = (_type: unknown, props: Record<string, unknown>, ...children: unknown[]) => ({ props, children });
    const actions = execute(SCRAPE, "selectionActions", { React: { createElement }, Button: "button", Bookmark: "icon", openSaveForSelected: noop }) as (rows: unknown[]) => { props: { disabled: boolean }; children: unknown[] };
    const copyOnly = actions([{ status: "success", processedDocumentId: null }, { status: "failed" }]);
    expect(copyOnly.props.disabled).toBe(true);
    expect(copyOnly.children).toContain(0);
    const mixed = actions([{ status: "success", processedDocumentId: "source-1" }, { status: "success", processedDocumentId: null }]);
    expect(mixed.props.disabled).toBe(false);
    expect(mixed.children).toContain(1);
  });

});


const KEYWORDS = "features/marketing/seo/keyword-table/KeywordTable.tsx";
const GSC = "features/marketing/search-console/components/GscDimensionTable.tsx";
describe("unmapped keyword rows are copyable without becoming write targets", () => {
  const mapped = { key: "mapped", keyword_id: "keyword-1" };
  const unmapped = { key: "unmapped", keyword_id: null };
  it("passes only mapped rows and IDs to KeywordTable write integrations", () => {
    const selectedRows = [mapped, unmapped];
    const selectedWritableRows = execute(KEYWORDS, "selectedWritableRows", { selectedRows });
    const selectedKeywordIds = execute(KEYWORDS, "selectedKeywordIds", { selectedWritableRows });
    const selectionActions = jest.fn(() => null);
    const actions = execute(KEYWORDS, "selectionActions", { controls: {}, selectedKeywordIds, selectedWritableRows, selectedRows, selectionActions, setSelectedIds: noop }) as () => void;
    actions();
    expect(selectionActions).toHaveBeenCalledWith(expect.objectContaining({ keywordIds: ["keyword-1"], rows: [mapped] }));
    expect(selectedRows).toEqual([mapped, unmapped]);
  });
  it("disables Search Console class buttons for copy-only selections and writes only mapped IDs", async () => {
    type Element = { props: { disabled?: boolean }; children: unknown[] };
    const actions = execute(GSC, "gscSelectionActions", {
      React: { createElement: (_type: unknown, props: Element["props"], ...children: unknown[]) => ({ props, children }) },
      Button: "button", BULK_CLASS_OPTIONS: [{ value: "money", label: "Money" }], bulkPending: false, runBulkClassAssign: noop,
    }) as (rows: unknown[]) => Element;
    const button = (rows: unknown[]) => (actions(rows).children[1] as Element[])[0];
    expect(button([unmapped]).props.disabled).toBe(true);
    expect(button([mapped, unmapped]).props.disabled).toBe(false);
    const setGscKeywordClass = jest.fn(async () => undefined);
    const run = execute(GSC, "runBulkClassAssign", { siteId: "site-1", setGscKeywordClass, setBulkPending: noop, setSelectedIds: noop, toast: { error: noop, success: noop }, BULK_CLASS_OPTIONS: [], queryClient: { invalidateQueries: async () => undefined } }) as (ruling: string, rows: unknown[]) => Promise<void>;
    await run("money", [mapped, unmapped]);
    expect(setGscKeywordClass).toHaveBeenCalledWith("site-1", ["keyword-1"], "money", null, { origin: "manual", confirmed: true });
    setGscKeywordClass.mockClear();
    await run("money", [unmapped]);
    expect(setGscKeywordClass).not.toHaveBeenCalled();
  });
});


it.each([
  "features/marketing/seo/value-system/topics/UnplacedQueue.tsx",
  "features/marketing/seo/value-system/topics/ProposedQueue.tsx",
  "features/marketing/seo/keyword-workbench/components/KeywordWorkbench.tsx",
])("labels the full-selection clear action honestly in %s", (file) => {
  const source = ts.createSourceFile(file, readFileSync(resolve(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const labels: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "onClick" && attribute.initializer?.getText(source) === "{clear}",
    )) labels.push(node.children.map((child) => child.getText(source)).join(" ").trim());
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(labels).toEqual(["Clear selection"]);
});
