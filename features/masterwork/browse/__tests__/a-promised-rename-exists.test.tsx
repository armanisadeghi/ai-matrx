/**
 * THE RENAME THE DUPLICATE-NAME NOTICE PROMISES EXISTS — cold walk 22, A.
 *
 * Starting a Rulebook under a name she already uses raises: "You already have
 * a Rulebook called … This one is separate — rename either from its own
 * page." There was no rename anywhere: not on the Rulebook page (the name was
 * plain text), not in the list's row menu (Open · Masterworks · Share · Copy
 * link · Delete). A sentence that tells a person to do something is a promise
 * that the control exists.
 *
 * Pinned here:
 *   1. the list row menu offers "Rename" on a Rulebook she owns, and it saves
 *      through the Rulebook's one meta door and updates the row in place;
 *   2. it is not offered on someone else's Rulebook (the RPC would refuse);
 *   3. the Rulebook page puts the platform's inline-title primitive on the
 *      name, bound to the same door;
 *   4. the notice names exactly those two controls.
 *
 * RED before: no "rename" entry in the menu, no EditableLabel on the page, and
 * the notice said "rename either from its own page".
 */
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const OWNER = "5b1c7f0e-8a3d-4f2b-9c61-2e7d4a9b0c11";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => OWNER,
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/features/sharing/components/ShareModal", () => ({
  ShareModal: () => null,
}));
jest.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
jest.mock("@/components/dialogs/text-input/TextInputDialog", () => ({
  TextInputDialog: ({
    title,
    defaultValue,
    onConfirm,
  }: {
    title: string;
    defaultValue: string;
    onConfirm: (v: string) => Promise<void>;
  }) => (
    <div data-testid="rename-dialog">
      <span>{title}</span>
      <span data-testid="rename-default">{defaultValue}</span>
      <button
        type="button"
        data-testid="rename-confirm"
        onClick={() => void onConfirm("walk22-Regrout or Retile Verdict — upstairs bath")}
      />
    </div>
  ),
}));
const updateRulebookMeta = jest.fn();
jest.mock("../../service", () => ({
  softDeleteRulebook: jest.fn(),
  updateRulebookMeta: (...args: unknown[]) => updateRulebookMeta(...args),
}));

import { useRulebookRowActions } from "../useRulebookRowActions";
import type { RulebookListRow } from "../../types";
import type { EntityListController } from "@/lib/entity-list/config";
import type { ItemMenuConfig } from "@/components/official/item/types";

function row(id: string, createdBy: string): RulebookListRow {
  return {
    id,
    name: "walk22-Regrout or Retile Verdict",
    created_by: createdBy,
    rule_count: 0,
  } as unknown as RulebookListRow;
}

const patchRow = jest.fn();
const LIST = { patchRow, removeRow: jest.fn() } as unknown as EntityListController<RulebookListRow>;

let host: HTMLDivElement;
let root: Root;
let menus: Record<string, ItemMenuConfig> = {};

function Harness({ rows }: { rows: RulebookListRow[] }) {
  const { actions, modals } = useRulebookRowActions(LIST);
  menus = Object.fromEntries(rows.map((r) => [r.id, actions.menuFor(r)()]));
  return <>{modals}</>;
}

function itemsOf(menu: ItemMenuConfig) {
  return (menu.sections ?? []).flatMap((s) => s.items ?? []) as Array<{
    id: string;
    label: string;
    onSelect?: () => void;
  }>;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  updateRulebookMeta.mockReset();
  patchRow.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the Masterworks list offers the rename it promises", () => {
  it("Rename on her own Rulebook saves through the meta door and updates the row", async () => {
    const mine = row("008779b9-f7e1-4fcb-8dbf-e7f72097ef6f", OWNER);
    act(() => root.render(<Harness rows={[mine]} />));
    const rename = itemsOf(menus[mine.id]).find((i) => i.id === "rename");
    expect(rename?.label).toBe("Rename");

    act(() => rename!.onSelect!());
    expect(host.querySelector("[data-testid=rename-default]")?.textContent).toBe(
      mine.name,
    );

    updateRulebookMeta.mockResolvedValue({
      name: "walk22-Regrout or Retile Verdict — upstairs bath",
    });
    await act(async () => {
      (host.querySelector("[data-testid=rename-confirm]") as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(updateRulebookMeta).toHaveBeenCalledWith({
      rulebookId: mine.id,
      patch: { name: "walk22-Regrout or Retile Verdict — upstairs bath" },
    });
    expect(patchRow).toHaveBeenCalledWith(mine.id, {
      name: "walk22-Regrout or Retile Verdict — upstairs bath",
    });
  });

  it("is not offered on a Rulebook someone else owns", () => {
    const theirs = row("f3fefbaf-15e6-4493-ae86-f9870e7e1f4d", "someone-else");
    act(() => root.render(<Harness rows={[theirs]} />));
    expect(itemsOf(menus[theirs.id]).some((i) => i.id === "rename")).toBe(false);
  });
});

describe("the Rulebook page and the notice agree with the controls", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

  it("the page edits the name in place with the platform's inline-title primitive", () => {
    const page = read("../../components/detail/RulebookDetailPage.tsx");
    const nameBlock = page.slice(
      page.indexOf('data-surface-value="rulebook_name"'),
      page.indexOf('data-surface-value="rulebook_name"') + 900,
    );
    expect(nameBlock).toMatch(/<EditableLabel[\s\S]*value=\{rulebook\.name\}/);
    expect(nameBlock).toContain("onCommit={renameRulebook}");
    expect(page).toMatch(
      /renameRulebook[\s\S]{0,400}updateRulebookMeta\(\{[\s\S]{0,80}patch: \{ name \}/,
    );
  });

  it("the duplicate-name notice names the two controls that exist", () => {
    const flow = read("../../intake/NewRulebookFlow.tsx");
    expect(flow).not.toContain("rename either from its own page");
    expect(flow).toContain("click its name at the top of its page");
    expect(flow).toContain("use Rename in its menu on the Masterworks list");
  });
});
