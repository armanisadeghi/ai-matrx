import { filterAndSortVaultItems } from "../vault-list";
import type { VaultListSort } from "../vault-list";
import { normalizeWireItem } from "../types";
import type { CredentialDefinition, VaultItem } from "../types";

function item(
  id: string,
  displayName: string,
  createdAt = "2026-09-01T00:00:00.000Z",
): VaultItem {
  return normalizeWireItem({
    id,
    display_name: displayName,
    definition_key: "website_login",
    definition_version: 1,
    status: "active",
    source: "manual",
    access_mode: "private",
    user_id: "user-1",
    organization_id: null,
    provider_key: "provider-key",
    description: "Public description",
    tags: ["public-tag"],
    lifecycle: { hidden: "lifecycle-secret" },
    login_urls: ["https://example.com/login"],
    uri_match_mode: "domain",
    notes: "notes-secret",
    non_secret_fields: [{ key: "private_key", label: "Private", value: "private-value" }],
    browser_fill_enabled: true,
    fields: [{
      id: `${id}-field`, credential_item_id: id, field_key: "username", key: "USER_NAME", env_key: "USER_NAME",
      handling: "revealable", editable: true, inject_into_sandbox: false, value_hint: "hint-secret",
      value_version: 1, is_active: true, description: "field-secret", created_at: createdAt,
      updated_at: createdAt, execution_purpose: undefined,
    }],
    attachments: [],
    created_at: createdAt,
    updated_at: createdAt,
  });
}

const definitions: CredentialDefinition[] = [{
  key: "website_login",
  payload: { label: "Catalog label", family: "identity_security", fields: [] },
}];

function list(items: VaultItem[], query = "", sort: VaultListSort = "newest") {
  return filterAndSortVaultItems({ items, definitions, family: "all", query, sort });
}

describe("filterAndSortVaultItems", () => {
  it("searches only the approved projected metadata", () => {
    const credential = item("b", "Visible credential");
    for (const allowedText of [
      "visible credential", "public description", "website_login", "provider-key",
      "catalog label", "example.com/login", "public-tag", "username", "USER_NAME",
    ]) {
      expect(list([credential], allowedText)).toEqual([credential]);
    }
    Reflect.set(credential.attachments, "metadata", "attachment-secret");
    Reflect.set(credential.fields[0], "polluted", "field-polluted-secret");
    Reflect.set(definitions[0].payload, "polluted", "definition-polluted-secret");
    Reflect.set(credential, "polluted", "item-polluted-secret");
    for (const secretLikeText of [
      "notes-secret", "lifecycle-secret", "private-value", "hint-secret", "field-secret",
      "attachment-secret", "field-polluted-secret", "definition-polluted-secret", "item-polluted-secret",
    ]) {
      expect(list([credential], secretLikeText)).toEqual([]);
    }
  });

  it("orders independently of transport order and leaves inputs intact", () => {
    const late = item("z", "Zebra", "2026-09-02T00:00:00.000Z");
    const early = item("a", "alpha", "2026-09-01T00:00:00.000Z");
    const invalid = item("b", "Alpha 2", "invalid-date");
    const source = [invalid, early, late];
    expect(list(source).map((value) => value.id)).toEqual(["z", "a", "b"]);
    expect(list(source, "", "name-asc").map((value) => value.id)).toEqual(["a", "b", "z"]);
    expect(list(source, "", "name-desc").map((value) => value.id)).toEqual(["z", "b", "a"]);
    expect(source.map((value) => value.id)).toEqual(["b", "a", "z"]);
  });

  it("uses updated time, raw ID ties, and invalid-or-missing dates last", () => {
    const old = item("z", "same", "2026-09-01T00:00:00.000Z");
    const newItem = item("a", "same", "2026-09-02T00:00:00.000Z");
    const invalid = item("b", "same", "invalid-date");
    const missing = item("c", "same");
    Reflect.set(missing, "updated_at", null);
    Reflect.set(newItem, "updated_at", "2026-09-03T00:00:00.000Z");
    Reflect.set(old, "updated_at", "2026-09-02T00:00:00.000Z");
    expect(list([invalid, old, missing, newItem], "", "recently-updated").map((value) => value.id))
      .toEqual(["a", "z", "b", "c"]);
    expect(list([old, newItem], "", "name-asc").map((value) => value.id)).toEqual(["a", "z"]);
    expect(list([old, newItem], "", "name-desc").map((value) => value.id)).toEqual(["a", "z"]);
  });
});
