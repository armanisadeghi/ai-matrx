import { readFileSync } from "node:fs";
import { join } from "node:path";

const componentSource = [
  "SecretValue.tsx",
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
      "lg:grid-cols-[13rem_21rem_minmax(0,1fr)]",
    );
    expect(workspaceSource).toContain("VaultWorkspaceListRow");
    expect(workspaceSource).toContain("VAULT_LABELS.credentialName");
    expect(workspaceSource).toContain("VAULT_LABELS.credentialType");
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
    expect(detailSource).toContain("Who can download it");
    expect(typesSource).toContain("VAULT_ATTACHMENT_COLUMNS");
    expect(
      typesSource.match(/VAULT_ATTACHMENT_COLUMNS[\s\S]*?as const/)?.[0],
    ).not.toContain("value_encrypted");
  });
});
