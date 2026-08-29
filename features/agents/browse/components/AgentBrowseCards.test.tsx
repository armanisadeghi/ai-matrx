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

jest.mock("@/components/official/item/ItemMenu", () => ({
  ItemMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
});
