/**
 * G1, RENDERED (lane TABLE-ACTIONS wave 1 fix round): one table has ONE menu on every surface —
 * what a person sees after `ItemMenu` has drawn it, not only what the adapter hands it. The table
 * row's ⋯ gets an extra "Alchemy" entry because `ItemMenu` injects it under the row's
 * `MatrxTableRowAlchemyProvider` (MatrxDataTable, placement "menu"); the card ⋯ drew 22 entries to
 * the row's 23 until the card carried the same scope.
 *
 * The break this names: a card (or compact row) ⋯ opened without the row scope, or with an entry
 * of its own — the two rendered lists differ.
 *
 * Use case: Cedar Ridge Physical Therapy's front desk opens "Referral Intake Queue" from the Data
 * home, once from the table row and once from its card.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MatrxTableRowAlchemyProvider } from "@ai-matrx/design-system/data-table";
import { tableActions } from "@ai-matrx/records-ui/object-actions";
import { whatYouMayDo } from "@ai-matrx/records-ui";

import { ItemMenu } from "@ai-matrx/design-system/item";
import { toItemMenuConfig } from "../tableActionAdapters";
import { DataHomeCards, dataHomeRowCopy } from "@/features/unified-data/home/DataHomeViews";
import { row as homeRow } from "@/features/unified-data/home/__tests__/fixtures";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return { __esModule: true, default: Link };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
for (const name of ["scrollIntoView", "hasPointerCapture", "setPointerCapture", "releasePointerCapture"] as const) {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  if (typeof proto[name] !== "function") proto[name] = () => false;
}
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver !== "function") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const TABLE = homeRow({ name: "Referral Intake Queue" });
const CONTROLS = { closeDetail() {}, openDetail() {}, openWindow() {}, closeWindow() {}, hasPendingEdits: false, discardPendingEdits() {} };

function config() {
  return toItemMenuConfig(
    tableActions({
      table: { id: TABLE.tableId as string, name: TABLE.name },
      rights: whatYouMayDo("admin", true),
      host: { open: () => {}, copyText: () => {}, rename: () => {}, share: () => {}, export: () => {}, archive: () => {} },
    }),
  );
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function openAndRead(trigger: HTMLElement): Promise<string[]> {
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
  const menu = document.querySelector('[role="menu"]');
  expect(menu).not.toBeNull();
  return [...menu!.querySelectorAll('[role^="menuitem"]')].map((el) => (el.textContent ?? "").trim());
}

it("the card's ⋯ draws exactly the entries the table row's ⋯ draws", async () => {
  // The table row, wired the way MatrxDataTable wires a row whose copy sits in the menu.
  await act(async () =>
    root.render(
      <MatrxTableRowAlchemyProvider copy={dataHomeRowCopy(TABLE)} placement="menu" controls={CONTROLS}>
        <ItemMenu config={config()} align="end">
          <button type="button" data-the-row="">
            row
          </button>
        </ItemMenu>
      </MatrxTableRowAlchemyProvider>,
    ),
  );
  await settle();
  const fromRow = await openAndRead(host.querySelector("[data-the-row]") as HTMLElement);
  act(() => root.unmount());
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () =>
    root.render(
      <DataHomeCards
        rows={[TABLE]}
        density="comfortable"
        showShared
        hrefFor={() => TABLE.href}
        actions={{ menuFor: () => config, onOpenRow: () => {} }}
        isStarred={() => false}
        onOpened={() => {}}
        {...({} as Record<string, never>)}
      />,
    ),
  );
  await settle();
  const fromCard = await openAndRead(host.querySelector('[aria-label="Actions for Referral Intake Queue"]') as HTMLElement);

  expect(fromRow).toContain("Alchemy");
  expect(fromCard).toEqual(fromRow);
});
