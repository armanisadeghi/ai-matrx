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
  const marked = menu.closest('[role="alert"], [data-error-alchemy-root], [data-error-box]');
  if (marked) return marked;
  let el = menu.parentElement;
  const wordsBesideMenu = (node: Element) => {
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll("[data-error-alchemy-menu]").forEach((n) => n.remove());
    return (clone.textContent ?? "").trim();
  };
  while (el && !wordsBesideMenu(el) && el.parentElement) el = el.parentElement;
  // A title alone ("Couldn't load the saved artifact") reads better with the
  // sentence beside it: take the small card it heads, never a whole page.
  const parent = el?.parentElement;
  if (el && parent && parent !== document.body && wordsBesideMenu(el).length < 80) {
    const cardWords = wordsBesideMenu(parent);
    if (cardWords.length > wordsBesideMenu(el).length && cardWords.length <= 600) return parent;
  }
  return el;
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
        human={() => buildErrorHumanText(resolve(input))}
        json={() => buildErrorAlchemyPayload(resolve(input), surface.read()).data}
        agent={() => buildErrorAlchemyPayload(resolve(input), surface.read())}
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
              buildErrorFixPrompt(resolve(input), surface.read(), {
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
export function readRenderedError(root: Element | null): ErrorAlchemyInput {
  if (!root) return { message: "An error is shown on this page.", source: "alert" };
  const clone = root.cloneNode(true) as Element;
  // The menu and the render's own controls (Retry, Dismiss…) are not the error.
  clone
    .querySelectorAll("[data-error-alchemy-menu], button, [role=button]")
    .forEach((n) => n.remove());
  const titleEl = clone.querySelector("[data-error-title], h1, h2, h3, h4, h5, h6");
  const title = titleEl?.textContent?.trim() || undefined;
  titleEl?.remove();
  const message =
    (clone.textContent ?? "").replace(/\s+/g, " ").trim() ||
    title ||
    "An error is shown on this page.";
  return { title: message === title ? undefined : title, message, source: "alert" };
}
