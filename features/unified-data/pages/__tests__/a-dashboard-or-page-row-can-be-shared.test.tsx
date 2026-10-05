/**
 * v7 APPS-ON-DATA item 4 — the Dashboards home (and Pages): every row's menu carries Share, and Share
 * opens the store's RECORD share for that dashboard in ITS organization (a dashboard is one record).
 * Break named: a row menu with no Share; a share of the table instead of the dashboard; a share asked
 * in the active organization.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const shared: unknown[] = [];
jest.mock("@/features/sharing/components/RecordStoreShareSurface", () => ({
  recordStoreShare: (subject: unknown) => {
    shared.push(subject);
    return null;
  },
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }) }));
jest.mock("@/features/unified-data/home/dataHomeCorpus", () => ({ createDataHomeCorpus: jest.fn() }));
jest.mock("@/features/unified-data/home/dataHomeService", () => ({ createDataHomeService: jest.fn() }));
jest.mock("@/features/unified-data/home/dataHomeColumns", () => ({ dataHomeColumns: jest.fn(), ownerLabel: jest.fn() }));
jest.mock("@/lib/entity-list/components/EntityListPage", () => ({ EntityListPage: () => null }));
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({ useRecordsDataSource: jest.fn() }));
jest.mock("@ai-matrx/records-ui", () => ({ RecordsMount: () => null, personActor: jest.fn() }));
jest.mock("@ai-matrx/records/react", () => ({ useRecordsClient: jest.fn() }));

import { useItemRowActions } from "../ItemsHome";
import type { DataHomeRow } from "@/features/unified-data/home/dataHomeRows";

const row = {
  id: "dashboard:org-rincon:dash-1",
  itemId: "dash-1",
  kind: "dashboard",
  name: "Truck 1 — jobs by stage",
  organizationId: "org-rincon",
  tableId: "table-jobs",
  href: "/data/table-jobs?dashboard=dash-1",
} as unknown as DataHomeRow;

describe("a dashboard or page row can be shared", () => {
  it("offers Share and opens the store's record share for that dashboard in its own organization", async () => {
    let actions: ReturnType<typeof useItemRowActions> | null = null;
    function Probe() {
      actions = useItemRowActions({} as never);
      return <>{actions.modals}</>;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    const menu = actions!.actions.menuFor!(row)();
    const share = menu.sections.flatMap((s) => s.items).find((i) => i.id === "share") as { onSelect: () => void } | undefined;
    expect(share).toBeDefined();
    await act(async () => share!.onSelect());
    expect(shared.at(-1)).toMatchObject({ kind: "record", subjectId: "dash-1", organizationId: "org-rincon", name: "Truck 1 — jobs by stage" });
    act(() => root.unmount());
  });
  });
});
