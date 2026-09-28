/**
 * THE USE CASE (lane CMS-TRASH, 2026-09-27). A landscaping company's owner archives the
 * "Services" page of their website, then builds a new one at the same address. A week later they
 * want the old page back. It lives in the CMS database, which the main Trash registry cannot
 * read, so before this lane it was nowhere in /trash.
 *
 *   1. MERGE     /trash shows the archived site page beside their archived note, in one list and
 *                one kind picker, newest first.
 *   2. PRE-0041  before the CMS archive column exists the CMS source is "not live": no Site kind,
 *                no row, no error toast, and no second request for rows it cannot have.
 *   3. NOTICE    Restore goes to the CMS door, and the door's notice sentence ("…restored at
 *                /services-restored because a live page now uses /services.") is in the toast.
 *
 * RED against HEAD: `pnpm jest --roots <scratch>` over a copy of HEAD's features/trash with this
 * file dropped in (see FEATURE.md change log, 2026-09-27).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const rpc = jest.fn();
const toast = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc } }));
jest.mock("@/components/ui/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { TrashList } from "../components/TrashList";

const NOTE = {
  artifact_kind: "note",
  entity_token: "note",
  label: "Note",
  id: "11111111-1111-4111-8111-111111111111",
  title: "Spring aeration checklist",
  deleted_at: "2026-09-20T15:00:00Z",
  organization_id: "",
  is_mine: true,
};
const PAGE = {
  artifact_kind: "cms_page",
  entity_token: "cms_page",
  label: "Site page",
  id: "22222222-2222-4222-8222-222222222222",
  title: "Services",
  deleted_at: "2026-09-26T09:30:00Z",
  organization_id: "",
  is_mine: true,
};
const NOTICE =
  'Page "Services" was restored at /services-restored because a live page now uses /services.';

let cmsLive = true;
const fetchMock = jest.fn();

function rpcAnswer(fn: string) {
  if (fn === "trash_counts") return { data: [{ artifact_kind: "note", label: "Note", n: 1 }], error: null };
  if (fn === "trash_list") return { data: [NOTE], error: null };
  if (fn === "entity_undelete") return { data: true, error: null };
  throw new Error(`unexpected rpc ${fn}`);
}

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function fetchAnswer(url: string, init?: RequestInit) {
  if (!url.startsWith("/api/cms/trash")) throw new Error(`unexpected fetch ${url}`);
  if (init?.method === "POST") {
    return json({
      action: "restored",
      notices: [{ kind: "route_suffixed", entity: "page", id: PAGE.id, from: "/services", to: "/services-restored", message: NOTICE }],
    });
  }
  if (!cmsLive) return json({ live: false, counts: [], items: [] });
  const limit = Number(new URL(url, "http://x").searchParams.get("limit"));
  return json({
    live: true,
    counts: [{ artifact_kind: "cms_page", label: "Site page", n: 1 }],
    items: limit === 0 ? [] : [PAGE],
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cmsLive = true;
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => rpcAnswer(fn));
  toast.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => fetchAnswer(url, init));
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const rowIds = () =>
  Array.from(container.querySelectorAll("li[data-trash-id]")).map((li) => li.getAttribute("data-trash-id"));
const chipTexts = () => Array.from(container.querySelectorAll("button")).map((b) => b.textContent ?? "");

/** The plain text of a toast description, whatever React shape it has. */
function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? textOf(props.children) : "";
}

test("the archived site page and the archived note are one list and one kind picker, newest first", async () => {
  await act(async () => {
    root.render(<TrashList scope={{ mode: "personal" }} />);
  });
  await flush();

  expect(rowIds()).toEqual([PAGE.id, NOTE.id]);
  expect(chipTexts().some((t) => t.startsWith("Site page"))).toBe(true);
  expect(chipTexts().some((t) => t.startsWith("Note"))).toBe(true);

  // Picking the Site page kind asks only the CMS source.
  const chip = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Site page"))!;
  rpc.mockClear();
  await act(async () => {
    chip.click();
  });
  await flush();
  expect(rowIds()).toEqual([PAGE.id]);
  expect(rpc).not.toHaveBeenCalledWith("trash_list", expect.anything());
});

test("before the CMS archive column exists, the CMS source contributes nothing and says nothing", async () => {
  cmsLive = false;
  await act(async () => {
    root.render(<TrashList scope={{ mode: "personal" }} />);
  });
  await flush();

  expect(rowIds()).toEqual([NOTE.id]);
  expect(chipTexts().some((t) => t.startsWith("Site"))).toBe(false);
  expect(toast).not.toHaveBeenCalled();
  // The CMS route was asked once (its counts said "not live") and never again for rows.
  const cmsCalls = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/cms/trash"));
  expect(cmsCalls).toHaveLength(1);
});

test("restoring the site page goes through the CMS door and the toast carries its notice", async () => {
  await act(async () => {
    root.render(<TrashList scope={{ mode: "personal" }} />);
  });
  await flush();

  const row = container.querySelector(`li[data-trash-id="${PAGE.id}"]`)!;
  const restore = row.querySelector("button")!;
  await act(async () => {
    restore.click();
  });
  await flush();

  const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
  expect(post).toBeDefined();
  expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ token: "cms_page", id: PAGE.id });
  expect(rpc).not.toHaveBeenCalledWith("entity_undelete", expect.anything());

  const restored = toast.mock.calls.map(([t]) => t as { title?: string; description?: unknown });
  const shown = restored.find((t) => t.title === "Site page restored");
  expect(shown).toBeDefined();
  expect(textOf(shown!.description)).toContain(NOTICE);
});
