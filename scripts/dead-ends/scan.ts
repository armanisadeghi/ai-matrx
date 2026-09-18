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
  nounsForToken,
  type EntityTokenInfo,
} from "./entity-tokens";
import type { DeadEndFinding, DeadEndRuleId, DeadEndSeverity } from "./types";

// ─── Vocabulary ─────────────────────────────────────────────────────────────

/** Property names that mean "the human-readable identity of a record". */
const NAME_PROPERTY_RE =
  /^(name|title|label|displayName|fullName|agentName|noteTitle|fileName|filename|mandateKey|policyKey|slug)$/;

/** Property names that mean "a raw identifier the user cannot read". */
const ID_PROPERTY_RE = /^(id|.+_id|.+Id|uuid|.+Uuid|.+UUID)$/;

/** Count-ish expressions: `x.length`, `overrideCount`, `total`, `count`. */
const COUNT_PROPERTY_RE = /^(length|count|.+Count|total|.+Total|size)$/;

/**
 * Ids that identify a UI thing rather than a record — there is nothing behind
 * them to open.
 *
 * Deliberately NARROW. An earlier, longer list suppressed `brokerId`,
 * `call_id`, `nodeId`, `blockId`, `stepId` and `sessionId`, every one of which
 * IS a real record in this platform (brokers, `cx_tool_call`, workflow/plan
 * nodes, content-IR blocks). Suppressing a real entity is worse than ranking it
 * low — the registry decides what has a door, not this list.
 */
const NON_RECORD_ID_RE =
  /^(request|instance|client|tab|element|trace|correlation|render|form|input|row|cell|toast|dialog|menu|container)(_id|Id|_uuid|Uuid)$/;

/**
 * Object roots that hold a transient runtime thing, not a persisted record.
 * `promise.id` / `rejection.run_id` / `snap.activeCardId` were the bulk of the
 * unresolvable-entity noise.
 */
const NON_RECORD_ROOT_RE =
  /^(request|instance|promise|rejection|toast|snap|snapshot|state|draft|event|err|error|ref|timer|subscription|channel)[A-Z0-9_]*$|^(request|instance|promise|rejection|toast|snap|snapshot|state|draft|event|err|error|ref|timer|subscription|channel)$/;

/**
 * Controls that OPEN something — a row door only counts if it does this.
 * `restore` counts: a soft-deleted record's row has no "open" by design, and
 * restoring it is the reachable action.
 */
const OPEN_AFFORDANCE_RE =
  /\b(open|view|details?|preview|manage|inspect|go to|edit|restore|undelete|recover)\b/i;

/**
 * Verbs that make the following name a REFERENCE, not prose — "Saved to
 * <note>", "Assigned to <agent>". This is doctrine's own class, so it must
 * survive the prose gate.
 */
const REFERENCE_VERB_RE =
  /\b(saved (to|as|in)|added to|moved to|assigned to|linked to|attached to|belongs to|created in|now in|sent to)\s*$/i;

/**
 * Verbs in a click handler that mean "this opens the record".
 *
 * Matched against camel/underscore SEGMENTS of the handler source, not with
 * `\b` — there is no word boundary inside `onActivate`, so a boundary-anchored
 * regex missed the single most common "open this row" callback name in this
 * repo and reported every row that used it.
 */
const NAVIGATING_VERBS = new Set([
  "open",
  "push",
  "replace",
  "router",
  "navigate",
  "href",
  "goto",
  "go",
  "view",
  "peek",
  "select",
  "selected",
  "activate",
  "launch",
  "reveal",
  "detail",
  "details",
  "inspect",
]);

function handlerNavigates(text: string): boolean {
  return text
    .split(/[^A-Za-z0-9]+/)
    .flatMap((part) => part.split(/(?=[A-Z])/))
    .some((part) => NAVIGATING_VERBS.has(part.toLowerCase()));
}

/** Controls that destroy or dismiss — never a door, even with an onClick. */
const CLOSING_AFFORDANCE_RE =
  /\b(delete|remove|archive|dismiss|close|cancel|copy|duplicate|download|revoke|unlink|detach)\b/i;

/** Inline tags that wrap a value for styling without adding meaning. */
const INLINE_WRAPPER_TAGS = new Set([
  "span",
  "strong",
  "b",
  "em",
  "i",
  "code",
  "mark",
]);

/** Placeholder markers — a name inside one is not the real surface. */
const PLACEHOLDER_RE = /\b(Loader2|Skeleton|animate-spin|Spinner)\b/;

/** Calls that format a value without changing what it identifies. */
const FORMATTER_CALL_RE =
  /^(slice|substring|substr|toString|trim|toUpperCase|toLowerCase|padStart|padEnd)$/;

/**
 * Copy that says the record is GONE. There is nothing to open, so naming its
 * id is the only thing the surface can do.
 */
const NOT_FOUND_PHRASE_RE =
  /\b(not found|could ?n.t be found|no longer exists?|does ?n.t exist|missing|was deleted|unavailable|failed to load)\b/i;

/** Result-count phrasing: describes the view, not reachable records. */
const PAGINATION_PHRASE_RE =
  /\b(showing|of|out of|total|results?|selected|matching|filtered|loaded|available|remaining|found)\b/i;

/**
 * Tags that ARE doors. An ancestor with one of these means the user can reach
 * the record — nothing to report.
 */
const DOOR_TAGS = new Set([
  "a",
  "Link",
  "NextLink",
  "EntityRef",
  "EntityDoorControls",
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
  // h1/h2 only. h3/h4 are card titles inside lists as often as they are
  // record headings — skipping them lost real findings. The "record's own
  // heading" case is handled precisely by isSelfSubject instead.
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

/**
 * Imported BINDINGS that are doors even when the module path says nothing —
 * this repo's local idiom (`openFilePreview`, `scopeHref`, `goToRecord`).
 * Missing these made `no-doors-in-file` report files that DO have a door.
 */
const DOOR_BINDING_RE = /^(open|goTo|navigateTo|show)[A-Z]|(Href|Url|Route)$/;

/** Module specifiers that prove a file owns at least one door mechanism. */
const DOOR_IMPORT_MARKERS = [
  "next/link",
  "entity-ref/EntityRef",
  // The OTHER canonical door primitive: doors rendered ALONGSIDE a name
  // instead of on it, for surfaces where the name cannot be the anchor (the
  // row's click already means edit, or a same-tab nav would discard the
  // user's typed prose). A file importing it owns a door mechanism.
  "entity-ref/EntityDoorControls",
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
  /\b(agents?|notes?|files?|tasks?|projects?|conversations?|chats?|documents?|workflows?|skills?|apps?|overrides?|versions?|members?|users?|records?|items?|shortcuts?|transcripts?|datasets?|workbooks?|lists?|keywords?|pages?|scopes?|organizations?|orgs?|mandates?|slots?|sessions?|messages?|comments?|attachments?|resources?)\b/i;

// ─── Toast door vocabulary ──────────────────────────────────────────────────
//
// THE CLASS (V-20 N10, 2026-09-18): `pnpm check:dead-ends` read JSX text only,
// so a surface could create a record, name it in a toast, and offer no way to
// reach it — and every rule above stayed green. `AgendaPanel.tsx` did exactly
// that: "Note created and linked to this event." with no door anywhere, and the
// note was then reachable from nothing.
//
// A toast is the one place where a dead end is WORSE than on a page: the
// sentence removes itself after four seconds, so a door the user did not take
// in that window is gone. The remedy is both halves — a door in the toast
// (`{ action: { label, onClick } }`) and a door on the surface, because the
// toast expires and the record does not.
//
// NOT the same rule as `pnpm check:record-toasts`, and neither one is the other
// half's substitute. That check asks whether a record-naming toast CARRIES the
// record (`recordToast` + `{ type, id, title }`) so it can be withdrawn when
// the sentence stops being true; this one asks whether the person can OPEN the
// record the sentence names. A call can pass either and fail the other, and the
// two remedies are different lines of code — so the rules live apart on
// purpose, one detector each.

/** Sonner methods that raise a sentence a person reads. */
const TOAST_METHODS = new Set(["success", "error", "info", "warning", "message"]);

/**
 * Modules whose `toast` binding raises a real toast. `sonner` is included even
 * though importing it directly is banned elsewhere — a blind spot is not worth
 * keeping to make this rule's scope tidy.
 */
const TOAST_MODULE_RE = /lib\/toast|^["']sonner["']$/;

/**
 * A record CAME INTO EXISTENCE (or into another record) in the click this toast
 * reports, so the surface provably holds it and the user has somewhere to go.
 *
 * DELIBERATELY NOT `saved`, `updated`, `renamed`, `deleted`, `copied` on their
 * own: "Note saved" is almost always the record's OWN editor — the user is
 * already there, and the Door Law is honoured. "Deleted" and "Copied" name
 * nothing to open at all. Requiring a creation verb is what keeps this rule off
 * the enormous every-mutation-toast population; the cost is that a genuine
 * "Renamed X" dead end is out of reach (FEATURE.md § Known limits).
 */
const TOAST_CREATION_VERB_RE =
  /\b(created?|creating|added|imported|uploaded|duplicated|cloned|generated|published|scheduled|queued|started)\b/i;

/**
 * "Saved to <note>" / "assigned to <agent>" — the record named is ELSEWHERE.
 *
 * `copied to` is absent on purpose (the clipboard is not a record), and so are
 * `sent to` / `exported to`: "Feedback sent to agent" names a RECIPIENT, and the
 * record that came into being is the feedback comment, not the agent.
 *
 * For this family the entity's noun must also appear AFTER the phrase — the
 * destination is the record being named. "Note added to the knowledge base"
 * names the note the user is already on and a destination that is not a record,
 * and it read as a finding until the position was checked.
 */
const TOAST_ELSEWHERE_PHRASE_RE =
  /\b(saved (to|in)|added to|moved to|assigned to|linked to|attached to)\b/i;

/**
 * The operation did NOT happen. There is no record to open, and naming what
 * failed is the surface being honest (law 4), never a dead end.
 */
const TOAST_FAILED_RE =
  /\b(fail(s|ed|ure|ing)?|could ?n.t|can ?not|can.t|unable|denied|refused|rejected|invalid|missing|not found|no longer|does ?n.t exist|already|skipped|nothing (to|was)|no [a-z]+ (were|was) |was not|were not)\b/i;

/**
 * The surface REFUSED before doing anything, and the sentence is an instruction
 * ("Choose an organization before creating a note.") or a prerequisite
 * ("This asset kind needs a source URL"). No record was created, so there is
 * nothing to open — and the mutation verb in it is the thing the user has NOT
 * done yet. Nine of the first seventy-nine findings were this shape.
 */
const TOAST_INSTRUCTION_RE =
  /^(choose|select|pick|enter|provide|sign in|set |name |type |give )/i;

const TOAST_PREREQUISITE_RE =
  /\b(before (creat|sav|add|upload|import|gener|send|publish)|try (creating|again)|still loading|needs? (a|an|to)\b|no [a-z ]{1,24} to (create|save|add|send)|auto-?generated)/i;

/**
 * The record is GONE (or was never a record): trashed, deleted, unpublished, or
 * copied to the clipboard. Nothing to open — the honest affordance is Undo, and
 * that is a different law.
 */
const TOAST_GONE_RE =
  /\b(moved to (the )?trash|deleted|removed|unpublished|archived|discarded|revoked|detached|unlinked|copied to clipboard|to your clipboard)\b/i;

/** Properties on a toast's options bag that put a door IN the toast. */
const TOAST_DOOR_OPTION_RE = /^(action|actions)$/;

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

// A source pre-filter used to live here, claiming to halve the tree. Measured,
// it dropped 134 of 6,803 files (2%) while silently excluding real shapes it
// could not express (`{x.name ?? "Untitled"}`, `{row["name"]}`). A full run is
// ~9s. It bought nothing and could hide findings, so it is gone.

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
  /**
   * A bare id whose entity we could RESOLVE — `{conv.conversationId}`, not
   * `{d.originalId}`. A surface can present records without ever naming one,
   * and the Inventory Law applies to it just the same; keying the file rule
   * on names alone missed every id-only list.
   */
  let sawNamedId = false;
  /**
   * Does this file own a door mechanism? Decided from the IMPORT GRAPH, never
   * from raw file text.
   *
   * `src.includes("next/link")` also matched the word inside a comment, a
   * string literal, or dead code — so a genuinely door-less surface that merely
   * *mentioned* `hrefFor` or `getEntityInfo` (in a TODO, say) excused itself
   * from the Inventory Law rule entirely. Now every marker is matched against
   * the module specifiers and imported bindings the AST reports.
   */
  let importsDoor = false;
  let importsEntitySource = false;

  /**
   * A debug panel, diagnostic or test client displays raw records BY DESIGN —
   * that is the whole surface. Its individual `bare-id-text` /
   * `unlinked-entity-name` findings still report; adding a file-level "you
   * skipped the inventory pass" on top is a false accusation. Measured: without
   * this, widening added 14 files of which 8 were diagnostics.
   *
   * Applies to BOTH triggers. A first cut gated only the id path, so a
   * diagnostic that happened to render a record's NAME still got the
   * file-level finding — code contradicting the rule text one file over. (No
   * finding changes today: zero of the 16 are diagnostics either way.)
   */
  const isDiagnosticSurface =
    /(^|\/)(debug|diagnostic|devtools)|Debug|Diagnostic|DevTools|TestClient/.test(relPath);

  /** Toast bindings, read once from the import graph (see `toastBindings`). */
  const toasts = toastBindings(sf);

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier.getText(sf);
      if (ENTITY_SOURCE_IMPORT_RE.test(spec)) importsEntitySource = true;
      if (!importsDoor) {
        const bindings = importedBindings(node);
        const declaresDoor =
          DOOR_IMPORT_MARKERS.some(
            (m) => spec.includes(m) || bindings.some((b) => b === m),
          ) || bindings.some((b) => DOOR_BINDING_RE.test(b));
        if (declaresDoor) importsDoor = true;
      }
    }

    if (ts.isCallExpression(node)) {
      // A toast is not JSX and has no ancestor to carry a door, so this rule
      // reads the CALL. It never feeds `sawEntityName` / `sawNamedId`: the
      // Inventory Law is about a surface presenting records, and a toast is a
      // sentence that leaves the screen.
      const toastFinding = classifyToastCall(node, sf, relPath, ctx, toasts);
      if (toastFinding) findings.push(toastFinding);
    }

    if (ts.isJsxExpression(node) && isTextPosition(node)) {
      const finding = classifyExpression(node, sf, relPath, scopeText, ctx);
      if (finding) {
        if (finding.rule === "unlinked-entity-name") sawEntityName = true;
        if (finding.rule === "bare-id-text" && !finding.entity.startsWith("?")) {
          sawNamedId = true;
        }
        findings.push(finding);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Inventory Law: a surface that reads real records, PRESENTS them — by name
  // or by an id whose entity resolves — and imports no door mechanism at all
  // has skipped the inventory pass wholesale.
  const presentsRecords = (sawEntityName || sawNamedId) && !isDiagnosticSurface;
  if (!importsDoor && importsEntitySource && presentsRecords) {
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

/** Local names a file imports — the binding, not the module path. */
function importedBindings(node: ts.ImportDeclaration): string[] {
  const clause = node.importClause;
  if (!clause) return [];
  const out: string[] = [];
  if (clause.name) out.push(clause.name.text);
  const bindings = clause.namedBindings;
  if (bindings) {
    if (ts.isNamespaceImport(bindings)) out.push(bindings.name.text);
    else for (const el of bindings.elements) out.push(el.name.text);
  }
  return out;
}

function isTextPosition(node: ts.JsxExpression): boolean {
  const parent = node.parent;
  return (
    parent != null &&
    (ts.isJsxElement(parent) || ts.isJsxFragment(parent))
  );
}

// ─── Rule: a toast that announces a record must open it ─────────────────────

/**
 * The toast bindings this FILE imported, read from the import graph and never
 * from raw text — `const toast = …` on a local object must not arm the rule,
 * and a renamed import (`import { toast as notify }`) must not escape it.
 */
function toastBindings(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!TOAST_MODULE_RE.test(stmt.moduleSpecifier.getText(sf))) continue;
    for (const binding of importedBindings(stmt)) out.add(binding);
  }
  return out;
}

interface ToastMessage {
  /** Every literal fragment of the message, in order, joined by "…". */
  text: string;
  /** The interpolated expressions, as source text. */
  interpolations: string[];
  /**
   * The same message with each interpolation INLINED as its source text, so word
   * ORDER survives: `Saved to ${scopeName}` → "Saved to scopeName". The
   * destination gate needs to know whether the entity's noun came before or
   * after the phrase, and the display text cannot answer that.
   */
  flat: string;
}

/**
 * The STATIC text of a toast's message argument, or null when there is none to
 * read. Template literals, both arms of a ternary and both sides of a `+` or
 * `??` are read — the shipped offender was a ternary of two different sentences,
 * and reading only the first would have missed it.
 *
 * A message built elsewhere (`toast.success(msg)`), or one assembled by a call,
 * is invisible to this rule. That is a stated limit, not a pass.
 */
function staticMessage(expr: ts.Expression | undefined, depth = 0): ToastMessage | null {
  if (!expr || depth > 4) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return { text: expr.text, interpolations: [], flat: expr.text };
  }
  if (ts.isTemplateExpression(expr)) {
    const parts = [expr.head.text];
    const flat = [expr.head.text];
    const interpolations: string[] = [];
    for (const span of expr.templateSpans) {
      interpolations.push(span.expression.getText());
      flat.push(` ${span.expression.getText()} `, span.literal.text);
      parts.push(span.literal.text);
    }
    return { text: parts.join(" … "), interpolations, flat: flat.join("") };
  }
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) {
    return staticMessage(expr.expression, depth + 1);
  }
  if (ts.isConditionalExpression(expr)) {
    return mergeMessages(
      staticMessage(expr.whenTrue, depth + 1),
      staticMessage(expr.whenFalse, depth + 1),
    );
  }
  if (ts.isBinaryExpression(expr)) {
    return mergeMessages(
      staticMessage(expr.left, depth + 1),
      staticMessage(expr.right, depth + 1),
    );
  }
  return null;
}

function mergeMessages(a: ToastMessage | null, b: ToastMessage | null): ToastMessage | null {
  if (!a) return b;
  if (!b) return a;
  return {
    text: `${a.text} … ${b.text}`,
    interpolations: [...a.interpolations, ...b.interpolations],
    flat: `${a.flat} … ${b.flat}`,
  };
}

/**
 * Does this call carry a door?
 *
 * An options argument we cannot read — a variable, a spread, a call — counts as
 * a door. This rule reports a door it can prove ABSENT, never one it merely
 * cannot see: `toast.success(msg, door)` (the shipped fix's own shape) must
 * pass, and a false accusation costs more than a missed finding here.
 */
function toastCallHasDoor(call: ts.CallExpression, messageIndex: number): boolean {
  const rest = call.arguments.slice(messageIndex + 1);
  if (rest.length === 0) return false;
  return rest.some((arg) => {
    if (!ts.isObjectLiteralExpression(arg)) return true;
    return arg.properties.some((prop) => {
      if (ts.isSpreadAssignment(prop)) return true;
      const name = prop.name ? propertyNameText(prop.name) : null;
      return name != null && TOAST_DOOR_OPTION_RE.test(name);
    });
  });
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

/**
 * Does this FILE render the collection of this entity — `files.map(…)`,
 * `keywordList.map(…)`? Then the record the toast announces lands in a list the
 * surface is already showing, with that list's own doors on it.
 *
 * Whole-file on purpose, and noun-scoped on purpose. An unnamed `refresh()` /
 * `onChanged()` in the handler proves nothing about WHICH collection came back —
 * the shipped offender called exactly that and its note was reachable from
 * nowhere, because an agenda of calendar events never lists notes. What the file
 * ITERATES is the honest signal.
 */
function fileRendersRecordsOf(token: string, scopeText: string): boolean {
  return nounsForToken(token).some((noun) =>
    new RegExp(
      `\\b[A-Za-z]*${escapeRe(noun)}(s|List|Items|Rows)\\??\\.(map|slice|flatMap)\\(`,
      "i",
    ).test(scopeText),
  );
}

/**
 * Does the sentence say THIS ENTITY was created — not merely mention it?
 *
 * The creation verb and the entity's noun must sit within two words of each
 * other: "Note created", "Created project “x”", "Keyword added". Without this,
 * "Created <folder> and moved the note" was reported against `note` (the note
 * was moved, the folder was created, and neither reading matched the finding)
 * and "Imported 42 segments from <file>" against `file`.
 */
function verbNamesThisEntity(flat: string, token: string): boolean {
  const words = flat.replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ");
  const nouns = new Set(nounsForToken(token));
  const verbAt: number[] = [];
  const nounAt: number[] = [];
  words.forEach((word, i) => {
    for (const segment of word.split(/(?=[A-Z])/)) {
      const lower = segment.toLowerCase();
      if (TOAST_CREATION_VERB_RE.test(lower)) verbAt.push(i);
      const singular = lower.endsWith("s") ? lower.slice(0, -1) : lower;
      if (nouns.has(lower) || nouns.has(singular)) nounAt.push(i);
    }
  });
  return verbAt.some((v) => nounAt.some((n) => Math.abs(v - n) <= 2));
}

/** Does the entity's noun appear AFTER the reference phrase that matched? */
function nounFollows(flat: string, match: RegExpExecArray, token: string): boolean {
  const tail = flat.replace(/\s+/g, " ").slice((match.index ?? 0) + match[0].length);
  return nounsForToken(token).some((noun) =>
    new RegExp(`\\b${escapeRe(noun)}s?\\b`, "i").test(tail),
  );
}

/**
 * THE COHERENCE GATE, and the load-bearing precision gate of this rule: did the
 * handler CALL something that names this entity?
 *
 * `createNoteAboutEvent(…)` before "Note created" proves the handler performed
 * that record's mutation and therefore holds it. Every function invoked in the
 * handler is read — `dispatch(copyNote({…}))` counts through the inner call —
 * and nothing else is: an identifier merely *passed* (`confirmCandidate(partyId)`)
 * is the surface's own subject, not the record the toast announces, and taking
 * identifiers into account attributed a merged contact's toast to the party page
 * the user was already on.
 *
 * It is also what keeps the entity ATTRIBUTION honest. "Created <folder> and
 * moved the note" resolved to `note` from the trailing words while the record
 * that came into being was a folder; the handler calls `onCreateFolder`, never a
 * note mutation, so the mismatch is caught instead of reported as a dead end
 * against the wrong entity.
 */
function handlerCallsEntityMutation(
  fn: ts.Node,
  token: string,
  tokens: Map<string, EntityTokenInfo>,
): boolean {
  let hit = false;
  const walk = (node: ts.Node): void => {
    if (hit) return;
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : ts.isIdentifier(node.expression)
          ? node.expression.text
          : "";
      if (callee) {
        const info = inferToken(expressionWords(callee), tokens);
        if (info?.token === token) hit = true;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(fn);
  return hit;
}

/**
 * The nearest enclosing function — the click handler. Both precision gates
 * below read it, and NOTHING wider: a navigation somewhere else in the file
 * (another row's `openDetail`) says nothing about this toast.
 */
function enclosingFunction(node: ts.Node): ts.Node | null {
  let cur: ts.Node | undefined = node.parent;
  for (let guard = 0; cur && guard < 40; guard++) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur)
    ) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * THE HANDLER ALREADY OPENED IT. `toast.success("Agent created!")` followed by
 * `router.replace(`/agents/${newId}/build`)` is the Door Law honoured in the
 * strongest possible way — the user is standing on the record. Five of the first
 * ten audited findings were this shape or the next one.
 */
const TOAST_HANDLER_NAVIGATES_RE =
  /\brouter\s*\.\s*(push|replace)\s*\(|\bwindow\s*\.\s*open\s*\(|\b(open|goTo|navigateTo|peek)[A-Z]\w*\s*\(|\bnavigate\s*\(/;

/**
 * THE RESULT LANDED ON THIS SCREEN. `const res = await generateImage(…)` then
 * `setResults(res.files)` — the records the toast counts are rendered by this
 * same surface, so there is nothing to reach for.
 *
 * Deliberately narrow: only a state setter fed from the MUTATION'S OWN result
 * counts. A bare refresh callback (`onChanged()`, `fetchAppsInitial()`) does
 * not, because it reloads the list the surface was already showing — the
 * shipped offender called exactly that and the note it created was still
 * reachable from nowhere.
 */
function mutationResultIsRenderedHere(fn: ts.Node, sf: ts.SourceFile): boolean {
  const awaited = new Set<string>();
  const setterArgs: string[] = [];
  /** `const created = result.project` — one alias hop off the awaited value. */
  const aliases: { name: string; from: string }[] = [];

  const walk = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (ts.isAwaitExpression(node.initializer)) awaited.add(node.name.text);
      else aliases.push({ name: node.name.text, from: node.initializer.getText(sf) });
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      // `setX`, and the same move under another name: `addImage(…)`,
      // `appendRow(…)`, `pushResult(…)`, `selectFile(…)`.
      /^(set|add|append|push|insert|select)[A-Z]/.test(node.expression.text)
    ) {
      setterArgs.push(node.arguments.map((a) => a.getText(sf)).join(" "));
    }
    ts.forEachChild(node, walk);
  };
  walk(fn);

  // One transitive hop: an alias of an awaited value is an awaited value.
  for (let pass = 0; pass < 2; pass++) {
    for (const alias of aliases) {
      if (awaited.has(alias.name)) continue;
      if ([...awaited].some((n) => new RegExp(`\\b${escapeRe(n)}\\b`).test(alias.from))) {
        awaited.add(alias.name);
      }
    }
  }

  if (awaited.size === 0 || setterArgs.length === 0) return false;
  return [...awaited].some((name) => {
    const re = new RegExp(`\\b${escapeRe(name)}\\b`);
    return setterArgs.some((arg) => re.test(arg));
  });
}

/**
 * Is every mention of this entity's noun spoken as the surface's OWN subject —
 * "this agent", "your files", "the current project"? Then the toast names no
 * record the user has been left unable to reach.
 */
function everyMentionIsTheSurfacesOwn(text: string, token: string): boolean {
  const nouns = nounsForToken(token);
  let mentions = 0;
  let own = 0;
  for (const noun of nouns) {
    const re = new RegExp(`(\\b(this|your|the current|each|every)\\s+)?\\b${escapeRe(noun)}s?\\b`, "gi");
    for (const match of text.matchAll(re)) {
      mentions += 1;
      if (match[1]) own += 1;
    }
  }
  return mentions > 0 && own === mentions;
}

/**
 * The handler RELOADS THE LIST OF THIS VERY ENTITY — `dispatch(fetchAppsInitial())`
 * after "App duplicated." The new record lands in the collection this surface is
 * showing, with the list's own doors on it.
 *
 * Name-matched to the entity on purpose. A bare `onChanged()` / `refresh()` says
 * nothing about WHICH collection came back, and the shipped offender called
 * exactly that while its note stayed unreachable — so an unnamed refresh never
 * excuses a toast.
 */
function reloadsThisCollection(fnText: string, token: string): boolean {
  return nounsForToken(token).some((noun) =>
    new RegExp(
      `\\b(fetch|refetch|reload|refresh|load|invalidate|revalidate|sync)[A-Za-z]*${escapeRe(noun)}s?[A-Za-z]*\\s*\\(`,
      "i",
    ).test(fnText),
  );
}

/**
 * A toast that announces a record the person cannot open.
 *
 * Skip contexts, each one a measured class rather than a guess:
 *  - a message this rule cannot read statically (built elsewhere);
 *  - a FAILED operation — nothing was created, so there is nothing to open, and
 *    naming the failure is the surface being honest;
 *  - a mutation that is not a creation and not a reference to a record
 *    elsewhere ("Note saved" is the note's own editor — the user is there);
 *  - a message naming no entity the live registry knows;
 *  - any call whose options argument this rule cannot read (assume a door).
 */
function classifyToastCall(
  call: ts.CallExpression,
  sf: ts.SourceFile,
  relPath: string,
  ctx: ScanContext,
  bindings: Set<string>,
): DeadEndFinding | null {
  if (bindings.size === 0) return null;

  let receiver: string | null = null;
  let method: string | null = null;
  if (ts.isPropertyAccessExpression(call.expression)) {
    receiver = rootIdentifier(call.expression.expression);
    method = call.expression.name.text;
  } else if (ts.isIdentifier(call.expression)) {
    // `toast("…")` — sonner's bare call, a `message` toast.
    receiver = call.expression.text;
    method = "message";
  }
  if (!receiver || !method) return null;
  if (!bindings.has(receiver)) return null;
  // `toast.custom` / `toast.promise` / `toast.dismiss` — nothing static to read.
  if (!TOAST_METHODS.has(method)) return null;

  // `recordToast.success(ref, message, options)` — the record ref comes first.
  const messageIndex = /recordToast$/.test(receiver) ? 1 : 0;
  const message = staticMessage(call.arguments[messageIndex]);
  if (!message) return null;

  const text = message.text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (TOAST_FAILED_RE.test(text)) return null;
  if (TOAST_INSTRUCTION_RE.test(text) || TOAST_PREREQUISITE_RE.test(text)) return null;
  if (TOAST_GONE_RE.test(text)) return null;
  // "added to the knowledge base" is the REFERENCE family, not a creation — and
  // reading it as one skipped the destination gate, so a note's own panel
  // announcing its own indexing read as a dead end.
  const creationText = text.replace(
    /\b(added|moved|saved|assigned|linked|attached) to\b/gi,
    " ",
  );
  const createdHere = TOAST_CREATION_VERB_RE.test(creationText);
  const elsewhere = TOAST_ELSEWHERE_PHRASE_RE.exec(message.flat.replace(/\s+/g, " "));
  if (!createdHere && !elsewhere) return null;

  const words = [
    ...expressionWords(text),
    ...message.interpolations.flatMap((i) => expressionWords(i)),
  ];
  const tokenInfo = inferToken(words, ctx.tokens);
  if (!tokenInfo) return null;

  // Reference family only: the record is the DESTINATION, so its noun has to
  // come after the phrase. Skipped when the toast also reports a creation —
  // "Created <note> and moved the note" names a record either way.
  if (!createdHere && elsewhere && !nounFollows(message.flat, elsewhere, tokenInfo.token)) {
    return null;
  }
  // Creation family: the sentence must say THIS record was created.
  if (createdHere && !verbNamesThisEntity(message.flat, tokenInfo.token)) {
    if (!elsewhere || !nounFollows(message.flat, elsewhere, tokenInfo.token)) return null;
  }

  // "added to THIS agent" / "saved to YOUR files" — a demonstrative or a
  // possessive means the surface's own subject or the user's own area, not a
  // second record they now cannot reach. Only skip when EVERY mention of the
  // noun is spoken that way: "Note created and linked to this event" names the
  // note plainly and must still report.
  if (everyMentionIsTheSurfacesOwn(text, tokenInfo.token)) return null;

  if (toastCallHasDoor(call, messageIndex)) return null;
  if (fileRendersRecordsOf(tokenInfo.token, sf.text)) return null;

  const fn = enclosingFunction(call);
  if (fn) {
    const fnText = fn.getText(sf);
    if (TOAST_HANDLER_NAVIGATES_RE.test(fnText)) return null;
    if (mutationResultIsRenderedHere(fn, sf)) return null;
    if (reloadsThisCollection(fnText, tokenInfo.token)) return null;
    if (!handlerCallsEntityMutation(fn, tokenInfo.token, ctx.tokens)) return null;
  }

  const pos = sf.getLineAndCharacterOfPosition(call.getStart(sf));
  return makeFinding({
    relPath,
    line: pos.line + 1,
    column: pos.character + 1,
    rule: "toast-names-record",
    severity: tokenInfo.hasRoute ? "high" : "medium",
    entity: tokenInfo.token,
    entityHasRoute: tokenInfo.hasRoute,
    expression: text.length > 120 ? `${text.slice(0, 117)}…` : text,
  });
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
  if (isIdGuardedFallback(node, property)) return null;

  // A name inside a loading/empty placeholder is not the real surface.
  if (isInPlaceholder(node, sf)) return null;

  const words = expressionWords(rawText);
  const tokenInfo = inferToken(words, ctx.tokens);
  const entity = tokenInfo?.token ?? `?${rootIdentifier(expr) ?? "unknown"}`;
  const entityHasRoute = tokenInfo?.hasRoute ?? false;
  const pos = sf.getLineAndCharacterOfPosition(expr.getStart(sf));
  const line = pos.line + 1;
  const column = pos.character + 1;

  // A door directly above the value, or one in the same rendered ROW. Splitting
  // the two matters: an ancestor door is certain, a row door is inferred from
  // an "Open"-shaped control beside the value, and a row door only counts when
  // it leads to the same entity (an app link in a row does not open the task).
  if (findDoorAncestor(node, rootIdentifier(expr))) return null;
  if (findRowDoor(node, sf, tokenInfo?.token ?? null, ctx)) return null;

  // ── Rule: bare id rendered as text ────────────────────────────────────────
  if (ID_PROPERTY_RE.test(property)) {
    // `key={x.id}` style is an attribute, already excluded by text position.
    //
    // There is deliberately NO `cellKind: "uuid"` escape here. It was tried as
    // a file-level regex and silenced every bare id in any file that happened
    // to configure one uuid column elsewhere. It was also unnecessary: a
    // `cellKind: "uuid"` column has no `cell:` renderer printing `{r.id}` in
    // JSX text, so it never produces a finding in the first place.
    // Ids that identify a UI thing, not a record: a request, a tab, a DOM node.
    if (NON_RECORD_ID_RE.test(property)) return null;
    // A naked `{id}` with no object root and no inferable entity is usually a
    // map key, a config slug, or an HTML element id — not a record identifier.
    if (!tokenInfo && !ts.isPropertyAccessExpression(unwrap(expr))) return null;
    const idRoot = rootIdentifier(expr);
    if (!tokenInfo && idRoot) {
      // These only apply when the expression names no entity — `instance` is a
      // transient runtime object, but `instance.agentId` still names an agent.
      //
      // `VAULT_LABELS.internalFieldId` — a SCREAMING_SNAKE constant map is a
      // caption table, not a record.
      if (/^[A-Z][A-Z0-9_]*$/.test(idRoot)) return null;
      // A transient runtime object's `.id` (a promise, a toast, a snapshot).
      if (NON_RECORD_ROOT_RE.test(idRoot)) return null;
    }
    // A bare `.id` on an object we cannot name is not evidence of a record.
    // `{r.task_id}` and `{lastFileId}` still report — they name their entity.
    if (!tokenInfo && property === "id") return null;
    // The record's OWN surface printing its OWN id (a detail page, an editor,
    // a confirm modal) is not a dead end — the user is already there.
    //
    // `id` / `uuid` ONLY. A FOREIGN key on the subject — `mandate.summary_agent_id`,
    // `instance.agentId` — points at a DIFFERENT record, and that is the
    // doctrine's own headline case: knowing the twin exists and not linking it
    // is worse than saying nothing. Never suppress those.
    if (isOwnIdentity(expr, property, ctx) && isSelfSubject(node, expr, sf)) return null;
    // "The task {taskId} could not be found." — there is no record to open.
    if (isInNotFoundMessage(node)) return null;
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
    // Only report when we could actually name the entity — an unnameable
    // `{x.label}` is chrome more often than a record reference. (This is also
    // the rule's biggest recall limit: a row bound to `r`/`item` names nothing
    // the expression text can resolve. See FEATURE.md § Known limits.)
    if (!tokenInfo) return null;
    const root = rootIdentifier(expr);
    if (!idIsInScope(root, rawText, scopeText, tokenInfo.token)) return null;
    if (isSelfSubject(node, expr, sf)) return null;
    // A name inside a sentence is copy, not a reference.
    if (isInProse(node, sf)) return null;
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
    // Three gates, in order of how much noise each removes. Without them this
    // rule scored 0/5 in an adversarial sample — every hit was a "Showing N of
    // M" label sitting directly above the list it counted.
    //
    // 1. Name the entity, or say nothing. `{entries.length} items` is chrome.
    if (!tokenInfo) return null;
    // 2. A count is only a door when the records are ELSEWHERE. If this file
    //    already renders the collection, the user can reach them by looking.
    const collection = rootIdentifier(expr);
    if (collection && rendersCollection(collection, scopeText)) return null;
    // 3. Result-count / pagination phrasing describes the view, not records,
    //    and a count inside a sentence ("You have 5 keywords but the limit
    //    is …") is copy.
    if (isPaginationPhrasing(node)) return null;
    if (isInProse(node, sf)) return null;
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
      FORMATTER_CALL_RE.test(cur.expression.name.text)
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

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The load-bearing precision gate. We flag a name only when the surface
 * provably holds THAT RECORD'S identity: `row.name` needs `row.id`, `row.uuid`,
 * or an id named for the same entity (`row.agent_id` for an `agent`).
 *
 * Scoping to the entity matters. Accepting any `<root>.<anything>Id` let
 * `requestId` on an in-flight upload satisfy the gate for a `file`, which is
 * how "Uploading {u.fileName}" got reported as a dead end.
 */
function idIsInScope(
  root: string | null,
  rawText: string,
  scopeText: string,
  token: string,
): boolean {
  const nouns = nounsForToken(token);
  const idNames = ["id", "uuid", ...nouns.flatMap((n) => [`${n}_id`, `${n}Id`])];
  const alternation = idNames.map(escapeRe).join("|");

  if (root) {
    const rootIdRe = new RegExp(`\\b${escapeRe(root)}\\??\\.(${alternation})\\b`);
    if (rootIdRe.test(scopeText)) return true;
  }
  // `{agentName}` destructured alongside `agentId`.
  const bare = rawText.replace(/^.*\./, "");
  const stem = bare.replace(/(Name|Title|Label)$/, "");
  if (stem && stem !== bare) {
    const stemRe = new RegExp(`\\b${escapeRe(stem)}(Id|_id)\\b`);
    if (stemRe.test(scopeText)) return true;
  }
  return false;
}

/** Does this file render the collection it is counting? */
function rendersCollection(collection: string, scopeText: string): boolean {
  const name = escapeRe(collection);
  // Iterated here, OR handed to a child component that renders it
  // (`<AgentPicker agents={agents} />`) — either way the records are on screen.
  const iterated = new RegExp(`\\b${name}\\??\\.(map|slice|forEach|flatMap)\\(`);
  const passedDown = new RegExp(`\\b[A-Za-z0-9_]+=\\{\\s*${name}\\s*\\}`);
  return iterated.test(scopeText) || passedDown.test(scopeText);
}

/**
 * True when the expression belongs to the surface's OWN subject — the record
 * whose detail page, editor or confirm dialog this is. Detected structurally:
 * the root identifier is bound by a parameter of the nearest enclosing
 * function that is NOT a `.map()` / `.filter()` row callback. A row callback's
 * parameter IS a per-record binding, so `{r.task_id}` inside `.map((r) => …)`
 * still reports.
 */
function isSelfSubject(node: ts.Node, expr: ts.Expression, sf: ts.SourceFile): boolean {
  const root = rootIdentifier(expr);
  if (!root) return false;

  // `selectedNote` / `activeAgent` / `editingTask` — a detail pane's subject,
  // bound from state rather than a parameter. The user is already on it.
  if (/^(selected|active|current|editing|viewing|chosen)[A-Z]/.test(root)) return true;

  // THE DOMINANT DETAIL-SURFACE SHAPE in this repo, and the one a parameter
  // check alone cannot see:
  //
  //   function AgentSettingsForm({ agentId }) {
  //     const agent = useAppSelector(selectAgent(agentId));   // subject: `agent`
  //
  // The parameter is the ID; the record is looked up from it. If the component
  // takes `<root>Id` as a prop, `<root>` is its subject — you are already on it.
  if (componentTakesIdFor(node, root)) return true;

  // Same shape with no props at all (`function ProjectManage()` reading the id
  // from the route): the record is fetched once at the top of the component and
  // never iterated. A subject, not a row.
  if (isUniqueSubjectBinding(node, root, sf)) return true;

  let cur: ts.Node | undefined = node;
  while (cur) {
    if (
      ts.isArrowFunction(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isFunctionDeclaration(cur)
    ) {
      // A ROW is not a subject. Three ways a function is a row renderer:
      // it is a `.map()` callback, it is a named helper handed to `.map()`
      // (`rows.map(renderRow)`), or its own JSX carries a `key`. Without this
      // the whole extracted-row-component idiom — `function NoteRow({ note })`
      // — was classified as "the note's own surface" and silenced.
      if (isIterationCallback(cur)) return false;
      if (isNamedRowRenderer(cur, sf)) return false;
      if (rendersKeyedElement(cur)) return false;
      if (isRenderedAsRow(cur, sf)) return false;
      if (cur.parameters.some((p) => bindsName(p.name, root))) return true;
      // Do NOT stop here. A nested helper, IIFE or local render callback that
      // does not bind the record still sits inside the component that does —
      // returning on the first enclosing function never reached it.
    }
    cur = cur.parent;
  }
  return false;
}

/**
 * Is this id the SUBJECT'S OWN identity, or a pointer to another record?
 *
 * Own:     `note.id`, `x.uuid`, a bare `{agentId}` (no object to be foreign to),
 *          `file.fileId` (property names the same entity as its object).
 * Foreign: `mandate.summary_agent_id`, `instance.agentId` — the object is one
 *          record and the property names a DIFFERENT one. Never suppress those:
 *          "I know your agent's twin exists" while not linking it is the
 *          doctrine's headline complaint.
 */
function isOwnIdentity(
  expr: ts.Expression,
  property: string,
  ctx: ScanContext,
): boolean {
  if (property === "id" || property === "uuid") return true;
  const root = rootIdentifier(expr);
  const unwrapped = unwrap(expr);
  // A bare identifier has no object it could be a foreign key of.
  if (!root || !ts.isPropertyAccessExpression(unwrapped)) return true;
  const rootToken = inferToken(expressionWords(root), ctx.tokens)?.token ?? null;
  const propToken = inferToken(expressionWords(property), ctx.tokens)?.token ?? null;
  return propToken === null || propToken === rootToken;
}

/** Does the enclosing component take `<root>Id` / `<root>_id` as a prop? */
function componentTakesIdFor(node: ts.Node, root: string): boolean {
  const wanted = [`${root}Id`, `${root}_id`, `${root}id`];
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (
      ts.isArrowFunction(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isFunctionDeclaration(cur)
    ) {
      if (isIterationCallback(cur)) return false;
      if (
        cur.parameters.some((p) =>
          wanted.some((name) => bindsName(p.name, name)),
        )
      ) {
        return true;
      }
    }
    cur = cur.parent;
  }
  return false;
}

/**
 * `const project = useProject(id)` / `useAppSelector(...)` at the top level of a
 * component, where nothing in the file iterates that variable. One record,
 * fetched once — the surface's subject.
 */
function isUniqueSubjectBinding(node: ts.Node, root: string, sf: ts.SourceFile): boolean {
  // Bound inside a row callback? Then it is a row, whatever it is called.
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      if (isIterationCallback(cur)) return false;
    }
    cur = cur.parent;
  }
  const name = escapeRe(root);
  // The two detail-fetch shapes: bound from a hook/selector, or held as the
  // component's own single-record state (`const [project, setProject] = …`).
  const fromHook = new RegExp(`\\bconst\\s+${name}\\s*=\\s*use[A-Z]\\w*\\(`);
  const fromState = new RegExp(`\\bconst\\s*\\[\\s*${name}\\s*,\\s*set[A-Z]\\w*\\s*\\]\\s*=`);
  if (!fromHook.test(sf.text) && !fromState.test(sf.text)) return false;
  // …and never iterated as a collection anywhere in the file.
  const iterated = new RegExp(`\\b${name}s?\\??\\.(map|flatMap|forEach)\\(|\\(\\s*${name}\\s*(,|\\)\\s*=>)`);
  return !iterated.test(sf.text);
}

/** `const renderRow = (row) => …` used as `rows.map(renderRow)`. */
function isNamedRowRenderer(fn: ts.Node, sf: ts.SourceFile): boolean {
  let name: string | null = null;
  if (ts.isFunctionDeclaration(fn) && fn.name) name = fn.name.text;
  else if (
    fn.parent &&
    ts.isVariableDeclaration(fn.parent) &&
    ts.isIdentifier(fn.parent.name)
  ) {
    name = fn.parent.name.text;
  }
  if (!name) return false;
  const re = new RegExp(
    `\\.(map|flatMap|forEach)\\(\\s*${escapeRe(name)}\\s*[,)]`,
  );
  return re.test(sf.text);
}

/**
 * Is this component rendered as a ROW somewhere — `<NoteRow key={n.id} …/>`?
 *
 * The extracted-row-component idiom puts the `key` at the CALLSITE, not inside
 * the component, so `rendersKeyedElement` cannot see it. Without this, a chip
 * or row that receives its record via props reads as that record's own surface
 * and its `{note.id}` goes silent — the same class the `.map()` and
 * named-helper tests exist to catch, just spelled differently.
 */
function isRenderedAsRow(fn: ts.Node, sf: ts.SourceFile): boolean {
  let name: string | null = null;
  if (ts.isFunctionDeclaration(fn) && fn.name) name = fn.name.text;
  else if (
    fn.parent &&
    ts.isVariableDeclaration(fn.parent) &&
    ts.isIdentifier(fn.parent.name)
  ) {
    name = fn.parent.name.text;
  }
  if (!name || !/^[A-Z]/.test(name)) return false;

  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    const opening = openingElementOf(n);
    if (opening && tagNameOf(opening) === name) {
      const hasKey = opening.attributes.properties.some(
        (a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === "key",
      );
      if (hasKey) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** Does this function return JSX carrying a `key`? Then it renders a row. */
function rendersKeyedElement(fn: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    // Do not descend into a nested function — that is a different renderer.
    if (n !== fn && (ts.isArrowFunction(n) || ts.isFunctionExpression(n))) return;
    const opening = openingElementOf(n);
    if (
      opening &&
      opening.attributes.properties.some(
        (a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === "key",
      )
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn, visit);
  return found;
}

function isIterationCallback(fn: ts.Node): boolean {
  const call = fn.parent;
  if (!call || !ts.isCallExpression(call)) return false;
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  return /^(map|flatMap|filter|forEach|find|reduce|some|every|sort)$/.test(
    call.expression.name.text,
  );
}

function bindsName(name: ts.BindingName, target: string): boolean {
  if (ts.isIdentifier(name)) return name.text === target;
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.some(
      (el) => ts.isBindingElement(el) && bindsName(el.name, target),
    );
  }
  return false;
}

/**
 * A door in the same rendered ROW rather than directly above the value —
 * `{row.name}` in one cell with an "Open" button in the next. Bounded to the
 * row/card container (the nearest ancestor carrying a `key`, else the nearest
 * enclosing function's JSX) so it can never mean "some door exists somewhere
 * in this 900-line file".
 *
 * The door must lead to the SAME entity. An `/p/{app_slug}` link in a row does
 * not open the row's task, and treating it as one would silence a real finding.
 */
function findRowDoor(
  node: ts.Node,
  sf: ts.SourceFile,
  token: string | null,
  ctx: ScanContext,
): boolean {
  const container = findRowContainer(node);
  if (!container) return false;

  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    const opening = openingElementOf(n);
    if (opening && isOpeningDoor(opening, sf)) {
      if (!token || doorTargetsToken(opening, sf, token, ctx)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(container);
  return found;
}

/**
 * The repeated ROW this value sits in — the nearest ancestor carrying a `key`,
 * or the JSX root of an iteration callback.
 *
 * Returns null when neither exists. Falling back to "the whole component" was
 * tried and is wrong: any Open/Edit button anywhere in a 300-line component
 * then counted as a door for every name in it, which silenced real findings
 * like a post-save "Saved to <note name>" banner.
 */
function findRowContainer(node: ts.Node): ts.Node | null {
  let cur: ts.Node | undefined = node.parent;
  let lastJsx: ts.Node | null = null;
  while (cur) {
    const opening = openingElementOf(cur);
    if (opening) {
      lastJsx = cur;
      const hasKey = opening.attributes.properties.some(
        (a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === "key",
      );
      if (hasKey) return cur;
    }
    if (
      ts.isArrowFunction(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isFunctionDeclaration(cur)
    ) {
      return isIterationCallback(cur) ? lastJsx : null;
    }
    cur = cur.parent;
  }
  return null;
}

function isOpeningDoor(
  el: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sf: ts.SourceFile,
): boolean {
  const tag = tagNameOf(el);
  // Affordance words are matched against what a HUMAN sees — label text and
  // title/aria-label — never the raw source. Reading the source made a row
  // variable named `view` ("view.role.label") look like a View button and
  // silenced a real finding.
  const text = humanTextOf(el, sf);
  if (CLOSING_AFFORDANCE_RE.test(text) && !OPEN_AFFORDANCE_RE.test(text)) return false;

  for (const attr of el.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
    const name = attr.name.text;
    if ((name === "href" || name === "to" || /Href$|Url$/.test(name)) &&
      !isDeadHref(attr)) {
      return true;
    }
  }
  if (tag && DOOR_TAGS.has(tag)) return true;

  const hasClick = el.attributes.properties.some(
    (a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === "onClick",
  );
  return hasClick && OPEN_AFFORDANCE_RE.test(text);
}

/**
 * The text a human actually reads on an element: its literal label text plus
 * `title` / `aria-label` / `alt` string values (template-literal heads count —
 * `title={`Run ${x}`}` reads as "Run"). Deliberately excludes identifiers.
 */
function humanTextOf(
  el: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sf: ts.SourceFile,
): string {
  const parts: string[] = [];

  for (const attr of el.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
    if (!/^(title|aria-label|alt|label)$/.test(attr.name.text)) continue;
    const init = attr.initializer;
    if (!init) continue;
    if (ts.isStringLiteral(init)) parts.push(init.text);
    else if (ts.isJsxExpression(init) && init.expression) {
      const value = init.expression;
      if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
        parts.push(value.text);
      } else if (ts.isTemplateExpression(value)) {
        parts.push(value.head.text);
        for (const span of value.templateSpans) parts.push(span.literal.text);
      }
    }
  }

  // Only a JsxOpeningElement's parent is its OWN element. A self-closing tag's
  // parent is the element CONTAINING it, so walking it collected the whole
  // surrounding row — one stray "Open tickets: 3" then made a delete icon read
  // as a door.
  const parent = ts.isJsxOpeningElement(el) ? el.parent : null;
  if (parent && ts.isJsxElement(parent)) {
    const collect = (node: ts.Node): void => {
      if (ts.isJsxText(node)) parts.push(node.text);
      else if (
        ts.isJsxExpression(node) &&
        node.expression &&
        ts.isStringLiteral(node.expression)
      ) {
        parts.push(node.expression.text);
      }
      ts.forEachChild(node, collect);
    };
    for (const child of parent.children) collect(child);
  }

  return parts.join(" ");
}

/** `learnMoreHref="#"` is a dead end wearing a door's clothes. */
function isDeadHref(attr: ts.JsxAttribute): boolean {
  const init = attr.initializer;
  if (!init) return true;
  if (ts.isStringLiteral(init)) return init.text.trim() === "" || init.text.trim() === "#";
  if (
    ts.isJsxExpression(init) &&
    init.expression &&
    ts.isStringLiteral(init.expression)
  ) {
    const value = init.expression.text.trim();
    return value === "" || value === "#";
  }
  return false;
}

/** Does the door's own source name the same entity as the finding? */
function doorTargetsToken(
  el: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sf: ts.SourceFile,
  token: string,
  ctx: ScanContext,
): boolean {
  const doorToken = inferToken(expressionWords(el.getText(sf)), ctx.tokens);
  return doorToken == null || doorToken.token === token;
}

/** Loading / empty placeholder arm — not the real surface. */
function isInPlaceholder(node: ts.Node, sf: ts.SourceFile): boolean {
  let cur: ts.Node | undefined = node.parent;
  for (let depth = 0; cur && depth < 4; depth++) {
    if (ts.isJsxElement(cur) && PLACEHOLDER_RE.test(cur.getText(sf))) return true;
    cur = cur.parent;
  }
  return false;
}

/**
 * A name embedded in a sentence — "Seeds a new personal shortcut for {name} on
 * …". Prose names its subject; it is not a reference list. Needs words on both
 * sides, which is what separates it from a table cell.
 *
 * Prettier emits `{" "}` between text runs, so a JsxText-only reading of the
 * siblings finds nothing — string-literal expressions count as text here.
 */
function isInProse(node: ts.JsxExpression, sf: ts.SourceFile): boolean {
  // Climb inline wrappers that carry no text of their own — the prose lives
  // one level up from `<span className="font-medium">{name}</span> will be …`.
  let subject: ts.Node = node;
  for (let depth = 0; depth < 3; depth++) {
    const wrapper = subject.parent;
    if (!wrapper || !ts.isJsxElement(wrapper)) break;
    const tag = tagNameOf(wrapper.openingElement);
    if (!tag || !INLINE_WRAPPER_TAGS.has(tag)) break;
    const meaningful = wrapper.children.filter(
      (c) => !(ts.isJsxText(c) && c.text.trim() === ""),
    );
    if (meaningful.length !== 1) break;
    subject = wrapper;
  }

  const parent = subject.parent;
  if (!parent || (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent))) return false;
  const children = parent.children;
  const idx = children.indexOf(subject as ts.JsxChild);

  const runAt = (offset: number): string => {
    for (let i = idx + offset; i >= 0 && i < children.length; i += offset) {
      const child = children[i];
      // Prose is often interrupted by an inline element — "The file <b>is</b>
      // {scope.name}'s". Read through those instead of giving up.
      const text = jsxChildText(child) ?? inlineElementText(child);
      if (text === null) return "";
      if (text.trim()) return text;
    }
    return "";
  };
  const wordCount = (text: string): number =>
    text.trim().split(/\s+/).filter(Boolean).length;

  const beforeText = runAt(-1);
  const before = wordCount(beforeText);
  const after = wordCount(runAt(1));

  // "Saved to {noteTitle}" is a REFERENCE, not prose — doctrine's own class.
  if (REFERENCE_VERB_RE.test(beforeText)) return false;

  // Mid-sentence: words on both sides.
  if (before >= 1 && after >= 1 && before + after >= 3) return true;
  // A short connective ("Resolved {x} × {y} — agent declares…") still reads as
  // prose when the whole element is a sentence.
  if (before >= 1 && after >= 1 && wordCount(elementText(parent)) >= 4) return true;
  // Sentence-initial: "{agentName} will be copied into the system agent
  // library." A table cell never carries five words of trailing copy.
  return before === 0 && after >= 5;
}

/** Literal text of an inline wrapper element (`<b>is</b>` → "is"). */
function inlineElementText(child: ts.JsxChild | undefined): string | null {
  if (!child || !ts.isJsxElement(child)) return null;
  const tag = tagNameOf(child.openingElement);
  if (!tag || !INLINE_WRAPPER_TAGS.has(tag)) return null;
  return elementText(child);
}

/** All literal text directly under a JSX element or fragment. */
function elementText(node: ts.Node): string {
  const parts: string[] = [];
  const collect = (n: ts.Node): void => {
    const text = ts.isJsxText(n) || ts.isJsxExpression(n) ? jsxChildText(n as ts.JsxChild) : null;
    if (text) parts.push(text);
    ts.forEachChild(n, collect);
  };
  ts.forEachChild(node, collect);
  return parts.join(" ");
}

/** Literal text of a JSX child, or null when the child is not text. */
function jsxChildText(child: ts.JsxChild | undefined): string | null {
  if (!child) return null;
  if (ts.isJsxText(child)) return child.text;
  if (
    ts.isJsxExpression(child) &&
    child.expression &&
    ts.isStringLiteral(child.expression)
  ) {
    return child.expression.text;
  }
  return null;
}

/** Is this expression inside copy that says the record is gone? */
function isInNotFoundMessage(node: ts.JsxExpression): boolean {
  let cur: ts.Node | undefined = node.parent;
  for (let depth = 0; cur && depth < 3; depth++) {
    if (
      (ts.isJsxElement(cur) || ts.isJsxFragment(cur)) &&
      NOT_FOUND_PHRASE_RE.test(elementText(cur))
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

/** "Showing {n} of {m} results" — a description of the view, not a reference. */
function isPaginationPhrasing(node: ts.JsxExpression): boolean {
  const parent = node.parent;
  if (!parent || (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent))) return false;
  // The whole element's literal text, not a 4-sibling window: "{a} projects ·
  // {b} tasks loaded" put the giveaway word three runs away.
  return PAGINATION_PHRASE_RE.test(elementText(parent));
}

function findDoorAncestor(node: ts.Node, root: string | null = null): string | null {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    const opening = openingElementOf(cur);
    if (opening) {
      const tag = tagNameOf(opening);
      if (tag && DOOR_TAGS.has(tag)) return tag;
      for (const attr of opening.attributes.properties) {
        if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) {
          const name = attr.name.text;
          if (!DOOR_ATTRS.has(name)) continue;
          // A click handler is a door only if it navigates. An accordion
          // toggle (`onClick={() => setExpanded(x)}`) is not, and treating it
          // as one silenced every finding inside the row it wrapped.
          if (name.startsWith("on")) {
            const body = attr.initializer?.getText() ?? "";
            // Either the handler is named for navigation, or it is handed THIS
            // record's id — `onClick={() => handleClick(file.id)}` IS the row
            // opening itself, whatever the callback happens to be called.
            const receivesThisId =
              root != null &&
              new RegExp(`\\b${escapeRe(root)}\\??\\.(id|uuid|\\w*(_id|Id))\\b`).test(body);
            if (!receivesThisId && !handlerNavigates(body)) continue;
          }
          return tag ?? name;
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
  // Prettier splits `{n} agents` into `{n}`, `{" "}`, `agents` — read forward
  // past whitespace-only text so the noun is still found.
  for (let i = idx + 1; i < children.length && i <= idx + 3; i++) {
    const text = jsxChildText(children[i]);
    if (text === null) break;
    const head = text.trim().split(/\s+/).slice(0, 2).join(" ");
    if (!head) continue;
    return COUNTABLE_NOUNS.test(head) ? head : null;
  }
  return null;
}

/**
 * Strip `!`, `(…)`, `?? fallback` AND the same formatter calls
 * `terminalProperty` strips, down to the underlying read. The two MUST agree:
 * when `unwrap` stopped at a `CallExpression` that `terminalProperty` had
 * already seen through, `{doc.id.slice(0, 8)}` was silently dropped.
 */
function unwrap(expr: ts.Expression): ts.Node {
  let cur: ts.Node = expr;
  for (let guard = 0; guard < 8; guard++) {
    if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isBinaryExpression(cur)) {
      cur = cur.left;
      continue;
    }
    if (
      ts.isCallExpression(cur) &&
      ts.isPropertyAccessExpression(cur.expression) &&
      FORMATTER_CALL_RE.test(cur.expression.name.text)
    ) {
      cur = cur.expression.expression;
      continue;
    }
    break;
  }
  return cur;
}

/**
 * True when this expression sits in the FALSE arm of a conditional whose test
 * is THE VERY FIELD being rendered — the honest "we have no id, so there is no
 * door" fallback. The reference implementation (`MandatesConsole`) writes
 * exactly this shape, and flagging it would teach agents to delete a correct
 * guard.
 *
 * It must be the same field, not merely an id-ish condition. Testing the
 * condition for "contains an Id suffix" also matched display flags —
 * `showAgentId`, `hasTaskId`, `includeOrgId` — which decide whether to RENDER
 * the id, not whether one exists. A real bare id in that arm then vanished from
 * both enforcers with nothing logged.
 *
 * The match is a whole-identifier, case-SENSITIVE one, which is what separates
 * the two cases: `taskId` does not occur in `hasTaskId` (the capital `T` breaks
 * it), and `task_id` does not occur in `has_task_id` (`_` is a word character,
 * so the boundary fails) — while `row.taskId` and `!taskId` both match.
 */
function isIdGuardedFallback(node: ts.Node, property: string): boolean {
  const sameField = new RegExp(`\\b${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  let child: ts.Node = node;
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isConditionalExpression(cur)) {
      const inFalseArm = isAncestorOf(cur.whenFalse, child);
      if (inFalseArm && sameField.test(cur.condition.getText())) return true;
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
 * surface, not just the source. Route groups `(x)` and mandate dirs `@x` drop out;
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
