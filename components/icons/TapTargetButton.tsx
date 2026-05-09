"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import Link from "next/link";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TapTargetButtonProps {
  icon?: React.ReactNode;
  children?: React.ReactNode;
  strokeWidth?: number;
  onClick?: () => void;
  className?: string;
  as?: "button" | "label";
  htmlFor?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /**
   * When set, the tap button renders as a link instead of a button.
   * - Internal hrefs (e.g. "/tasks") render via `next/link`.
   * - External hrefs (http://, https://, mailto:, tel:) render as `<a>`
   *   with `target="_blank"` and `rel="noopener noreferrer"` by default.
   * - When combined with `disabled`, the trigger renders as a non-navigable
   *   `<span aria-disabled="true">` with the same visual styling.
   */
  href?: string;
  /** Override target. Works on both internal Links and external anchors. */
  target?: "_blank" | "_self" | "_parent" | "_top";
  /** Override rel. Works on both internal Links and external anchors. */
  rel?: string;
  /** Forwarded to next/link. Pass `false` to disable Link prefetching. */
  prefetch?: boolean | null;
  /**
   * Tooltip text. Defaults to `ariaLabel` when omitted.
   * Pass `false` to explicitly disable the tooltip.
   */
  tooltip?: string | false;
  /** Tooltip placement. Defaults to "top". */
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Tooltip alignment along its side. Defaults to "center". */
  tooltipAlign?: "start" | "center" | "end";
}

interface TapTargetButtonSolidProps extends TapTargetButtonProps {
  bgColor?: string;
  iconColor?: string;
  hoverBgColor?: string;
  /**
   * Press-state background. Defaults to `active:brightness-90` which works on
   * any color. Override when using a custom `bgColor` that should darken to a
   * specific shade on press (e.g. `active:bg-primary/60`).
   */
  activeBgColor?: string;
}

const EXTERNAL_RE = /^(https?:|mailto:|tel:)/i;

function IconContent({
  icon,
  children,
  strokeWidth = 2,
  className,
}: Pick<
  TapTargetButtonProps,
  "icon" | "children" | "strokeWidth" | "className"
>) {
  if (icon) return <>{icon}</>;
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    >
      {children}
    </svg>
  );
}

interface RenderTriggerArgs {
  href?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
  prefetch?: boolean | null;
  as?: "button" | "label";
  htmlFor?: string;
  onClick?: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  outerClassName: string;
  children: ReactNode;
  rest?: ButtonHTMLAttributes<HTMLButtonElement>;
  buttonRef?: Ref<HTMLButtonElement>;
}

/**
 * Resolves the correct trigger element based on the props passed.
 *
 * - `href` + `disabled` → unclickable `<span aria-disabled>`
 * - `href` matching `http(s):|mailto:|tel:` → `<a target="_blank" rel="noopener noreferrer">`
 * - `href` (internal) → `next/link` `<Link>`
 * - `as="label"` → `<label htmlFor=...>`
 * - default → `<button>`
 */
function renderTrigger({
  href,
  target,
  rel,
  prefetch,
  as,
  htmlFor,
  onClick,
  ariaLabel,
  disabled,
  outerClassName,
  children,
  rest,
  buttonRef,
}: RenderTriggerArgs): ReactElement {
  if (disabled && href) {
    return (
      <span
        aria-disabled="true"
        aria-label={ariaLabel}
        className={`${outerClassName} opacity-40 pointer-events-none`}
      >
        {children}
      </span>
    );
  }
  if (href) {
    const isExternal = EXTERNAL_RE.test(href);
    if (isExternal) {
      return (
        <a
          href={href}
          target={target ?? "_blank"}
          rel={rel ?? "noopener noreferrer"}
          aria-label={ariaLabel}
          className={outerClassName}
        >
          {children}
        </a>
      );
    }
    return (
      <Link
        href={href}
        target={target}
        rel={rel}
        prefetch={prefetch}
        aria-label={ariaLabel}
        className={outerClassName}
      >
        {children}
      </Link>
    );
  }
  if (as === "label") {
    return (
      <label
        htmlFor={htmlFor}
        aria-label={ariaLabel}
        className={outerClassName}
      >
        {children}
      </label>
    );
  }
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      {...rest}
      className={outerClassName}
    >
      {children}
    </button>
  );
}

/**
 * Wraps a trigger element in a Tooltip when a tooltip label is available.
 * Falls back to `ariaLabel` when `tooltip` is not explicitly set. If both
 * are absent (or `tooltip === false`), the trigger is returned unwrapped.
 */
function withTooltip(
  trigger: ReactElement,
  {
    tooltip,
    ariaLabel,
    disabled,
    tooltipSide = "top",
    tooltipAlign = "center",
  }: {
    tooltip?: string | false;
    ariaLabel?: string;
    disabled?: boolean;
    tooltipSide?: "top" | "right" | "bottom" | "left";
    tooltipAlign?: "start" | "center" | "end";
  },
): ReactElement {
  if (tooltip === false) return trigger;
  const label =
    typeof tooltip === "string" && tooltip.length > 0 ? tooltip : ariaLabel;
  if (!label) return trigger;
  return (
    <TooltipPrimitive.Root>
      <TooltipTrigger asChild>
        {disabled ? (
          // Radix Tooltip triggers need a hoverable element; a disabled button
          // does not dispatch pointer events, so we wrap in a span for the
          // trigger target while keeping the disabled visual state.
          <span className="inline-flex">{trigger}</span>
        ) : (
          trigger
        )}
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} align={tooltipAlign}>
        {label}
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}

// CHANGE 2026-04-27: Press-feedback ownership moved from this outer wrapper
// onto the visible inner pill via `.matrx-tap-pill` (defined in styles/shell.css).
// Outer is now a static 44pt invisible touch target — no transition, no scale.
// If presses feel wrong (no shrink, no flash, jitter), check matrx-tap-pill in
// shell.css OR the inner-pill className of each variant below.
const TAP_OUTER_CLASS =
  "flex h-11 w-11 items-center justify-center bg-transparent group outline-none cursor-pointer disabled:opacity-40 disabled:pointer-events-none";

export const TapTargetButton = forwardRef<
  HTMLButtonElement,
  TapTargetButtonProps & ButtonHTMLAttributes<HTMLButtonElement>
>(function TapTargetButton(
  {
    icon,
    children,
    strokeWidth = 2,
    onClick,
    className,
    as,
    htmlFor,
    ariaLabel,
    disabled,
    href,
    target,
    rel,
    prefetch,
    tooltip,
    tooltipSide,
    tooltipAlign,
    ...rest
  },
  ref,
) {
  const color = className ?? "text-foreground";
  // CHANGE 2026-04-27: matrx-tap-pill replaces the prior `transition-colors`
  // and provides the press-down scale + mobile tap hygiene. Background-flash
  // on press still comes from `.shell-glass:active`.
  const inner = (
    <div className="matrx-tap-pill flex h-8 w-8 items-center justify-center rounded-full shell-glass-pill">
      <IconContent
        icon={icon}
        strokeWidth={strokeWidth}
        className={`w-4 h-4 ${color}`}
      >
        {children}
      </IconContent>
    </div>
  );
  const trigger = renderTrigger({
    href,
    target,
    rel,
    prefetch,
    as,
    htmlFor,
    onClick,
    ariaLabel,
    disabled,
    outerClassName: TAP_OUTER_CLASS,
    children: inner,
    rest,
    buttonRef: ref,
  });
  return withTooltip(trigger, {
    tooltip,
    ariaLabel,
    disabled,
    tooltipSide,
    tooltipAlign,
  });
});

export const TapTargetButtonTransparent = forwardRef<
  HTMLButtonElement,
  TapTargetButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function TapTargetButtonTransparent(
  {
    icon,
    children,
    strokeWidth = 2,
    onClick,
    className,
    as,
    htmlFor,
    ariaLabel,
    disabled,
    href,
    target,
    rel,
    prefetch,
    tooltip,
    tooltipSide,
    tooltipAlign,
    ...rest
  },
  ref,
) {
  const color = className ?? "text-foreground";
  // CHANGE 2026-04-27: matrx-tap-pill replaces the prior `transition-colors`.
  // `active:bg-muted-foreground/15` adds the press-bg-flash that was missing
  // on this variant — gives parity with glass/group. Hover bg is unchanged.
  const inner = (
    <div className="matrx-tap-pill flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted active:bg-muted-foreground/15">
      <IconContent
        icon={icon}
        strokeWidth={strokeWidth}
        className={`w-4 h-4 ${color}`}
      >
        {children}
      </IconContent>
    </div>
  );
  const trigger = renderTrigger({
    href,
    target,
    rel,
    prefetch,
    as,
    htmlFor,
    onClick,
    ariaLabel,
    disabled,
    outerClassName: TAP_OUTER_CLASS,
    children: inner,
    rest,
    buttonRef: ref,
  });
  return withTooltip(trigger, {
    tooltip,
    ariaLabel,
    disabled,
    tooltipSide,
    tooltipAlign,
  });
});

export const TapTargetButtonSolid = forwardRef<
  HTMLButtonElement,
  TapTargetButtonSolidProps & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function TapTargetButtonSolid(
  {
    icon,
    children,
    strokeWidth = 2,
    onClick,
    as,
    htmlFor,
    ariaLabel,
    disabled,
    href,
    target,
    rel,
    prefetch,
    bgColor = "bg-primary",
    iconColor = "text-primary-foreground",
    hoverBgColor = "hover:bg-primary/80",
    activeBgColor = "active:brightness-90",
    tooltip,
    tooltipSide,
    tooltipAlign,
    ...rest
  },
  ref,
) {
  // CHANGE 2026-04-27: matrx-tap-pill replaces the prior `transition-colors`.
  // `activeBgColor` (defaults to `active:brightness-90`) gives press-bg-flash
  // parity with glass/group. Override per-call when using a custom bgColor
  // that should darken to a specific shade (e.g. `active:bg-primary/60`).
  const inner = (
    <div
      className={`matrx-tap-pill flex h-8 w-8 items-center justify-center rounded-full ${bgColor} ${hoverBgColor} ${activeBgColor}`}
    >
      <IconContent
        icon={icon}
        strokeWidth={strokeWidth}
        className={`w-4 h-4 ${iconColor}`}
      >
        {children}
      </IconContent>
    </div>
  );
  const trigger = renderTrigger({
    href,
    target,
    rel,
    prefetch,
    as,
    htmlFor,
    onClick,
    ariaLabel,
    disabled,
    outerClassName: TAP_OUTER_CLASS,
    children: inner,
    rest,
    buttonRef: ref,
  });
  return withTooltip(trigger, {
    tooltip,
    ariaLabel,
    disabled,
    tooltipSide,
    tooltipAlign,
  });
});

const TAP_GROUP_OUTER_CLASS =
  "flex h-9 w-9 items-center justify-center bg-transparent group outline-none disabled:opacity-40 disabled:pointer-events-none";

export const TapTargetButtonForGroup = forwardRef<
  HTMLButtonElement,
  TapTargetButtonProps & ButtonHTMLAttributes<HTMLButtonElement>
>(function TapTargetButtonForGroup(
  {
    icon,
    children,
    strokeWidth = 2,
    onClick,
    className,
    as,
    htmlFor,
    ariaLabel,
    disabled,
    href,
    target,
    rel,
    prefetch,
    tooltip,
    tooltipSide,
    tooltipAlign,
    ...rest
  },
  ref,
) {
  const color = className ?? "text-foreground";
  // CHANGE 2026-04-27: matrx-tap-pill replaces the prior inline
  // `transition-[background,transform] active:scale-95` so this variant shares
  // the same timing curve and scale as glass/transparent/solid. Background
  // flash on press still comes from `.shell-glass:active`.
  const inner = (
    <div className="matrx-tap-pill flex h-6 w-6 items-center justify-center rounded-full shell-glass-interactive">
      <IconContent
        icon={icon}
        strokeWidth={strokeWidth}
        className={`w-4 h-4 ${color}`}
      >
        {children}
      </IconContent>
    </div>
  );
  const trigger = renderTrigger({
    href,
    target,
    rel,
    prefetch,
    as,
    htmlFor,
    onClick,
    ariaLabel,
    disabled,
    outerClassName: TAP_GROUP_OUTER_CLASS,
    children: inner,
    rest,
    buttonRef: ref,
  });
  return withTooltip(trigger, {
    tooltip,
    ariaLabel,
    disabled,
    tooltipSide,
    tooltipAlign,
  });
});

export function TapTargetButtonGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        className
          ? `relative inline-flex h-9 items-center ${className}`
          : "relative inline-flex h-9 items-center"
      }
    >
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 rounded-full shell-glass-pill" />
      <div className="relative flex items-center">{children}</div>
    </div>
  );
}
