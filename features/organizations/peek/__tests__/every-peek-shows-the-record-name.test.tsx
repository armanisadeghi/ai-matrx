/**
 * EVERY PEEK SHOWS THE RECORD'S NAME.
 *
 * THE DEFECT (G10A review, 2026-10-02, nightly clone): a Workbook chip opened a
 * peek titled only "Workbook" plus a created date. `WorkbookPeek` read
 * `description` as its title — the table's name column is `workbook_name` — so
 * every workbook without a description was nameless in its own quick look.
 *
 * The class: a bespoke peek that reads its title from a column of its own
 * choosing, instead of the column the entity registry names as the record's
 * title (`EntityInfo.titleColumn`, generated from `platform.entity_types`).
 * This renders every bespoke peek that reads its row itself against a fake
 * client that fills each selected column with its own name, and asserts the
 * dialog title is the registry's title column. Peeks that delegate to a
 * canonical component or service are listed in DELEGATED with the reason.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Every column the peek selects comes back holding "G10A <column>". */
function rowFor(columns: string): Record<string, unknown> {
  const row: Record<string, unknown> = { id: "00000000-0000-4000-8000-000000000001" };
  for (const col of columns.split(",").map((c) => c.trim()).filter(Boolean)) {
    row[col] =
      col === "created_at" || col === "updated_at"
        ? "2026-08-29T17:29:00Z"
        : col === "tags"
          ? []
          : `G10A ${col}`;
  }
  return row;
}

jest.mock("@/utils/supabase/client", () => {
  const chain = (): unknown => {
    let columns = "";
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    for (const m of ["eq", "is", "in", "order", "limit", "neq", "filter", "match"]) builder[m] = self;
    builder.select = (cols: string) => {
      columns = cols;
      return builder;
    };
    const done = () => Promise.resolve({ data: rowFor(columns), error: null });
    builder.maybeSingle = done;
    builder.single = done;
    builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [rowFor(columns)], error: null });
    return builder;
  };
  const client: Record<string, unknown> = {};
  client.schema = () => client;
  client.from = () => chain();
  client.rpc = () =>
    Promise.resolve({ data: rowFor("list_name, description, created_at"), error: null });
  client.auth = { getUser: () => Promise.resolve({ data: { user: null }, error: null }) };
  return { supabase: client, createClient: () => client };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/",
}));

import { PEEK_REGISTRY } from "../registry";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { WithStoreReads } from "@/tests/helpers/WithStoreReads";

/** Peeks that render a canonical component or read through a service — not a hand-picked column. */
const DELEGATED: Readonly<Record<string, string>> = {
  agent: "AgentSneakPeekModal — the agents feature's own preview",
  mandate: "MandatePeekModal — the mandates feature's own preview",
  party: "fetchPartyDetail — guarded by the-peek-names-the-kind.test.tsx",
  user: "resolveVisiblePerson — a person's display name, not a table column",
  dataset: "readTableDetails — the data-tables service names the table",
  seo_map_topic: "useMapTopicRow + TopicDetailBody — the topical map's own panel",
  sandbox_instance: "a sandbox has no name; its id is what the sandbox UI shows",
  pick_list: "get_user_list_with_items RPC — reads list_name",
  structured_list: "the retired spelling of pick_list — same peek",
};

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const bespoke = Object.keys(PEEK_REGISTRY).filter((kind) => !(kind in DELEGATED));

describe("every peek is titled by the record's name", () => {
  it.each(bespoke)("%s", async (kind) => {
    const info = tryGetEntityInfo(kind);
    expect(info?.titleColumn).toBeTruthy();
    const Peek = PEEK_REGISTRY[kind as keyof typeof PEEK_REGISTRY];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<WithStoreReads><Peek id="00000000-0000-4000-8000-000000000001" open onClose={() => {}} /></WithStoreReads>);
    });
    await settle();
    const titles = [...document.body.querySelectorAll('[role="dialog"] h2')].map((h) => h.textContent);
    const title = titles[titles.length - 1] ?? "";
    expect(title).toBe(`G10A ${info!.titleColumn}`);
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });
});
