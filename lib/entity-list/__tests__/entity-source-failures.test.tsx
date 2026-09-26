/**
 * @jest-environment jsdom
 */
/**
 * A list whose side reads failed says so in plain words with a Try again —
 * never the raw database string. On 2026-09-26 the admin mandate list printed
 * "Sources unavailable: readAllRows(mandate.v_reference_latest): query failed —
 * canceling statement due to statement timeout".
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EntitySourceFailures } from "@/lib/entity-list/components/EntitySourceFailures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RAW =
  "readAllRows(mandate.v_reference_latest): query failed — canceling statement due to statement timeout";

it("prints plain words and a working Try again, never the raw string", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const retry = jest.fn();
  await act(async () => {
    root.render(
      <EntitySourceFailures
        operation="Load the list"
        failures={[{ label: "Where each mandate is declared and called", error: RAW }]}
        onRetry={retry}
      />,
    );
  });
  const text = host.textContent ?? "";
  expect(text).toContain("Where each mandate is declared and called took too long to answer.");
  expect(text).not.toContain("readAllRows");
  expect(text).not.toContain("canceling statement");
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Try again"));
  expect(button).toBeDefined();
  await act(async () => button!.click());
  expect(retry).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});

it("renders nothing when every source answered", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(<EntitySourceFailures operation="Load the list" failures={[]} />);
  });
  expect(host.textContent).toBe("");
  await act(async () => root.unmount());
});
