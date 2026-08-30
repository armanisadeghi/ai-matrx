#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import ts from "typescript";

export type P3HoverClassification =
  "actionable" | "decoration" | "review" | "safe";

export interface P3HoverFinding {
  classification: P3HoverClassification;
  column: number;
  file: string;
  line: number;
  rank: number;
  reason: string;
  tag: string;
  tokens: string[];
}

export interface P3HoverScan {
  actionable: P3HoverFinding[];
  decoration: P3HoverFinding[];
  review: P3HoverFinding[];
  safe: P3HoverFinding[];
}

const INTERACTIVE_INTRINSICS = new Set([
  "a",
  "button",
  "details",
  "input",
  "option",
  "select",
  "summary",
  "textarea",
]);
const INTERACTIVE_ROLE = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "option",
  "radio",
  "slider",
  "switch",
  "tab",
  "treeitem",
]);
const EVENT_ATTRIBUTES = new Set([
  "onClick",
  "onDoubleClick",
  "onKeyDown",
  "onKeyUp",
  "onPointerDown",
  "onPointerUp",
  "onTouchEnd",
  "onTouchStart",
]);
const RESPONSIVE_PREFIX = /^(?:sm|md|lg|xl|2xl|min-\[[^\]]+\]):/;
const HOVER_REVEAL =
  /(?:^|:)(?:group-hover|peer-hover|hover)(?:\/[^:]+)?:opacity-(?:100|\[1\])$/;
const HIDDEN_OPACITY = /(?:^|:)opacity-(?:0|\[0\])$/;
const VISIBLE_OPACITY = /(?:^|:)opacity-(?:100|\[1\])$/;

interface InteractionEvidence {
  direct: boolean;
  description: string;
  score: number;
}

function jsxTagName(name: ts.JsxTagNameExpression): string {
  return name.getText();
}

function attributeName(attribute: ts.JsxAttributeLike): string | undefined {
  return ts.isJsxAttribute(attribute) ? attribute.name.getText() : undefined;
}

function staticAttributeValue(attribute: ts.JsxAttribute): string | undefined {
  if (!attribute.initializer) return "";
  if (ts.isStringLiteral(attribute.initializer))
    return attribute.initializer.text;
  if (!ts.isJsxExpression(attribute.initializer)) return undefined;
  const expression = attribute.initializer.expression;
  if (!expression) return "";
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  return undefined;
}

function collectStaticStrings(
  node: ts.Node | undefined,
  output: string[],
): void {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    output.push(node.text);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    output.push(node.head.text);
    for (const span of node.templateSpans) output.push(span.literal.text);
    for (const span of node.templateSpans)
      collectStaticStrings(span.expression, output);
    return;
  }
  ts.forEachChild(node, (child) => collectStaticStrings(child, output));
}

function classTokens(opening: ts.JsxOpeningLikeElement): string[] {
  const classAttribute = opening.attributes.properties.find(
    (attribute) => attributeName(attribute) === "className",
  );
  if (!classAttribute || !ts.isJsxAttribute(classAttribute)) return [];
  const values: string[] = [];
  if (classAttribute.initializer) {
    if (ts.isStringLiteral(classAttribute.initializer)) {
      values.push(classAttribute.initializer.text);
    } else if (ts.isJsxExpression(classAttribute.initializer)) {
      collectStaticStrings(classAttribute.initializer.expression, values);
    }
  }
  return [
    ...new Set(values.flatMap((value) => value.split(/\s+/)).filter(Boolean)),
  ];
}

function openingAttributes(
  opening: ts.JsxOpeningLikeElement,
): ts.JsxAttribute[] {
  return opening.attributes.properties.filter(ts.isJsxAttribute);
}

function interactiveOpening(
  opening: ts.JsxOpeningLikeElement,
): Omit<InteractionEvidence, "direct"> | undefined {
  const tag = jsxTagName(opening.tagName);
  const bareTag = tag.split(".").at(-1) ?? tag;
  for (const attribute of openingAttributes(opening)) {
    const name = attribute.name.getText();
    if (EVENT_ATTRIBUTES.has(name)) return { description: name, score: 140 };
    if (name === "role") {
      const value = staticAttributeValue(attribute);
      if (value && INTERACTIVE_ROLE.has(value)) {
        return { description: `role=${value}`, score: 135 };
      }
    }
  }
  if (INTERACTIVE_INTRINSICS.has(tag)) {
    return { description: `<${tag}>`, score: 130 };
  }
  if (
    /(?:Button|Link|Trigger|MenuItem|Checkbox|Switch|Select|Combobox|Radio|Slider|Tab)$/.test(
      bareTag,
    )
  ) {
    return { description: `<${tag}>`, score: 125 };
  }
  if (
    tag.includes(".") &&
    /(?:Action|Anchor|Close|Item|Trigger)$/.test(bareTag)
  ) {
    return { description: `<${tag}>`, score: 125 };
  }
  return undefined;
}

function interactionEvidence(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
): InteractionEvidence | undefined {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const direct = interactiveOpening(opening);
  if (direct) return { direct: true, ...direct };
  if (!ts.isJsxElement(node)) return undefined;
  let descendant: Omit<InteractionEvidence, "direct"> | undefined;
  const visit = (candidate: ts.Node): void => {
    if (descendant) return;
    if (
      ts.isJsxOpeningElement(candidate) ||
      ts.isJsxSelfClosingElement(candidate)
    ) {
      const evidence = interactiveOpening(candidate);
      if (evidence) {
        descendant = evidence;
        return;
      }
    }
    ts.forEachChild(candidate, visit);
  };
  for (const child of node.children) visit(child);
  return descendant
    ? {
        direct: false,
        description: descendant.description,
        score: Math.max(105, descendant.score - 15),
      }
    : undefined;
}

function importedIconNames(sourceFile: ts.SourceFile): Set<string> {
  const icons = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (
      !/(?:lucide-react|react-icons|heroicons)/.test(
        statement.moduleSpecifier.text,
      )
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) icons.add(element.name.text);
    }
  }
  return icons;
}

function isDecorativeSubtree(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  iconNames: Set<string>,
): boolean {
  let ambiguousComponent = false;
  const visit = (candidate: ts.Node): void => {
    if (ambiguousComponent) return;
    if (
      ts.isJsxOpeningElement(candidate) ||
      ts.isJsxSelfClosingElement(candidate)
    ) {
      const tag = jsxTagName(candidate.tagName);
      const first = tag.split(".")[0];
      if (
        /^[A-Z]/.test(first) &&
        !iconNames.has(first) &&
        !/(?:Icon|Glyph|Logo)$/.test(first)
      ) {
        ambiguousComponent = true;
        return;
      }
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return !ambiguousComponent;
}

function hasHoverCapableMediaPrefix(token: string): boolean {
  return /(?:hover:hover|any-hover:hover)/.test(token);
}

function hasTouchVisibleToken(tokens: string[]): boolean {
  return tokens.some(
    (token) =>
      VISIBLE_OPACITY.test(token) &&
      /(?:hover:none|any-hover:none|pointer:coarse|any-pointer:coarse|coarse)/.test(
        token,
      ),
  );
}

function hasFocusReveal(
  tokens: string[],
  interaction: InteractionEvidence | undefined,
): boolean {
  const structuralFocus = tokens.some(
    (token) =>
      VISIBLE_OPACITY.test(token) &&
      /(?:focus-within|group-focus|peer-focus)/.test(token),
  );
  if (structuralFocus) return true;
  return Boolean(
    interaction?.direct &&
    tokens.some(
      (token) =>
        VISIBLE_OPACITY.test(token) &&
        /(?:^|:)focus(?:-visible)?:opacity-/.test(token),
    ),
  );
}

function safeReason(
  tokens: string[],
  hidden: string[],
  interaction: InteractionEvidence | undefined,
): string | undefined {
  if (hidden.every(hasHoverCapableMediaPrefix)) {
    return "hidden state is gated to hover-capable media";
  }
  if (hasTouchVisibleToken(tokens)) {
    return "coarse-pointer or hover-none visibility fallback is explicit";
  }
  if (hasFocusReveal(tokens, interaction)) {
    return "focus-visible/focus-within reveal accompanies hover reveal";
  }
  const hasBaseVisible = tokens.some(
    (token) => VISIBLE_OPACITY.test(token) && !token.includes(":"),
  );
  if (
    hidden.every((token) => RESPONSIVE_PREFIX.test(token)) ||
    (hasBaseVisible && hidden.every((token) => RESPONSIVE_PREFIX.test(token)))
  ) {
    return "opacity hiding begins at a responsive breakpoint, leaving mobile visible";
  }
  return undefined;
}

function findingSort(a: P3HoverFinding, b: P3HoverFinding): number {
  return (
    b.rank - a.rank ||
    a.file.localeCompare(b.file) ||
    a.line - b.line ||
    a.column - b.column ||
    a.tag.localeCompare(b.tag)
  );
}

function pathRankAdjustment(file: string): number {
  if (/(?:^|\/)app\/(?:[^/]+\/)*\(dev\)(?:\/|$)/.test(file)) return -20;
  if (/(?:^|\/)(?:official-candidate|demos)(?:\/|$)/.test(file)) return -15;
  if (file.startsWith("components/")) return 5;
  if (file.startsWith("app/(admin)/")) return 3;
  return 0;
}

export function analyzeP3HoverSource(
  sourceText: string,
  file = "fixture.tsx",
): P3HoverFinding[] {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const iconNames = importedIconNames(sourceFile);
  const findings: P3HoverFinding[] = [];

  const inspect = (node: ts.Node): void => {
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) {
      ts.forEachChild(node, inspect);
      return;
    }
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tokens = classTokens(opening);
    const hidden = tokens.filter((token) => HIDDEN_OPACITY.test(token));
    const hoverReveal = tokens.filter((token) => HOVER_REVEAL.test(token));
    if (hidden.length > 0 && hoverReveal.length > 0) {
      const location = sourceFile.getLineAndCharacterOfPosition(
        opening.getStart(),
      );
      const tag = jsxTagName(opening.tagName);
      const interaction = interactionEvidence(node);
      const safe = safeReason(tokens, hidden, interaction);
      let classification: P3HoverClassification;
      let rank: number;
      let reason: string;
      if (safe) {
        classification = "safe";
        rank = 0;
        reason = safe;
      } else if (interaction) {
        classification = "actionable";
        rank = interaction.score + pathRankAdjustment(file);
        reason = interaction.direct
          ? `interactive ${interaction.description} is invisible until hover`
          : `wrapper containing interactive ${interaction.description} is invisible until hover`;
      } else if (isDecorativeSubtree(node, iconNames)) {
        classification = "decoration";
        rank = 20;
        reason =
          "hover-revealed subtree has no interactive semantics and is decorative";
      } else {
        classification = "review";
        rank = 60;
        reason =
          "hover-revealed custom subtree has no statically provable interaction semantics";
      }
      findings.push({
        classification,
        column: location.character + 1,
        file,
        line: location.line + 1,
        rank,
        reason,
        tag,
        tokens: [...hidden, ...hoverReveal],
      });
    }
    ts.forEachChild(node, inspect);
  };
  inspect(sourceFile);
  return findings.sort(findingSort);
}

function trackedTsxFiles(repoRoot: string): string[] {
  return execFileSync("git", ["ls-files", "*.tsx"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .filter(
      (file) =>
        !/(?:^|\/)(?:node_modules|\.next|\.claude|test-utils)(?:\/|$)/.test(
          file,
        ) && !/\.(?:test|spec|stories)\.tsx$/.test(file),
    )
    .sort();
}

export function scanP3HoverRepository(repoRoot: string): P3HoverScan {
  const scan: P3HoverScan = {
    actionable: [],
    decoration: [],
    review: [],
    safe: [],
  };
  for (const file of trackedTsxFiles(repoRoot)) {
    const absolute = resolve(repoRoot, file);
    for (const finding of analyzeP3HoverSource(
      readFileSync(absolute, "utf8"),
      file,
    )) {
      scan[finding.classification].push(finding);
    }
  }
  for (const findings of Object.values(scan)) findings.sort(findingSort);
  return scan;
}

export function firstP3HoverRepairUnit(
  scan: P3HoverScan,
  fileLimit = 15,
): P3HoverFinding[] {
  const selectedFiles = new Set<string>();
  const selected: P3HoverFinding[] = [];
  for (const finding of scan.actionable) {
    if (!selectedFiles.has(finding.file) && selectedFiles.size >= fileLimit)
      continue;
    selectedFiles.add(finding.file);
    selected.push(finding);
  }
  return selected;
}

function formatFinding(finding: P3HoverFinding, index: number): string {
  return `${index + 1}. [${finding.rank}] ${finding.file}:${finding.line}:${finding.column} <${finding.tag}> — ${finding.reason}`;
}

function main(): void {
  const repoRoot = resolve(process.cwd());
  const json = process.argv.includes("--json");
  const limitArgument = process.argv.find((argument) =>
    argument.startsWith("--file-limit="),
  );
  const fileLimit = limitArgument
    ? Number.parseInt(limitArgument.slice("--file-limit=".length), 10)
    : 15;
  if (!Number.isInteger(fileLimit) || fileLimit < 1 || fileLimit > 15) {
    throw new Error("--file-limit must be an integer from 1 to 15");
  }
  const scan = scanP3HoverRepository(repoRoot);
  const repairUnit = firstP3HoverRepairUnit(scan, fileLimit);
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          repo: relative(process.cwd(), repoRoot) || ".",
          counts: {
            actionable: scan.actionable.length,
            decoration: scan.decoration.length,
            review: scan.review.length,
            safe: scan.safe.length,
          },
          repairUnit,
          review: scan.review,
          decoration: scan.decoration,
          safe: scan.safe,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  console.log(
    `P3 hover detector: ${scan.actionable.length} actionable, ${scan.review.length} review, ${scan.decoration.length} decoration, ${scan.safe.length} already safe.`,
  );
  console.log(
    `First bounded repair unit (${new Set(repairUnit.map((finding) => finding.file)).size}/${fileLimit} files):`,
  );
  for (const [index, finding] of repairUnit.entries()) {
    console.log(formatFinding(finding, index));
  }
  if (scan.review.length > 0) {
    console.log("Review queue:");
    for (const [index, finding] of scan.review.entries()) {
      console.log(formatFinding(finding, index));
    }
  }
}

if (process.env.NODE_ENV !== "test") main();
