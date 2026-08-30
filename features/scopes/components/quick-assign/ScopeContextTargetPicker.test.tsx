import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ScopeContextTargetPicker } from "./ScopeContextTargetPicker";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockDispatch = jest.fn();
const mockSelectHandlers: Array<(value: string) => void> = [];
const mockOrganizations = [
  {
    id: "org-1",
    name: "Acme",
    abbreviation: "AC",
    slug: "acme",
    is_personal: false,
    role: "owner",
    scope_types: [],
    projects: [],
  },
];
const mockScopeTypes = [
  {
    id: "type-1",
    organization_id: "org-1",
    label_singular: "Client",
    label_plural: "Clients",
    icon: "Building2",
    color: "blue",
    max_assignments_per_entity: null,
    sort_order: 0,
    parent_type_id: null,
    default_variable_keys: [],
    scopes: [],
  },
];
const mockScopes = [
  {
    id: "scope-1",
    scope_type_id: "type-1",
    organization_id: "org-1",
    name: "Northwind",
    description: "",
    parent_scope_id: null,
    settings: {},
  },
];
const mockItems = [
  {
    id: "item-1",
    slug: "case-notes",
    display_name: "Case notes",
    value_type: "string",
  },
];

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange: (value: string) => void;
  }) => {
    mockSelectHandlers.push(onValueChange);
    return <div>{children}</div>;
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@/components/official/entity-ref/EntityDoorControls", () => ({
  ENTITY_DOOR_CONTROL_CLASS: "door-control",
  EntityDoorControls: ({
    token,
    name,
    href,
  }: {
    token: string;
    name: string;
    href: string;
  }) => (
    <a data-token={token} data-tap-target href={href}>
      Open {name}
    </a>
  ),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => "org-1",
}));

jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizationsList: () => mockOrganizations,
  makeSelectScopeTypesForOrg: () => () => mockScopeTypes,
  makeSelectScopesForType: () => () => mockScopes,
}));

jest.mock("@/features/scopes/redux/selectors/context-items", () => ({
  makeSelectItemsForType: () => () => mockItems,
  makeSelectItemsStatusForType: () => () => "ready",
}));

jest.mock("@/features/scopes/redux/thunks/ensureScopeTree", () => ({
  ensureScopeTree: () => ({ type: "scopes/ensure-tree" }),
}));

jest.mock("@/features/scopes/redux/thunks/ensureScopeTypeItems", () => ({
  ensureScopeTypeItems: (scopeTypeId: string) => ({
    type: "scopes/ensure-items",
    payload: scopeTypeId,
  }),
}));

describe("ScopeContextTargetPicker owner doors", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectHandlers.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens every selected record and every canonical creation surface", async () => {
    await act(async () => {
      root.render(
        <ScopeContextTargetPicker
          value={{
            orgId: "org-1",
            scopeTypeId: "type-1",
            scopeId: "scope-1",
            contextItemId: "item-1",
          }}
          onChange={jest.fn()}
        />,
      );
    });

    const touchTargetScope = container.querySelector(".matrx-touch-targets");
    expect(touchTargetScope).not.toBeNull();

    expect(
      container
        .querySelector('[data-token="organization"]')
        ?.getAttribute("href"),
    ).toBe("/organizations/acme");
    expect(
      container
        .querySelector('[data-token="scope_type"]')
        ?.getAttribute("href"),
    ).toBe("/organizations/acme/scopes/type-1");
    expect(
      container.querySelector('[data-token="scope"]')?.getAttribute("href"),
    ).toBe("/organizations/acme/scopes/type-1/scope-1");
    expect(
      container
        .querySelector('[data-token="context_item"]')
        ?.getAttribute("href"),
    ).toBe("/organizations/acme/scopes/type-1/context-items/case-notes");
    expect(
      touchTargetScope?.querySelectorAll("a[data-tap-target]"),
    ).toHaveLength(8);

    for (const [label, href] of [
      ["Create or manage organizations", "/organizations"],
      ["Create or manage scope types in Acme", "/organizations/acme/scopes"],
      ["Create or manage clients", "/organizations/acme/scopes/type-1"],
      [
        "Create or manage context items for Clients",
        "/organizations/acme/scopes/type-1/context-items",
      ],
    ]) {
      const creationDoor = container.querySelector(`[aria-label="${label}"]`);
      expect(creationDoor?.getAttribute("href")).toBe(href);
      expect(creationDoor?.hasAttribute("data-tap-target")).toBe(true);
      expect(touchTargetScope?.contains(creationDoor)).toBe(true);
    }
  });

  it("preserves the cascade reset rules while doors stay out of the write path", async () => {
    const onChange = jest.fn();
    await act(async () => {
      root.render(
        <ScopeContextTargetPicker
          value={{
            orgId: "org-1",
            scopeTypeId: "type-1",
            scopeId: "scope-1",
            contextItemId: "item-1",
          }}
          onChange={onChange}
        />,
      );
    });

    expect(mockSelectHandlers).toHaveLength(4);

    act(() => mockSelectHandlers[0]?.("org-2"));
    expect(onChange).toHaveBeenLastCalledWith({
      orgId: "org-2",
      scopeTypeId: "",
      scopeId: "",
      contextItemId: "",
      item: undefined,
    });

    act(() => mockSelectHandlers[1]?.("type-2"));
    expect(onChange).toHaveBeenLastCalledWith({
      orgId: "org-1",
      scopeTypeId: "type-2",
      scopeId: "",
      contextItemId: "",
      item: undefined,
    });

    act(() => mockSelectHandlers[2]?.("scope-2"));
    expect(onChange).toHaveBeenLastCalledWith({
      orgId: "org-1",
      scopeTypeId: "type-1",
      scopeId: "scope-2",
      contextItemId: "",
      item: undefined,
    });

    act(() => mockSelectHandlers[3]?.("item-1"));
    expect(onChange).toHaveBeenLastCalledWith({
      orgId: "org-1",
      scopeTypeId: "type-1",
      scopeId: "scope-1",
      contextItemId: "item-1",
      item: mockItems[0],
    });
  });
});
