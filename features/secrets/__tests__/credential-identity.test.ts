import {
  credentialIdentity,
  fieldLabelOf,
} from "@/features/secrets/credential-identity";
import type { VaultField, VaultItem } from "@/features/secrets/types";

const field: VaultField = {
  id: "field-1",
  credential_item_id: "item-1",
  field_key: "value",
  env_key: null,
  handling: "revealable",
  editable: true,
  inject_into_sandbox: false,
  value_hint: "ar••••••••••••••••om",
  value_version: 1,
  is_active: true,
  description: null,
  created_at: "2026-07-28T00:00:00Z",
  updated_at: "2026-07-28T00:00:00Z",
};

const item: VaultItem = {
  id: "item-1",
  display_name: "DataForSEO email",
  definition_key: "env_value",
  definition_version: 1,
  status: "active",
  source: "manual",
  access_mode: "all_members",
  user_id: "user-1",
  organization_id: null,
  provider_key: null,
  description: null,
  tags: [],
  lifecycle: {},
  login_urls: [],
  uri_match_mode: "host",
  notes: null,
  non_secret_fields: [],
  browser_fill_enabled: false,
  fields: [field],
  capabilities: {
    can_use: true,
    can_edit: true,
    can_reveal: true,
    can_manage: true,
  },
  created_at: "2026-07-28T00:00:00Z",
  updated_at: "2026-07-28T00:00:00Z",
};

describe("credential identity privacy contract", () => {
  test("never promotes a partial value hint into visible metadata", () => {
    expect(credentialIdentity(item, undefined).subtitle).toBeNull();
  });

  test("uses the catalog label, then a readable field-key fallback", () => {
    expect(fieldLabelOf(field, "Account email")).toBe("Account email");
    expect(fieldLabelOf({ ...field, field_key: "client_secret" }, null)).toBe(
      "Client Secret",
    );
  });
});
