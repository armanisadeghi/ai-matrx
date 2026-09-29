/**
 * @jest-environment jsdom
 *
 * React #418 on the meeting pages (verifier, 2026-09-29): the server rendered
 * the zone label in ITS zone, the browser hydrated in the person's. The hook
 * must hydrate without a mismatch and then show the person's zone; the old
 * pattern (`useState(browserTimeZone)`) is kept here as the control that
 * proves this test can fail.
 */
import React, { act, useState } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { useViewerTimeZone } from "../useViewerTimeZone";
import { browserTimeZone } from "@/features/meet/lib/zoned-time";

function WithHook() {
  return <span>{useViewerTimeZone()}</span>;
}

function WithStateInitializer() {
  const [zone] = useState(browserTimeZone);
  return <span>{zone}</span>;
}

function zoneAs(zone: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  return jest
    .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
    .mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone: zone };
    });
}

async function hydrate(Component: () => React.ReactElement) {
  // The "server" renders in its own zone; the "browser" hydrates in the person's.
  let spy = zoneAs("America/Los_Angeles");
  const html = renderToString(<Component />);
  spy.mockRestore();
  spy = zoneAs("America/New_York");
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const errors: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, <Component />, { onRecoverableError: (e) => errors.push(e) });
  });
  const text = container.textContent;
  spy.mockRestore();
  container.remove();
  return { html, errors, text };
}

describe("useViewerTimeZone", () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("hydrates without a mismatch, then shows the person's zone", async () => {
    const { html, errors, text } = await hydrate(WithHook);
    expect(html).toContain("UTC");
    expect(errors).toHaveLength(0);
    expect(text).toBe("America/New_York");
  });

  it("control: reading the zone in a state initializer mismatches", async () => {
    const { errors } = await hydrate(WithStateInitializer);
    expect(errors.length).toBeGreaterThan(0);
  });
});
