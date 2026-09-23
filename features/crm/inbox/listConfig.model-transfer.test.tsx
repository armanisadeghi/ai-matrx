import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { buildRowAgentInput, buildViewAgentInput } from "@ai-matrx/design-system/data-table/copy-helpers";
import type { MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table/types";
import type { EntityRowActions } from "@/lib/entity-list/config";
import { EntityListTable } from "@/lib/entity-list/components/EntityListTable";
import { inboxListConfig } from "./listConfig";
import type { InboxRow } from "./types";

let capturedTableProps: Record<string, unknown> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: Record<string, unknown>) => {
    capturedTableProps = props;
    return null;
  },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const HOSTILE = "gmail-inbox-secret-prepare-must-never-send";
const ROW = {
  backlink_brand_id: "11111111-1111-4111-8111-111111111111",
  backlink_id: "22222222-2222-4222-8222-222222222222",
  backlink_label: HOSTILE,
  backlink_site_id: "33333333-3333-4333-8333-333333333333",
  channel_code: "email",
  classification: HOSTILE,
  created_at: "2026-09-22T08:00:00+00:00",
  employer_id: "44444444-4444-4444-8444-444444444444",
  employer_name: HOSTILE,
  evidence: HOSTILE,
  handled: false,
  handled_at: "",
  id: "55555555-5555-4555-8555-555555555555",
  is_owner: true,
  member_id: "66666666-6666-4666-8666-666666666666",
  member_status: "replied",
  occurred_at: "2026-09-22T08:00:00+00:00",
  organization_id: "77777777-7777-4777-8777-777777777777",
  organization_name: "Harbor Dental",
  outbound_id: "88888888-8888-4888-8888-888888888888",
  outbound_sent_at: "2026-09-21T08:00:00+00:00",
  outbound_subject: HOSTILE,
  outreach_list_id: "99999999-9999-4999-8999-999999999999",
  outreach_list_name: HOSTILE,
  outreach_list_status: "active",
  party_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  party_kind: "person",
  party_name: HOSTILE,
  reputation_case_brand_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  reputation_case_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  reputation_case_label: HOSTILE,
  reputation_case_site_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  sending_identity_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  sending_identity_label: HOSTILE,
  snippet: HOSTILE,
  step: 2,
  subject: HOSTILE,
  thread_key: "thread-842",
  total_count: 19,
} satisfies InboxRow;

const ACTIONS: EntityRowActions<InboxRow> = {
  menuFor: () => (() => ({ items: [] })) as never,
  onOpenRow: () => undefined,
};

describe("CRM inbox table model-transfer seam", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    capturedTableProps = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("forwards only opaque IDs and counts for row, list, and selection preparation", () => {
    act(() => {
      root.render(
        <EntityListTable
          config={inboxListConfig}
          actions={ACTIONS}
          rows={[ROW]}
          total={19}
          page={1}
          pageSize={25}
          sort="occurred_at"
          direction="desc"
          filters={{}}
          facets={{ byKind: {} }}
          isLoading={false}
          isFetching={false}
          density="compact"
          showSharedColumns={false}
          hiddenColumns={[]}
          onSaveEdits={async () => undefined}
          onQueryChange={() => undefined}
        />,
      );
    });

    const copy = capturedTableProps?.copy as
      | MatrxDataTableCopyConfig<InboxRow>
      | undefined;
    expect(copy).toBe(inboxListConfig.copy);
    if (!copy?.agentRow) throw new Error("Inbox copy projection is missing");

    // MatrxDataTable's row, view, and selection Prepare actions all choose
    // JSON before agent input. Each JSON candidate therefore has to be safe.
    const rowJson = copy.agentRow(ROW);
    const listJson = [ROW].map(copy.agentRow);
    const selectionJson = [ROW].map(copy.agentRow);
    expect(rowJson).toEqual({ id: ROW.id });
    expect(listJson).toEqual([{ id: ROW.id }]);
    expect(selectionJson).toEqual([{ id: ROW.id }]);

    const modelBound = {
      row: buildRowAgentInput(copy, ROW),
      list: buildViewAgentInput(copy, [ROW], [ROW]),
      rowJson,
      listJson,
      selectionJson,
    };
    expect(JSON.stringify(modelBound)).toContain(ROW.id);
    expect(JSON.stringify(modelBound)).not.toContain(HOSTILE);
    expect(copy.rowAttributes?.(ROW)).toEqual({ id: ROW.id });
    expect(copy.listAttributes?.([ROW], [ROW])).toEqual({
      rows: 1,
      rows_loaded: 1,
      rows_total: 19,
    });
    expect(copy.aiVariants).toBeUndefined();
    expect(copy.humanRow(ROW)).toBe(`Reply ${ROW.id}`);
  });
});
