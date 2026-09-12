#!/usr/bin/env npx tsx
/**
 * Generates the catalog for authored settings controls.
 *
 * The catalog deliberately reads only JSX labels, descriptions, section titles
 * and registry tab/component references. Dynamic labels and values are not a
 * reliable search contract, so they remain discoverable through their owning
 * tab instead of being guessed here.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { settingsControlSearchId } from "@/components/official/settings/searchIdentity";

const ROOT = process.cwd();
const REGISTRY = resolve(ROOT, "features/settings/registry.ts");
const OUTPUT = resolve(ROOT, "features/settings/static-control-index.ts");

export type ExtractedStaticControl = {
  tabId: string;
  label: string;
  description?: string;
  controlId: string;
};

function literalText(node: ts.JsxAttribute | undefined): string | undefined {
  if (!node?.initializer) return undefined;
  if (ts.isStringLiteral(node.initializer)) return node.initializer.text;
  if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
    const expression = node.initializer.expression;
    if (ts.isStringLiteralLike(expression)) return expression.text;
  }
  return undefined;
}

function attribute(opening: ts.JsxOpeningLikeElement, name: string) {
  return opening.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function tagName(node: ts.JsxOpeningLikeElement): string | undefined {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : undefined;
}

export { settingsControlSearchId };

function sourceFile(path: string): ts.SourceFile {
  const text = readFileSync(path, "utf8");
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function registryComponents(): Array<{ tabId: string; file: string }> {
  const source = sourceFile(REGISTRY);
  const imports = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const binding = statement.importClause?.name;
    if (!binding) continue;
    const modulePath = statement.moduleSpecifier.text;
    if (!modulePath.startsWith("./tabs/")) continue;
    imports.set(binding.text, resolve(dirname(REGISTRY), `${modulePath}.tsx`));
  }

  const found: Array<{ tabId: string; file: string }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "settingsRegistry" && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      for (const element of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        let tabId: string | undefined;
        let component: string | undefined;
        for (const property of element.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
          if (property.name.text === "id" && ts.isStringLiteralLike(property.initializer)) tabId = property.initializer.text;
          if (property.name.text === "component" && ts.isIdentifier(property.initializer)) component = property.initializer.text;
        }
        const file = component ? imports.get(component) : undefined;
        if (tabId && file) found.push({ tabId, file });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function controlsForTab(tabId: string, file: string): ExtractedStaticControl[] {
  const source = sourceFile(file);
  const controls: ExtractedStaticControl[] = [];
  const visit = (node: ts.Node, sectionTitle?: string) => {
    if (ts.isJsxElement(node)) {
      const name = tagName(node.openingElement);
      const title = name === "SettingsSection" ? literalText(attribute(node.openingElement, "title")) : undefined;
      // A runtime group (for example one section per notification event) has
      // no stable search identity. Do not borrow its parent's title and invent
      // anchors for the dynamic rows it contains.
      const childSectionTitle = name === "SettingsSection" ? title : sectionTitle;
      ts.forEachChild(node, (child) => visit(child, childSectionTitle));
      return;
    }
    if (ts.isJsxSelfClosingElement(node)) {
      const name = tagName(node);
      const label = name?.startsWith("Settings") ? literalText(attribute(node, "label")) : undefined;
      if (name && label && sectionTitle && name !== "SettingsSection") {
        const description = literalText(attribute(node, "description"));
        controls.push({
          tabId,
          label,
          ...(description ? { description } : {}),
          controlId: settingsControlSearchId(sectionTitle, label),
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, sectionTitle));
  };
  visit(source);
  return controls;
}

export function extractStaticControls(): ExtractedStaticControl[] {
  return registryComponents().flatMap(({ tabId, file }) => controlsForTab(tabId, file));
}

function outputSource(entries: ExtractedStaticControl[]): string {
  return `// Generated by scripts/generate-static-settings-control-index.ts. Do not edit.\n\nexport { settingsControlSearchId } from \"@/components/official/settings/searchIdentity\";\n\nexport type StaticSettingsControl = {\n  tabId: string;\n  label: string;\n  description?: string;\n  controlId: string;\n};\n\nexport const staticSettingsControlIndex = ${JSON.stringify(entries, null, 2)} satisfies readonly StaticSettingsControl[];\n`;
}

export function generateStaticSettingsControlIndex(check = false): ExtractedStaticControl[] {
  const entries = extractStaticControls();
  const rendered = outputSource(entries);
  if (check) {
    const current = readFileSync(OUTPUT, "utf8");
    if (current !== rendered) {
      throw new Error(`Static settings control index is stale. Run: pnpm tsx scripts/generate-static-settings-control-index.ts (${relative(ROOT, OUTPUT)})`);
    }
  } else {
    writeFileSync(OUTPUT, rendered);
    process.stdout.write(`Generated ${entries.length} static settings controls.\n`);
  }
  return entries;
}

// Keep imports pure: tests consume the extractor without rewriting the index.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  generateStaticSettingsControlIndex(process.argv.includes("--check"));
}
