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
  type ErrorAlchemyInput,
} from "@/components/errors/error-alchemy";
import { useErrorSurfaceSnapshot } from "@/components/errors/useErrorSurfaceSnapshot";
import { cn } from "@/lib/utils";

export type ErrorAlchemyMenuProps = {
  input: ErrorAlchemyInput | (() => ErrorAlchemyInput);
  size?: "xs" | "icon" | "sm";
  className?: string;
  /** The toast/alert label; defaults to the error's title. */
  label?: string;
};

function resolve(input: ErrorAlchemyMenuProps["input"]): ErrorAlchemyInput {
  return typeof input === "function" ? input() : input;
}

export function ErrorAlchemyMenu({
  input,
  size = "xs",
  className,
  label,
}: ErrorAlchemyMenuProps) {
  const surface = useErrorSurfaceSnapshot();
  const staticTitle = typeof input === "function" ? undefined : input.title;
  return (
    <span
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
