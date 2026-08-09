/**
 * The No Dead Ends detector — AST rules over JSX.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): if the UI names a thing
 * that has an identity in our system, the UI must let the user reach it. This
 * file finds surfaces that break it.
 *
 * PRECISION IS THE PRODUCT. A noisy check gets ignored, and an ignored check is
 * worse than no check because it launders the class as "already covered". Every
 * rule below therefore carries explicit skip contexts, and the load-bearing gate
 * on the name rule is simple and honest: we only flag a name when the SAME
 * object's id is in scope in that file — i.e. the surface provably knows the
 * record's identity and withheld the door anyway.
 */

import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import ts from "typescript";
import {
  expressionWords,
  inferToken,
  type EntityTokenInfo,
} from "./entity-tokens";
import type { DeadEndFinding, DeadEndRuleId, DeadEndSeverity } from "./types";

// ─── Vocabulary ─────────────────────────────────────────────────────────────

/** Property names that mean "the human-readable identity of a record". */
const NAME_PROPERTY_RE =
  /^(name|title|label|displayName|fullName|agentName|noteTitle|fileName|filename|slotKey|slug)$/;

/** Property names that mean "a raw identifier the user cannot read". */
const ID_PROPERTY_RE = /^(id|.+_id|.+Id|uuid|.+Uuid|.+UUID)$/;

/** Count-ish expressions: `x.length`, `overrideCount`, `total`, `count`. */
const COUNT_PROPERTY_RE = /^(length|count|.+Count|total|.+Total|size)$/;

/**
 * Tags that ARE doors. An ancestor with one of these means the user can reach
 * the record — nothing to report.
 */
const DOOR_TAGS = new Set([
  "a",
  "Link",
  "NextLink",
  "EntityRef",
  "NavLink",
  "AssociationEntitySelect",
  "OverlayLaunchButton",
  "OpenInWindowButton",
]);

/**
 * Attributes that make any element a door — an explicit navigation target or
 * an activation handler. `TableRow onClick` opening the record is the canonical
 * list pattern (lib/entity-list), so it counts.
 */
const DOOR_ATTRS = new Set([
  "href",
  "onClick",
  "onDoubleClick",
  "onSelect",
  "onRowClick",
  "onOpen",
  "to",
]);

/**
 * Contexts where naming a record is NOT a dead end, so the rule stays quiet:
 *
 *  - pickers/menus — the name IS the selection affordance, not a reference
 *  - the record's own page/dialog heading — the user is already there
 *  - labels, tooltips and option text — chrome, not a reference
 */
const SKIP_ANCESTOR_TAGS = new Set([
  // Selection surfaces — choosing, not referencing.
  "SelectItem",
  "SelectValue",
  "CommandItem",
  "DropdownMenuItem",
  "DropdownMenuRadioItem",
  "DropdownMenuCheckboxItem",
  "ContextMenuItem",
  "MenubarItem",
  "MenuItem",
  "ComboboxOption",
  "ToggleGroupItem",
  "RadioGroupItem",
  "TabsTrigger",
  "AccordionTrigger",
  "option",
  "Option",
  "Autocomplete",
  // "You are here" headings — the record's own surface.
  "h1",
  "h2",
  "DialogTitle",
  "SheetTitle",
  "DrawerTitle",
  "AlertDialogTitle",
  "PageHeader",
  "PageTitle",
  "BreadcrumbPage",
  // Chrome and prose — a name inside explanatory copy is a sentence, not a
  // reference the user is meant to navigate from.
  "label",
  "Label",
  "TooltipContent",
  "HoverCardContent",
  "title",
  "Toast",
  "ToastTitle",
  "DialogDescription",
  "SheetDescription",
  "DrawerDescription",
  "AlertDialogDescription",
  "AlertDescription",
  "CardDescription",
  "FormDescription",
]);

/** Imports that prove a file owns at least one door mechanism. */
const DOOR_IMPORT_MARKERS = [
  "next/link",
  "entity-ref/EntityRef",
  "useRouter",
  "next/navigation",
  "features/overlays/openers",
  "getEntityInfo",
  "hrefFor",
  "ResourcePeekHost",
];

/** Imports that prove a file is reading real records (Inventory Law rule). */
const ENTITY_SOURCE_IMPORT_RE =
  /(\/service(s)?(\.ts)?["']|\/redux\/|\/thunks|supabase\/client|\/selectors)/;

/** Plural nouns that make "N <noun>" a reference to reachable records. */
const COUNTABLE_NOUNS =
  /\b(agents?|notes?|files?|tasks?|projects?|conversations?|chats?|documents?|workflows?|skills?|apps?|overrides?|versions?|members?|users?|records?|items?|shortcuts?|transcripts?|datasets?|workbooks?|lists?|keywords?|pages?|scopes?|organizations?|orgs?|slots?|sessions?|messages?|comments?|attachments?|resources?)\b/i;

// ─── File filtering ─────────────────────────────────────────────────────────

const SKIP_PATH_FRAGMENTS = [
  "/__tests__/",
  "/node_modules/",
  ".test.tsx",
  ".test.ts",
  ".spec.tsx",
  ".stories.tsx",
  "/.next",
];

export function shouldScanFile(relPath: string): boolean {
  if (!relPath.endsWith(".tsx")) return false;
  const p = `/${relPath}`;
  return !SKIP_PATH_FRAGMENTS.some((frag) => p.includes(frag));
}

/**
 * Cheap pre-filter so we only pay for a TS parse on files that could possibly
 * match. Cuts the tree roughly in half on this repo.
 */
export function couldContainFinding(src: string): boolean {
  return /\{\s*[A-Za-z_$][\w$.?[\]]*\s*(\}|\.(slice|toString)\()/.test(src);
}

// ─── Scanning ───────────────────────────────────────────────────────────────

export interface ScanContext {
  repoRoot: string;
  tokens: Map<string, EntityTokenInfo>;
}

export function scanFile(
  absPath: string,
  ctx: ScanContext,
): DeadEndFinding[] {
  const relPath = relative(ctx.repoRoot, absPath).split(sep).join("/");
  const src = readFileSync(absPath, "utf8");
  if (!couldContainFinding(src)) return [];

  const sf = ts.createSourceFile(
    relPath,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const findings: DeadEndFinding[] = [];
  /** Every `a.b` / `a` text in the file — the "is the id in scope?" oracle. */
  const scopeText = src;
  let sawEntityName = false;
  let importsDoor = DOOR_IMPORT_MARKERS.some((m) => src.includes(m));
  let importsEntitySource = false;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier.getText(sf);
      if (ENTITY_SOURCE_IMPORT_RE.test(spec)) importsEntitySource = true;
    }

    if (ts.isJsxExpression(node) && isTextPosition(node)) {
      const finding = classifyExpression(node, sf, relPath, scopeText, ctx);
      if (finding) {
        if (finding.rule === "unlinked-entity-name") sawEntityName = true;
        findings.push(finding);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Inventory Law: a surface that reads real records, names them, and imports
  // no door mechanism at all has skipped the inventory pass wholesale.
  if (!importsDoor && importsEntitySource && sawEntityName) {
    findings.push(
      makeFinding({
        relPath,
        line: 1,
        column: 1,
        rule: "no-doors-in-file",
        severity: "high",
        entity: "(file)",
        entityHasRoute: false,
        expression: relPath,
      }),
    );
  }

  return findings;
}

function isTextPosition(node: ts.JsxExpression): boolean {
  const parent = node.parent;
  return (
    parent != null &&
    (ts.isJsxElement(parent) || ts.isJsxFragment(parent))
  );
}

function classifyExpression(
  node: ts.JsxExpression,
  sf: ts.SourceFile,
  relPath: string,
  scopeText: string,
  ctx: ScanContext,
): DeadEndFinding | null {
  const expr = node.expression;
  if (!expr) return null;

  const rawText = expr.getText(sf).trim();
  // Multi-line / call-heavy expressions are components or formatters, not a
  // rendered field. Keep the rule to plain field reads.
  if (rawText.length > 80 || rawText.includes("\n")) return null;

  const property = terminalProperty(expr);
  if (!property) return null;

  const skipTag = findSkipAncestor(node);
  if (skipTag) return null;

  // `{row.agentId ? <EntityRef …/> : <span>{row.agentName}</span>}` — the
  // fallback arm renders the name precisely BECAUSE there is no id to open.
  // That is the Door Law honoured, not broken.
  if (isIdGuardedFallback(node)) return null;

  const doorTag = findDoorAncestor(node);

  const words = expressionWords(rawText);
  const tokenInfo = inferToken(words, ctx.tokens);
  const entity = tokenInfo?.token ?? `?${rootIdentifier(expr) ?? "unknown"}`;
  const entityHasRoute = tokenInfo?.hasRoute ?? false;
  const pos = sf.getLineAndCharacterOfPosition(expr.getStart(sf));
  const line = pos.line + 1;
  const column = pos.character + 1;

  // ── Rule: bare id rendered as text ────────────────────────────────────────
  if (ID_PROPERTY_RE.test(property)) {
    if (doorTag) return null;
    // `key={x.id}` style is an attribute, already excluded by text position.
    // A `cellKind: "uuid"` cell renders through the table's own resolver.
    if (/cellKind:\s*["']uuid["']/.test(scopeText)) return null;
    // A naked `{id}` with no object root and no inferable entity is usually a
    // map key, a config slug, or an HTML element id — not a record identifier.
    // Require either a resolvable entity or a `<object>.<id>` read.
    if (!tokenInfo && !ts.isPropertyAccessExpression(unwrap(expr))) return null;
    return makeFinding({
      relPath,
      line,
      column,
      rule: "bare-id-text",
      severity: entityHasRoute ? "high" : "medium",
      entity,
      entityHasRoute,
      expression: rawText,
    });
  }

  // ── Rule: entity name rendered with no door ───────────────────────────────
  if (NAME_PROPERTY_RE.test(property)) {
    if (doorTag) return null;
    const root = rootIdentifier(expr);
    if (!idIsInScope(root, rawText, scopeText)) return null;
    // Only report when we could actually name the entity — an unnameable
    // `{x.label}` is chrome more often than a record reference.
    if (!tokenInfo) return null;
    return makeFinding({
      relPath,
      line,
      column,
      rule: "unlinked-entity-name",
      severity: entityHasRoute ? "high" : "medium",
      entity,
      entityHasRoute,
      expression: rawText,
    });
  }

  // ── Rule: a count is a door too ───────────────────────────────────────────
  if (COUNT_PROPERTY_RE.test(property)) {
    if (doorTag) return null;
    const noun = siblingNoun(node);
    if (!noun) return null;
    return makeFinding({
      relPath,
      line,
      column,
      rule: "unlinked-count",
      severity: "medium",
      entity,
      entityHasRoute,
      expression: `${rawText} ${noun.trim()}`,
    });
  }

  return null;
}

/** `row.agent.name` → `name`; `agentName` → `agentName`. */
function terminalProperty(expr: ts.Expression): string | null {
  let cur: ts.Node = expr;
  // Unwrap `x.name ?? ""`, `x.name || "-"`, `String(x.id)`, `x.id.slice(0, 8)`.
  for (let guard = 0; guard < 6; guard++) {
    if (ts.isBinaryExpression(cur)) {
      cur = cur.left;
      continue;
    }
    if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (
      ts.isCallExpression(cur) &&
      ts.isPropertyAccessExpression(cur.expression) &&
      /^(slice|substring|substr|toString|trim|toUpperCase|toLowerCase)$/.test(
        cur.expression.name.text,
      )
    ) {
      cur = cur.expression.expression;
      continue;
    }
    break;
  }
  if (ts.isPropertyAccessExpression(cur)) return cur.name.text;
  if (ts.isIdentifier(cur)) return cur.text;
  if (
    ts.isElementAccessExpression(cur) &&
    cur.argumentExpression &&
    ts.isStringLiteral(cur.argumentExpression)
  ) {
    return cur.argumentExpression.text;
  }
  return null;
}

/** `row.agent.name` → `row`. */
function rootIdentifier(expr: ts.Expression): string | null {
  let cur: ts.Node = expr;
  for (let guard = 0; guard < 12; guard++) {
    if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (
      ts.isNonNullExpression(cur) ||
      ts.isParenthesizedExpression(cur) ||
      ts.isCallExpression(cur)
    ) {
      cur = cur.expression;
      continue;
    }
    if (ts.isBinaryExpression(cur)) {
      cur = cur.left;
      continue;
    }
    break;
  }
  return ts.isIdentifier(cur) ? cur.text : null;
}

/**
 * The load-bearing precision gate. We flag a name only when the surface
 * provably holds that record's identity: `row.name` needs `row.id` /
 * `row.<x>Id` / a same-named `<x>Id` binding somewhere in the file.
 */
function idIsInScope(
  root: string | null,
  rawText: string,
  scopeText: string,
): boolean {
  if (root) {
    const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rootIdRe = new RegExp(
      `\\b${escaped}\\??\\.(id|uuid|[A-Za-z0-9_]*(_id|Id)\\b)`,
    );
    if (rootIdRe.test(scopeText)) return true;
  }
  // `{agentName}` destructured alongside `agentId`.
  const bare = rawText.replace(/^.*\./, "");
  const stem = bare.replace(/(Name|Title|Label)$/, "");
  if (stem && stem !== bare) {
    const stemRe = new RegExp(`\\b${stem}(Id|_id)\\b`);
    if (stemRe.test(scopeText)) return true;
  }
  return false;
}

function findDoorAncestor(node: ts.Node): string | null {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    const opening = openingElementOf(cur);
    if (opening) {
      const tag = tagNameOf(opening);
      if (tag && DOOR_TAGS.has(tag)) return tag;
      for (const attr of opening.attributes.properties) {
        if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) {
          if (DOOR_ATTRS.has(attr.name.text)) return tag ?? attr.name.text;
        }
        // `{...linkProps}` may carry href/onClick — assume a door rather than
        // report a guess. Precision over recall.
        if (ts.isJsxSpreadAttribute(attr)) return tag ?? "spread";
      }
    }
    cur = cur.parent;
  }
  return null;
}

function findSkipAncestor(node: ts.Node): string | null {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    const opening = openingElementOf(cur);
    if (opening) {
      const tag = tagNameOf(opening);
      if (tag && SKIP_ANCESTOR_TAGS.has(tag)) return tag;
    }
    cur = cur.parent;
  }
  return null;
}

function openingElementOf(
  node: ts.Node,
): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return null;
}

function tagNameOf(
  el: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): string | null {
  const name = el.tagName;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPropertyAccessExpression(name)) return name.name.text;
  return null;
}

/**
 * The noun immediately AFTER `{count}` — `{n} overrides` → "overrides".
 *
 * Only the FOLLOWING sibling, and only its first two words. Scanning the
 * preceding text (or the whole paragraph) matched prose like "…canonicalization
 * workflow, and schema visualizers. {dupCount} duplicate(s)…" and produced
 * exactly the noise that gets a checker ignored.
 */
function siblingNoun(node: ts.JsxExpression): string | null {
  const parent = node.parent;
  if (!parent || (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent))) return null;
  const children = parent.children;
  const idx = children.indexOf(node as ts.JsxChild);
  const sibling = children[idx + 1];
  if (!sibling || !ts.isJsxText(sibling)) return null;
  const head = sibling.text.trim().split(/\s+/).slice(0, 2).join(" ");
  if (!head || !COUNTABLE_NOUNS.test(head)) return null;
  return head;
}

/** Strip `!`, `(…)`, `?? fallback` down to the underlying read. */
function unwrap(expr: ts.Expression): ts.Node {
  let cur: ts.Node = expr;
  for (let guard = 0; guard < 6; guard++) {
    if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isBinaryExpression(cur)) {
      cur = cur.left;
      continue;
    }
    break;
  }
  return cur;
}

/**
 * True when this expression sits in the FALSE arm of a conditional whose test
 * is the very id that would have opened the door — the honest "we have no id,
 * so there is no door" fallback. The reference implementation
 * (`AgentSlotsConsole`) writes exactly this shape, and flagging it would teach
 * agents to delete a correct guard.
 */
function isIdGuardedFallback(node: ts.Node): boolean {
  let child: ts.Node = node;
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isConditionalExpression(cur)) {
      const inFalseArm = isAncestorOf(cur.whenFalse, child);
      if (inFalseArm && /\b(id|uuid)\b|_id\b|Id\b/.test(cur.condition.getText())) {
        return true;
      }
    }
    child = cur;
    cur = cur.parent;
  }
  return false;
}

function isAncestorOf(ancestor: ts.Node, node: ts.Node): boolean {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}

// ─── Finding construction ───────────────────────────────────────────────────

function makeFinding(args: {
  relPath: string;
  line: number;
  column: number;
  rule: DeadEndRuleId;
  severity: DeadEndSeverity;
  entity: string;
  entityHasRoute: boolean;
  expression: string;
}): DeadEndFinding {
  return {
    file: args.relPath,
    line: args.line,
    column: args.column,
    rule: args.rule,
    severity: args.severity,
    entity: args.entity,
    entityHasRoute: args.entityHasRoute,
    expression: args.expression,
    feature: featureOf(args.relPath),
    route: routeOf(args.relPath),
  };
}

/** `features/agents/browse/X.tsx` → `features/agents`; app files → their group. */
export function featureOf(relPath: string): string {
  const parts = relPath.split("/");
  if (parts[0] === "features" && parts[1]) return `features/${parts[1]}`;
  if (parts[0] === "app" && parts[1]) return `app/${parts[1]}`;
  if (parts[0] === "components" && parts[1]) return `components/${parts[1]}`;
  if (parts[0] === "lib" && parts[1]) return `lib/${parts[1]}`;
  return parts[0] ?? "(root)";
}

/**
 * Best-effort URL for an `app/` file so the dashboard can open the offending
 * surface, not just the source. Route groups `(x)` and slot dirs `@x` drop out;
 * dynamic segments keep their bracket form so a human can see the shape.
 */
export function routeOf(relPath: string): string | null {
  if (!relPath.startsWith("app/")) return null;
  const parts = relPath.split("/").slice(1);
  const leaf = parts.pop() ?? "";
  if (!/^(page|layout|template)(\.dev)?\.tsx$/.test(leaf)) return null;
  const segments = parts.filter(
    (p) => !(p.startsWith("(") && p.endsWith(")")) && !p.startsWith("@") && !p.startsWith("_"),
  );
  return `/${segments.join("/")}`;
}
