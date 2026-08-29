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
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

jest.mock("@/components/official/item/ItemMenu", () => ({
  ItemMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { AgentBrowseRows } from "./AgentBrowseRows";

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

describe("AgentBrowseRows", () => {
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

  it("explains why a shared agent cannot be favorited", async () => {
    await act(async () =>
      root.render(
        <AgentBrowseRows
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

    expect(favoriteButton?.disabled).toBe(true);
    expect(favoriteButton?.title).toBe("Shared agents can't be favorited");
    expect(favoriteButton?.classList.contains("h-11")).toBe(true);
    expect(favoriteButton?.classList.contains("lg:h-6")).toBe(true);
    expect(favoriteButton?.classList.contains("sm:h-6")).toBe(false);

    const actionButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Actions for Shared Agent"]',
    );

    expect(actionButton?.classList.contains("h-11")).toBe(true);
    expect(actionButton?.classList.contains("lg:h-7")).toBe(true);
    expect(actionButton?.classList.contains("sm:h-7")).toBe(false);
  });
});
