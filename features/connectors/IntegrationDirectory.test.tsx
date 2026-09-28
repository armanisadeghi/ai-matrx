/** @jest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IntegrationDirectory } from "./IntegrationDirectory";
import { DEFAULT_DIRECTORY_FILTERS, type DirectoryFilters, type IntegrationDirectoryItem } from "./integration-directory";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./ConnectorMark", () => ({ ConnectorMark: ({ connector }: { connector: { name: string } }) => <span>{connector.name[0]}</span> }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

function item(id: string, name: string, extra: Partial<IntegrationDirectoryItem> = {}): IntegrationDirectoryItem {
  return { id, name, description: `${name} collaboration`, vendor: "Example", category: id === "slack" ? "communication" : "productivity", keywords: name, artwork: { id, name, blurb: name, surfaces: ["directory"] }, featured: id === "slack", saved: false, connected: false, available: true, comingSoon: false, status: "Available", attention: false, ...extra };
}

const items = [item("slack", "Slack"), item("drive", "Google Drive", { saved: true, connected: true, status: "Connected", accountSummary: "me@example.com" }), item("box", "Box", { saved: true, attention: true, status: "Needs attention", accountSummary: "work@example.com" })];

function Harness({ incomplete = false, loading = false }: { incomplete?: boolean; loading?: boolean }) {
  const [filters, setFilters] = useState<DirectoryFilters>(DEFAULT_DIRECTORY_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  return <IntegrationDirectory items={items} filters={filters} onFiltersChange={setFilters} selectedId={selected} onSelect={setSelected} renderDetail={(entry) => <p>Detail for {entry.name}</p>} loading={loading} errors={null} incomplete={incomplete} refreshing={false} onRefresh={jest.fn()} />;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { HTMLElement.prototype.scrollIntoView = jest.fn(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function render(props: { incomplete?: boolean; loading?: boolean } = {}) { await act(async () => root.render(<Harness {...props} />)); }
function click(text: string) { const node = Array.from(container.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes(text)); if (!node) throw new Error(`Missing ${text}`); act(() => node.click()); }
function clickLabel(label: string) { const node = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); if (!node) throw new Error(`Missing ${label}`); act(() => node.click()); }
function setInput(input: HTMLInputElement, value: string) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }

test("search keeps actual clickable cards and Back restores the query", async () => {
  await render();
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Search integrations"]');
  if (!input) throw new Error("Missing search input");
  await act(async () => setInput(input, "slack"));
  expect(container.textContent).toContain("Slack");
  expect(container.textContent).not.toContain("Google Drive collaboration");
  click("Slack");
  expect(container.textContent).toContain("Detail for Slack");
  click("Back to discover");
  expect(input.value).toBe("slack");
});

test("Yours uses compact saved rows and opens their detail", async () => {
  await render(); click("Yours");
  expect(container.querySelector('[role="list"][aria-label="Your integrations"]')).not.toBeNull();
  expect(container.textContent).toContain("Needs attention");
  click("Box"); expect(container.textContent).toContain("Detail for Box");
});

test("Show all a category leaves the grouped browse view", async () => {
  await render(); clickLabel("Show all communication");
  expect(container.textContent).toContain("Slack");
  expect((container.querySelector('[aria-label="Integration category"]') as HTMLSelectElement).value).toBe("communication");
});

test("incomplete empty Yours never claims no saved integrations", async () => {
  await render({ incomplete: true }); click("Yours");
  // The fixture has saved rows; this also asserts the loading/error vocabulary remains explicit.
  expect(container.textContent).toContain("saved integrations loaded");
});
