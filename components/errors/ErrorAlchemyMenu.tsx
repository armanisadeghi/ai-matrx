"use client";

/**
 * ErrorAlchemyMenu — the Alchemy Menu every error render carries.
 *
 * One compact `CopyButtons` pair (never a sibling copy control): Copy = the
 * sentence the person saw; Copy for AI = `buildErrorAlchemyPayload` with the
 * surface's declared values read at click time; plus an "Error with fix
 * request" variant that wraps the same payload in an instruction.
 *
 * `input` may be a function so a render whose text is only known in the DOM
 * (a destructive `Alert`) resolves it at the click, never at render.
 */
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  buildErrorAlchemyPayload,
  buildErrorFixPrompt,
  buildErrorHumanText,
  matchCapturedErrors,
  type ErrorAlchemyInput,
} from "@/components/errors/error-alchemy";
import { useErrorSurfaceSnapshot } from "@/components/errors/useErrorSurfaceSnapshot";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { getSnapshot as getCapturedErrors } from "@/lib/diagnostics/errorCaptureStore";

export type ErrorAlchemyMenuProps = {
  /**
   * The error. Omit it inside an existing `role="alert"` box: the menu then
   * reads the box's rendered words at the click (what the person sees, never
   * a re-derivation), with any `operation`/`records`/`unsavedInput` given here
   * layered on top.
   */
  input?: ErrorAlchemyInput | (() => ErrorAlchemyInput);
  operation?: string;
  records?: ErrorAlchemyInput["records"];
  unsavedInput?: unknown;
  error?: unknown;
  details?: Record<string, unknown>;
  /** The tables / RPCs this box's failed call used — pins the captured request. */
  calls?: readonly string[];
  size?: "xs" | "icon" | "sm";
  className?: string;
  /** The toast/alert label; defaults to the error's title. */
  label?: string;
};

/**
 * The input at the click, enriched with the structured errors the Error
 * Inspector captured on this page just before (code, HTTP status, relation,
 * request id) — the facts a rendered sentence drops (RC-B12 verify F7).
 */
function resolve(input: NonNullable<ErrorAlchemyMenuProps["input"]>): ErrorAlchemyInput {
  const base = typeof input === "function" ? input() : input;
  if (base.captured) return base;
  try {
    const captured = matchCapturedErrors(
      base.message,
      typeof window !== "undefined" ? window.location.pathname : null,
      getCapturedErrors(),
      Date.now(),
      base.calls,
    );
    return captured.length > 0 ? { ...base, captured } : base;
  } catch {
    return base;
  }
}

/**
 * The box this menu reports on: the element it sits in (every box puts the
 * menu inside itself), else the nearest alert region. Never "nothing" — a menu
 * with no box reads its parent (RC-B12 verify F8).
 */
export function errorRootFor(menu: Element | null): Element | null {
  if (!menu) return null;
  const marked = menu.closest('[role="alert"], [data-error-alchemy-root], [data-error-box], [data-error-notice]');
  if (marked) return marked;
  let el = menu.parentElement;
  const wordsBesideMenu = (node: Element) => {
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll("[data-error-alchemy-menu]").forEach((n) => n.remove());
    return (clone.textContent ?? "").trim();
  };
  while (el && !wordsBesideMenu(el) && el.parentElement) el = el.parentElement;
  // A short line may head a card — take that card only when the card is
  // itself an error box. Never an ordinary ancestor: that copies toolbars,
  // tabs and counters as the error (RC-B12 round 4).
  if (!el || isErrorBox(el) || wordsBesideMenu(el).length >= 80) return el;
  let card = el.parentElement;
  for (let hops = 0; card && card !== document.body && hops < 3; hops += 1, card = card.parentElement) {
    if (!isErrorBox(card)) continue;
    const cardWords = wordsBesideMenu(card);
    if (cardWords.length > wordsBesideMenu(el).length && cardWords.length <= 600) return card;
    break;
  }
  return el;
}

const ERROR_BOX_CLASS = /(^|\s)(?:(?:dark|sm|md|lg|xl|2xl):)*(?:border|bg|ring)-(?:destructive|red|rose|pink|fuchsia)(?:\b|-|\/)/;

/** An element that is itself an error box: an alert, a declared error root, or a destructive-styled box. */
export function isErrorBox(node: Element): boolean {
  if (node.matches('[role="alert"], [data-error-alchemy-root], [data-error-box], [data-error-notice]')) return true;
  const cls = node.getAttribute("class") ?? "";
  return ERROR_BOX_CLASS.test(cls);
}

export function ErrorAlchemyMenu({
  input: given,
  size = "xs",
  className,
  label,
  operation,
  records,
  unsavedInput,
  error,
  details,
  calls,
}: ErrorAlchemyMenuProps) {
  const surface = useErrorSurfaceSnapshot();
  const self = useRef<HTMLSpanElement | null>(null);
  const input: NonNullable<ErrorAlchemyMenuProps["input"]> =
    given ??
    (() => ({
      ...readRenderedError(errorRootFor(self.current)),
      source: "inline" as const,
      ...(operation ? { operation } : {}),
      ...(records ? { records } : {}),
      ...(unsavedInput !== undefined ? { unsavedInput } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(details ? { details } : {}),
    }));
  const withCalls = (base: ErrorAlchemyInput): ErrorAlchemyInput =>
    calls && !base.calls ? { ...base, calls } : base;
  const resolved: NonNullable<ErrorAlchemyMenuProps["input"]> = () =>
    withCalls(typeof input === "function" ? input() : input);
  const staticTitle = typeof input === "function" ? undefined : input.title;
  return (
    <span
      ref={self}
      data-error-alchemy-menu=""
      className={cn("inline-flex shrink-0", className)}
      onPointerEnter={surface.refresh}
      onFocus={surface.refresh}
    >
      <CopyButtons
        size={size}
        stopPropagation
        label={label ?? staticTitle ?? "Error"}
        human={() => buildErrorHumanText(resolve(resolved))}
        json={() => buildErrorAlchemyPayload(resolve(resolved), surface.read()).data}
        agent={() => buildErrorAlchemyPayload(resolve(resolved), surface.read())}
        agentVariant={{
          id: "error",
          label: "Error for AI",
          hint: "The error, what was attempted, the records, the page's declared values, and unsaved input",
          position: "first",
        }}
        aiVariants={[
          {
            id: "error-with-fix-request",
            label: "Error with fix request",
            hint: "The same error report wrapped in a diagnose-and-fix instruction",
            section: "ai",
            build: () =>
              buildErrorFixPrompt(resolve(resolved), surface.read(), {
                url: typeof window !== "undefined" ? window.location.href : undefined,
                route: typeof window !== "undefined" ? window.location.pathname : undefined,
              }),
          },
        ]}
      />
    </span>
  );
}

/**
 * Read an error render's text from the DOM at click time — for renders that
 * pass their words as children (a destructive `Alert`). The menu's own text is
 * excluded; a `[data-error-title]` / heading child becomes the title.
 */
const BLOCK_TAGS = new Set([
  "P", "DIV", "LI", "UL", "OL", "SECTION", "ARTICLE", "HEADER", "FOOTER", "PRE",
  "BLOCKQUOTE", "DD", "DT", "DL", "TR", "TABLE", "H1", "H2", "H3", "H4", "H5", "H6",
]);

/**
 * The words of a subtree, one entry per block element — `textContent` runs
 * sibling paragraphs together ("couldn't loadYour workspace…", RC-B12 R2-3).
 */
function blockTexts(root: Node): string[] {
  const blocks: string[] = [];
  let current = "";
  const flush = () => {
    const text = tidySentence(current.replace(/\s+/g, " ").trim());
    if (text) blocks.push(text);
    current = "";
  };
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      current += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).tagName;
    if (tag === "BR") {
      flush();
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) flush();
    node.childNodes.forEach(walk);
    if (block) flush();
  };
  walk(root);
  flush();
  return blocks;
}

/**
 * A render that writes `{error}.` after a message that already ends in a
 * full stop shows "try again.." — the copy says it once. A real ellipsis
 * ("...") stays (RC-B12 round 4).
 */
export function tidySentence(text: string): string {
  return text.replace(/(?<!\.)([.!?])\.(?!\.)/g, "$1");
}

/** Blocks joined as sentences: a block that ends without punctuation gets a period. */
function joinBlocks(blocks: string[]): string {
  return blocks
    .map((text, i) => (i < blocks.length - 1 && !/[.!?:;…]$/.test(text) ? `${text}.` : text))
    .join(" ");
}

export function readRenderedError(root: Element | null): ErrorAlchemyInput {
  if (!root) return { message: "An error is shown on this page.", source: "alert" };
  const clone = root.cloneNode(true) as Element;
  // The menu and the render's own controls (Retry, Dismiss…) are not the error.
  clone
    .querySelectorAll("[data-error-alchemy-menu], button, [role=button]")
    .forEach((n) => n.remove());
  const titleEl = clone.querySelector("[data-error-title], h1, h2, h3, h4, h5, h6");
  let title = titleEl ? joinBlocks(blockTexts(titleEl)) || undefined : undefined;
  titleEl?.remove();
  let blocks = blockTexts(clone);
  // No heading: a short first block followed by more is the box's title.
  if (!title && blocks.length > 1 && blocks[0].length <= 100) {
    title = blocks[0];
    blocks = blocks.slice(1);
  }
  const message = joinBlocks(blocks) || title || "An error is shown on this page.";
  return { title: message === title ? undefined : title, message, source: "alert" };
}
