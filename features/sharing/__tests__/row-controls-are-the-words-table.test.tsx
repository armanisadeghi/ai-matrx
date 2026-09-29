/**
 * 🚨 THE SHARE DIALOG'S ROW CONTROLS ARE EXACTLY THE WORDS TABLE (access ladder T-13 phase 5,
 * common-docs/policies/access-ladder.md): "Shown to" and "Published to the web" on an Organization
 * or Public record; NEITHER on a Private, Confidential or child record — absent, never dead.
 * RED before: the dialog drew a three-state Only me / My organization / Anyone picker over the
 * retiring row column on every type, an AI chat included.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let caps: Record<string, unknown> = {};
jest.mock("@/utils/permissions/shareLinks", () => ({
  getShareCapabilities: async () => caps,
}));
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/features/sharing/indexed/SearchEngineIndexedSwitch", () => ({
  SearchEngineIndexedSwitch: () => <span data-indexed-switch />,
}));

import { RowControls } from "@/features/sharing/components/RowControls";

const ORG_CAPS = {
  isLinkShareable: true,
  rowControls: true,
  shownToOffered: true,
  publishLane: "published_to_web",
  tableLevel: "organization",
};
const PRIVATE_CAPS = {
  isLinkShareable: true,
  rowControls: false,
  shownToOffered: false,
  publishLane: null,
  tableLevel: "private",
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const noop = async () => ({ success: true });

async function draw(shownTo: "only_me" | "everyone" | null | undefined, isPublic: boolean, canChange = true) {
  await act(async () => {
    root.render(
      <RowControls
        resourceType={"note" as never}
        resourceId="6a1d0c2b-3e4f-4a5b-9c6d-7e8f9a0b1c2d"
        canChange={canChange}
        shownTo={shownTo}
        isPublic={isPublic}
        onSetShownTo={noop}
        onPublish={noop}
        onStopPublishing={noop}
      />,
    );
  });
}

describe("the row controls are the Words table's, and only where they mean something", () => {
  it("an Organization record: Shown to (three choices while unpublished) and Published to the web", async () => {
    caps = ORG_CAPS;
    await draw("only_me", false);
    const section = host.querySelector("[data-row-controls]");
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain("Shown to");
    expect(section!.textContent).toContain("Published to the web");
    const choices = [...section!.querySelectorAll('[aria-label="Shown to"] button')].map((b) => b.textContent);
    expect(choices).toEqual(["Only me", "My team", "Everyone"]);
    expect(section!.textContent).not.toMatch(/My organization|Only people I share it with/);
  });

  it("Everyone on AI Matrx is offered once the record is published to the web", async () => {
    caps = ORG_CAPS;
    await draw("everyone", true);
    const choices = [...host.querySelectorAll('[aria-label="Shown to"] button')].map((b) => b.textContent);
    expect(choices).toContain("Everyone on AI Matrx");
  });

  it("a Private AI chat draws nothing — no Shown to, no Publish", async () => {
    caps = PRIVATE_CAPS;
    await draw(undefined, false);
    expect(host.querySelector("[data-row-controls]")).toBeNull();
    expect(host.textContent).toBe("");
  });

  it("a child record (a file attached to a chat) draws nothing, whatever its type", async () => {
    caps = ORG_CAPS;
    await act(async () => {
      root.render(
        <RowControls
          resourceType={"file" as never}
          resourceId="6a1d0c2b-3e4f-4a5b-9c6d-7e8f9a0b1c2d"
          canChange
          shownTo={undefined}
          isPublic={false}
          childRecord
          onSetShownTo={noop}
          onPublish={noop}
          onStopPublishing={noop}
        />,
      );
    });
    expect(host.querySelector("[data-row-controls]")).toBeNull();
  });

  it("someone who cannot change sharing reads the state as text, never buttons", async () => {
    caps = ORG_CAPS;
    await draw("everyone", false, false);
    expect(host.querySelector('[aria-label="Shown to"]')).toBeNull();
    expect(host.querySelector('[role="switch"]')).toBeNull();
    expect(host.textContent).toContain("Everyone");
    expect(host.textContent).toContain("Off");
  });
});
