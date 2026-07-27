import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { ContextItemRow, OrgNode } from "@/features/scopes/types";
import {
  attachedScopeContextItemRef,
  buildScopeContextItemAttachment,
} from "../scopeContextItemAttachment";

const organizations = [
  {
    id: "org-1",
    name: "Titanium",
    abbreviation: "TI",
    slug: "titanium",
    is_personal: false,
    role: "owner",
    projects: [],
    scope_types: [
      {
        id: "type-1",
        organization_id: "org-1",
        label_singular: "Client",
        label_plural: "Clients",
        icon: "building",
        color: "green",
        max_assignments_per_entity: null,
        sort_order: 0,
        parent_type_id: null,
        default_variable_keys: [],
        scopes: [
          {
            id: "scope-1",
            scope_type_id: "type-1",
            organization_id: "org-1",
            name: "All Green",
            description: "",
            parent_scope_id: null,
            settings: {},
          },
        ],
      },
    ],
  },
] satisfies OrgNode[];

const item = {
  id: "item-1",
  key: "general_brand_profile",
  display_name: "General Brand Profile",
} as ContextItemRow;

it("builds a lazy pointer for the exact selected scope cell", () => {
  const attachment = buildScopeContextItemAttachment(
    "scope-1::item-1",
    organizations,
    { "type-1": [item] },
  );

  expect(attachment).not.toBeNull();
  expect(attachment?.label).toBe("All Green — General Brand Profile");
  expect(attachment?.value.content).toBeNull();
  expect(attachment?.value.source).toEqual(
    expect.objectContaining({
      kind: "ctx_item",
      id: "item-1",
      scope_id: "scope-1",
      scope_type_id: "type-1",
      item_key: "general_brand_profile",
    }),
  );
});

it("round-trips a persisted pointer back into the checked cell", () => {
  const attachment = buildScopeContextItemAttachment(
    "scope-1::item-1",
    organizations,
    { "type-1": [item] },
  );
  const entry = {
    key: attachment?.key,
    label: attachment?.label,
    value: attachment?.value,
    type: "text",
    slotMatched: false,
  } as InstanceContextEntry;

  expect(attachedScopeContextItemRef(entry)).toBe("scope-1::item-1");
});

it("does not confuse an agent-authored ctx_item slot with an explicit attachment", () => {
  const entry = {
    key: "brand_profile_slot",
    label: "Brand profile",
    type: "text",
    slotMatched: true,
    value: {
      content: null,
      source: { kind: "ctx_item", id: "item-1", scope_id: "scope-1" },
    },
  } as InstanceContextEntry;

  expect(attachedScopeContextItemRef(entry)).toBeNull();
});
