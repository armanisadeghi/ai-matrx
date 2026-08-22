import { readFileSync } from "node:fs";
import { join } from "node:path";

const componentSource = [
  "SecretValue.tsx",
  "VaultHandlingControl.tsx",
  "VaultWorkspace.tsx",
  "VaultItemDetail.tsx",
  "VaultCreateDialog.tsx",
]
  .map((file) =>
    readFileSync(
      join(process.cwd(), "features/secrets/components", file),
      "utf8",
    ),
  )
  .join("\n");

describe("shared vault UI contract", () => {
  test("does not use visual truncation or collapsed-line utilities", () => {
    expect(componentSource).not.toMatch(
      /className=(?:"[^"]*|\{[^}]*)(?:\btruncate\b|\bline-clamp-\d+\b|\btext-ellipsis\b)/,
    );
  });

  test("does not render partial secret hints", () => {
    const valueSource = readFileSync(
      join(process.cwd(), "features/secrets/components/SecretValue.tsx"),
      "utf8",
    );

    expect(valueSource).not.toContain("value_hint");
    expect(valueSource).toContain('"Hidden"');
    expect(valueSource).toContain("Hides in {secondsLeft}s");
  });

  test("displays Standard values without a reveal interaction", () => {
    const valueSource = readFileSync(
      join(process.cwd(), "features/secrets/components/SecretValue.tsx"),
      "utf8",
    );

    expect(valueSource).toContain('field.handling !== "visible"');
    expect(valueSource).toContain('field.handling === "revealable"');
    expect(valueSource).toContain('aria-label="Loading value"');
  });

  test("offers one plain-language protection control everywhere fields are edited", () => {
    const handlingSource = readFileSync(
      join(
        process.cwd(),
        "features/secrets/components/VaultHandlingControl.tsx",
      ),
      "utf8",
    );

    expect(handlingSource).toContain("ToggleGroup");
    expect(handlingSource).toContain('label: "Standard"');
    expect(handlingSource).toContain('label: "Restricted"');
    expect(handlingSource).toContain('label: "Automation only"');
    expect(
      componentSource.match(/<VaultHandlingControl/g)?.length,
    ).toBeGreaterThan(3);
  });

  test("uses one credential edit entry instead of independent edit actions", () => {
    const detailSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultItemDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("Edit credential");
    expect(detailSource).not.toContain("Edit notes");
    expect(detailSource).not.toContain("Rename");
    expect(detailSource).not.toContain("Rotate");
    expect(detailSource).not.toContain("Field settings");
  });

  test("keeps the full vault in a labeled three-pane workspace", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultWorkspace.tsx"),
      "utf8",
    );
    const pageSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultPage.tsx"),
      "utf8",
    );

    expect(pageSource).toContain('presentation="full"');
    expect(workspaceSource).toContain(
      "lg:grid-cols-[14rem_20rem_minmax(0,1fr)]",
    );
    expect(workspaceSource).toContain("VaultWorkspaceListRow");
    expect(workspaceSource).toContain("VAULT_LABELS.credentialName");
    expect(workspaceSource).toContain("VAULT_LABELS.credentialType");
  });

  test("keeps the legacy settings URL on the canonical full Vault", () => {
    const settingsEntrySource = readFileSync(
      join(process.cwd(), "app/(transitional)/settings/secrets/page.tsx"),
      "utf8",
    );

    expect(settingsEntrySource).toContain('redirect("/vault")');
    expect(settingsEntrySource).not.toContain("VaultWorkspace");
  });

  test("starts creation with the basic purposes, including protected files", () => {
    const createSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultCreateDialog.tsx"),
      "utf8",
    );

    expect(createSource).toContain("What are you saving?");
    expect(createSource).toContain("WEBSITE_LOGIN_DEFINITION_KEY");
    expect(createSource).toContain('"api_key"');
    expect(createSource).toContain("ENV_VALUE_DEFINITION_KEY");
    expect(createSource).toContain("attachment_only");
    expect(createSource).toContain("Protected file");
    expect(createSource).toContain("Custom credential");
    expect(createSource).toContain("Browse all");
  });

  test("protected create fields opt out of password-manager overlays", () => {
    const createSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultCreateDialog.tsx"),
      "utf8",
    );

    expect(createSource).toContain('data-lpignore="true"');
    expect(createSource).toContain("data-1p-ignore");
    expect(createSource).toContain('data-bwignore="true"');
  });

  test("renders attachments as labeled files and never selects their ciphertext", () => {
    const detailSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultItemDetail.tsx"),
      "utf8",
    );
    const typesSource = readFileSync(
      join(process.cwd(), "features/secrets/types.ts"),
      "utf8",
    );

    expect(detailSource).toContain("Protected files");
    expect(detailSource).toContain("Type and size");
    expect(detailSource).toContain("Download protection");
    expect(typesSource).toContain("VAULT_ATTACHMENT_COLUMNS");
    expect(
      typesSource.match(/VAULT_ATTACHMENT_COLUMNS[\s\S]*?as const/)?.[0],
    ).not.toContain("value_encrypted");
  });

  test("makes each safe login destination an explicit door", () => {
    const detailSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultItemDetail.tsx"),
      "utf8",
    );

    expect(detailSource).toContain("safeVaultLoginUrl(url)");
    expect(detailSource).toContain("Open website");
    expect(detailSource).toContain('target="_blank"');
    expect(detailSource).toContain('rel="noopener noreferrer"');
    expect(detailSource).toContain("Invalid URL");
  });

  test("never presents rows loaded for a previous Vault scope", () => {
    const hooksSource = readFileSync(
      join(process.cwd(), "features/secrets/vault-hooks.ts"),
      "utf8",
    );

    expect(hooksSource).toContain("loadedScopeKey === scopeKey ? items : []");
    expect(hooksSource).toContain("requestId !== requestIdRef.current");
  });

  test("uses the canonical Vault form for authenticator login creation", () => {
    const workspaceSource = readFileSync(
      join(
        process.cwd(),
        "features/secrets/components/authenticator/AuthenticatorWorkspace.tsx",
      ),
      "utf8",
    );
    const createSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultCreateDialog.tsx"),
      "utf8",
    );

    expect(workspaceSource).toContain("<VaultCreateDialog");
    expect(workspaceSource).toContain(
      "initialDefinitionKey={WEBSITE_LOGIN_DEFINITION_KEY}",
    );
    expect(createSource).toContain("Authenticator setup key");
    expect(createSource).toContain("can leave this blank");
  });

  test("supports partial login saves and first-class protected additions", () => {
    const createSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultCreateDialog.tsx"),
      "utf8",
    );
    const detailSource = readFileSync(
      join(process.cwd(), "features/secrets/components/VaultItemDetail.tsx"),
      "utf8",
    );

    expect(createSource).toContain("!isWebsiteLogin");
    expect(createSource).toContain('field_key: "recovery_codes"');
    expect(createSource).toContain('field_key: "secure_notes"');
    expect(createSource).toContain("supplementalAttachments");
    expect(detailSource).toContain("Mark used");
    expect(detailSource).toContain("Replace all recovery codes");
  });

  test("keeps mobile credential dialogs scrollable without iOS input zoom", () => {
    const credenzaSource = readFileSync(
      join(process.cwd(), "components/ui/credenza-modal/credenza.tsx"),
      "utf8",
    );

    expect(credenzaSource).toContain("h-[92dvh]");
    expect(credenzaSource).toContain("overflow-hidden");
    expect(credenzaSource).toContain("flex-1 overflow-y-auto");
    expect(credenzaSource).toContain("[&_input]:text-base");
    expect(credenzaSource).toContain("[&_textarea]:text-base");
  });

  test("offers authenticator rename without leaving the manage surface", () => {
    const workspaceSource = readFileSync(
      join(
        process.cwd(),
        "features/secrets/components/authenticator/AuthenticatorWorkspace.tsx",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("Rename login");
    expect(workspaceSource).toContain("<TextInputDialog");
    expect(workspaceSource).toContain("actions.rename");
  });
});
