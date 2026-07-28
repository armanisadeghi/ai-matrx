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
});
