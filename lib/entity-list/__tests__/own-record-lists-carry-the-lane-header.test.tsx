/**
 * LISTS THAT SHOWED ONLY THE PERSON'S OWN RECORDS CARRY THE CANONICAL LIST HEADER
 * (Arman 2026-10-03, common-docs /policies/access-ladder.md).
 *
 * The defect class: a list read `.eq("created_by", me)` (or leaned on row security) and offered no
 * lanes, so a coworker's session, a shared run or an organization's dataset never appeared and the
 * person could not ask for them. The repair is the standard lane reader
 * (`<type>_list_lanes` + `<type>_lane_rows`) behind the shared `useLaneParam` / `useOrgFilterParam` /
 * `useLaneRows` and `<EntityLaneHeader>`.
 *
 * Red on: a surface below dropping its header or its lane read, the header not opening on All, the
 * landing-tab knob being ignored, or a declared-absent lane rendering as a tab.
 */
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockLanding = jest.fn<Promise<{ kind: string }>, [string]>();
jest.mock("@/lib/list-scope", () => ({
  defaultListScopeFor: (token: string) => mockLanding(token),
}));
let mockParams = new URLSearchParams();
jest.mock("../useListSearchParams", () => ({
  useListSearchParams: () => mockParams,
}));
jest.mock("../components/EntityOrgFilter", () => ({
  EntityOrgFilter: () => <div data-testid="org-filter">All organizations</div>,
}));

import { EntityLaneHeader } from "../components/EntityLaneHeader";
import { useLaneParam } from "../useLaneParam";
import { useOrgFilterParam } from "../orgFilterUrl";
import type { LaneRow } from "../laneRows";
import type { LaneRowsState } from "../useLaneRows";
import { withStandardLanes, type LaneSupport, type ListScopeKind } from "@/lib/list-scope/types";

const ROOT = join(__dirname, "..", "..", "..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Every converted list: where its header renders, its type, and where its rows are read. */
const SURFACES = [
  {
    list: "Transcript Studio sessions",
    surface: "features/transcript-studio/components/StudioSidebar.tsx",
    token: "studio_session",
    reader: "features/transcript-studio/service/studioService.ts",
    rpcs: ["studio_session_lane_rows", "studio_session_list_lanes"],
  },
  {
    list: "Study sessions",
    surface: "features/education/study/components/SessionsBrowser.tsx",
    token: "study_session",
    reader: "features/education/study/service/studyService.ts",
    rpcs: ["study_session_lane_rows", "study_session_list_lanes"],
  },
  {
    list: "Podcast studio runs",
    surface: "features/podcasts/studio/components/RunsManageView.tsx",
    token: "agent_run",
    reader: "features/podcasts/studio/runs/runsRepository.ts",
    rpcs: ["agent_run_lane_rows", "agent_run_list_lanes"],
  },
  {
    list: "Extraction datasets",
    surface: "features/page-extraction/data-review/ExtractionCatalogClient.tsx",
    token: "page_extraction_job",
    reader: "features/page-extraction/data-review/data.ts",
    rpcs: ["page_extraction_job_lane_rows", "page_extraction_job_list_lanes"],
  },
] as const;

describe.each(SURFACES)("$list", ({ surface, token, reader, rpcs }) => {
  it("renders the canonical list header, its lane read from the type's landing tab", () => {
    const text = source(surface);
    expect(text).toContain("<EntityLaneHeader");
    expect(text).toContain(`useLaneParam("${token}"`);
    expect(text).toContain("useOrgFilterParam(");
  });

  it("reads its rows and its lane counts through the type's lane functions", () => {
    const text = source(reader);
    for (const rpc of rpcs) expect(text).toContain(`"${rpc}"`);
  });
});

const rows = (spec: Array<[string, ListScopeKind, string]>): LaneRow[] =>
  spec.map(([id, lane, org]) => ({ id, lane, organization_id: org }));

function Probe({
  token,
  scopes,
  laneSupport,
  laneRows,
}: {
  token: string;
  scopes: ListScopeKind[];
  laneSupport?: LaneSupport;
  laneRows: LaneRowsState;
}) {
  const [lane, setLane] = useLaneParam(token, withStandardLanes(scopes, { lanes: laneSupport }));
  const [orgId, setOrgId] = useOrgFilterParam([]);
  return (
    <EntityLaneHeader
      scopes={scopes}
      laneSupport={laneSupport}
      lane={lane}
      onLaneChange={setLane}
      orgId={orgId}
      onOrgChange={setOrgId}
      laneRows={laneRows}
    />
  );
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(ui);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  mockParams = new URLSearchParams();
  mockLanding.mockReset();
});

const tabs = () =>
  Array.from(host!.querySelectorAll('[role="tab"]')).map((t) => ({
    label: t.textContent?.replace(/\d+$/, "").trim(),
    count: t.textContent?.match(/(\d+)$/)?.[1] ?? null,
    selected: t.getAttribute("aria-selected") === "true",
  }));

const loaded = (r: LaneRow[]): LaneRowsState => ({ rows: r, error: null, reload: () => {} });

describe("the lane header", () => {
  it("opens on All, offers the standard lanes, drops a declared-absent Public, counts from the lane rows", async () => {
    mockLanding.mockResolvedValue({ kind: "all" });
    await render(
      <Probe
        token="studio_session"
        scopes={["mine", "orgs", "shared"]}
        laneSupport={{ public: false }}
        laneRows={loaded(
          rows([
            ["a", "all", "o1"], ["a", "mine", "o1"], ["a", "orgs", "o1"],
            ["b", "all", "o2"], ["b", "shared", "o2"],
          ]),
        )}
      />,
    );
    expect(tabs().map((t) => t.label)).toEqual(["All", "Mine", "My team", "My Orgs", "Shared"]);
    expect(tabs().find((t) => t.selected)?.label).toBe("All");
    expect(tabs().map((t) => t.count)).toEqual(["2", "1", "0", "1", "1"]);
    expect(host!.querySelector('[data-testid="org-filter"]')).not.toBeNull();
  });

  it("follows the type's landing-tab knob, and the address wins over it", async () => {
    mockLanding.mockResolvedValue({ kind: "mine" });
    await render(<Probe token="agent_run" scopes={["mine", "orgs", "shared"]} laneSupport={{ public: false }} laneRows={loaded([])} />);
    expect(tabs().find((t) => t.selected)?.label).toBe("Mine");
    act(() => root?.unmount());
    host?.remove();
    mockParams = new URLSearchParams("scope=public");
    await render(<Probe token="page_extraction_job" scopes={["mine", "orgs", "shared", "public"]} laneRows={loaded([])} />);
    expect(tabs().find((t) => t.selected)?.label).toBe("Public");
  });

  it("never shows a count it could not read as 0", async () => {
    mockLanding.mockResolvedValue({ kind: "all" });
    await render(
      <Probe
        token="study_session"
        scopes={["mine", "orgs", "shared"]}
        laneSupport={{ public: false }}
        laneRows={{ rows: null, error: "refused", reload: () => {} }}
      />,
    );
    expect(host!.querySelector('[role="tablist"]')!.textContent).not.toMatch(/\d/);
    expect(host!.querySelector('[aria-label="Retry counts"]')).not.toBeNull();
  });
});
