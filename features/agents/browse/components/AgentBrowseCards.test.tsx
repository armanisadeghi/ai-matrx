/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AgentBrowseRow } from "../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@ai-matrx/design-system/item", () => ({
  ...jest.requireActual("@ai-matrx/design-system/item"),
  ItemMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@ai-matrx/chat/agents/components/identity-refs/AiIdentityRef", () => ({
  AiModelRef: ({
    modelId,
    showClass,
    offeringId,
  }: {
    modelId: string;
    showClass?: boolean;
    offeringId?: string | null;
  }) => (
    <span
      data-model-ref={modelId}
      data-show-class={String(Boolean(showClass))}
      data-offering={offeringId ?? ""}
    />
  ),
}));

import { AgentBrowseCards } from "./AgentBrowseCards";

const sharedAgent: AgentBrowseRow = {
  access_level: "shared",
  agent_type: "standard",
  category: "General",
  created_at: "2026-08-29T00:00:00.000Z",
  created_by: "user-id",
  description: "Shared test agent",
  id: "shared-agent",
  is_active: true,
  is_archived: false,
  is_favorite: false,
  is_owner: false,
  model_id: "model-id",
  name: "Shared Agent",
  // No class pin: the database answers null (the generator types it string).
  custom_fields: {},
  offering_id: null as unknown as string,
  run_count: 0,
  success_count: 0,
  failure_count: 0,
  last_used_at: null as unknown as string,
  total_cost: 0,
  organization_id: "organization-id",
  organization_name: "Test Organization",
  owner_email: "owner@example.com",
  source_agent_id: "source-agent-id",
  tags: [],
  task_id: "task-id",
  total_count: 1,
  updated_at: "2026-08-29T00:00:00.000Z",
  version: 1,
  visibility: "shared",
  // Never run: the usage rollup answers zeros and a null last-used time.
  run_count: 0,
  success_count: 0,
  failure_count: 0,
  last_used_at: null as unknown as string,
  total_cost: 0,
};

describe("AgentBrowseCards", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps card actions touch-sized through tablet widths", async () => {
    await act(async () =>
      root.render(
        <AgentBrowseCards
          rows={[sharedAgent]}
          density="comfortable"
          showOwner
          menuFor={() => () => ({ sections: [] })}
          onOpenActionModal={jest.fn()}
          onToggleFavorite={jest.fn()}
          hrefFor={() => "/agents/shared-agent"}
        />,
      ),
    );

    const favoriteButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Add to favorites"]',
    );
    const actionButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Actions for Shared Agent"]',
    );

    for (const control of [favoriteButton, actionButton]) {
      expect(control?.classList.contains("h-11")).toBe(true);
      expect(control?.classList.contains("w-11")).toBe(true);
      expect(control?.classList.contains("lg:h-7")).toBe(true);
      expect(control?.classList.contains("lg:w-7")).toBe(true);
      expect(control?.classList.contains("sm:h-7")).toBe(false);
      expect(control?.classList.contains("sm:w-7")).toBe(false);
    }

    for (const label of ["Run", "Edit", "View"]) {
      const control = Array.from(container.querySelectorAll("a")).find(
        (link) => link.textContent?.trim() === label,
      );
      expect(control?.classList.contains("h-11")).toBe(true);
      expect(control?.classList.contains("lg:h-7")).toBe(true);
      expect(control?.classList.contains("sm:h-7")).toBe(false);
    }
  });

  it.each([
    // [row's offering_id, names the class?, pin handed to the model door]
    ["29874e67-5683-40c2-9adb-fb797ea9a176", "true", "29874e67-5683-40c2-9adb-fb797ea9a176"],
    [null, "true", ""],
  ])(
    "a card names the model with its class (offering_id %p)",
    async (offeringId, showClass, pin) => {
      const row = { ...sharedAgent, offering_id: offeringId } as AgentBrowseRow;
      await act(async () =>
        root.render(
          <AgentBrowseCards
            rows={[row]}
            density="comfortable"
            showOwner
            menuFor={() => () => ({ sections: [] })}
            onOpenActionModal={jest.fn()}
            onToggleFavorite={jest.fn()}
            hrefFor={() => "/agents/shared-agent"}
          />,
        ),
      );
      const ref = container.querySelector("[data-model-ref]");
      expect(ref?.getAttribute("data-model-ref")).toBe("model-id");
      expect(ref?.getAttribute("data-show-class")).toBe(showClass);
      expect(ref?.getAttribute("data-offering")).toBe(pin);
    },
  );
});
