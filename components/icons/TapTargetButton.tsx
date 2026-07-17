"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import Link from "next/link";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
  /**
   * Visible caption rendered inline after the icon (`[icon Label]`).
   * Widens the pill automatically. Tooltip defaults to off when set — the
   * label is self-describing. Visible text becomes the accessible name.
   */
  label?: string;
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

// Geometry + press feedback + tap hygiene are the SINGLE SOURCE OF TRUTH in
// app/globals.css (the `.matrx-tap-*` family). This component only picks the
// right class and layers each variant's decoration on top.
const TAP_OUTER_CLASS = "matrx-tap-target group";
const TAP_GROUP_OUTER_CLASS = "matrx-tap-target matrx-tap-target-sm group";

function IconContent({
  icon,
  children,
  strokeWidth = 2,
  className,
}: Pick<
  TapTargetButtonProps,
  "icon" | "children" | "strokeWidth" | "className"
>) {
  if (icon) {
    if (isValidElement<{ className?: string }>(icon)) {
      return cloneElement(icon, {
        className: cn(className, icon.props.className),
      });
    }
    return <span className={className}>{icon}</span>;
  }
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

type TapTargetSize = "default" | "sm";

function resolveTapGeometry(label: string | undefined, size: TapTargetSize) {
  const inline = Boolean(label);
  if (size === "sm") {
    return {
      outerClassName: inline
        ? "matrx-tap-target matrx-tap-target-sm matrx-tap-target-inline-sm group"
        : TAP_GROUP_OUTER_CLASS,
      inlineModifier: "matrx-tap-pill-inline-sm",
    };
  }
  return {
    outerClassName: inline
      ? `${TAP_OUTER_CLASS} matrx-tap-target-inline`
      : TAP_OUTER_CLASS,
    inlineModifier: "matrx-tap-pill-inline",
  };
}

function buildTapInner({
  label,
  pillClassName,
  iconClassName,
  labelClassName,
  inlineModifier,
  icon,
  children,
  strokeWidth = 2,
}: {
  label?: string;
  pillClassName: string;
  iconClassName: string;
  labelClassName?: string;
  inlineModifier: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  strokeWidth?: number;
}) {
  const iconEl = (
    <IconContent
      icon={icon}
      strokeWidth={strokeWidth}
      className={iconClassName}
    >
      {children}
    </IconContent>
  );
  const pillClasses = label
    ? `${pillClassName} ${inlineModifier}`.trim()
    : pillClassName;

  if (!label) {
    return <div className={pillClasses}>{iconEl}</div>;
  }

  return (
    <div className={pillClasses}>
      {iconEl}
      <span className={labelClassName ?? "matrx-tap-label"}>{label}</span>
    </div>
  );
}

interface RenderTapTargetArgs extends Pick<
  TapTargetButtonProps,
  | "icon"
  | "children"
  | "strokeWidth"
  | "label"
  | "onClick"
  | "as"
  | "htmlFor"
  | "ariaLabel"
  | "disabled"
  | "href"
  | "target"
  | "rel"
  | "prefetch"
  | "tooltip"
  | "tooltipSide"
  | "tooltipAlign"
> {
  size?: TapTargetSize;
  pillClassName: string;
  iconClassName: string;
  labelClassName?: string;
  rest?: ButtonHTMLAttributes<HTMLButtonElement>;
  buttonRef?: Ref<HTMLButtonElement>;
}

function renderTapTarget({
  size = "default",
  pillClassName,
  iconClassName,
  labelClassName,
  icon,
  children,
  strokeWidth,
  label,
  onClick,
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
  rest,
  buttonRef,
}: RenderTapTargetArgs): ReactElement {
  const { outerClassName, inlineModifier } = resolveTapGeometry(label, size);
  const inner = buildTapInner({
    label,
    pillClassName,
    iconClassName,
    labelClassName,
    inlineModifier: label ? inlineModifier : "",
    icon,
    children,
    strokeWidth,
  });
  const resolvedTooltip =
    tooltip !== undefined ? tooltip : label ? false : undefined;
  const triggerAriaLabel = label ? undefined : ariaLabel;
  const trigger = renderTrigger({
    href,
    target,
    rel,
    prefetch,
    as,
    htmlFor,
    onClick,
    ariaLabel: triggerAriaLabel,
    disabled,
    outerClassName,
    children: inner,
    rest,
    buttonRef,
  });
  return withTooltip(trigger, {
    tooltip: resolvedTooltip,
    ariaLabel: triggerAriaLabel,
    disabled,
    tooltipSide,
    tooltipAlign,
  });
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
      type="button"
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

// To resize/retune every tap button in the app, edit globals.css — not here.

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
    label,
    ...rest
  },
  ref,
) {
  const color = className ?? "text-foreground";
  return renderTapTarget({
    icon,
    children,
    strokeWidth,
    onClick,
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
    label,
    pillClassName: "matrx-tap-pill matrx-glass-thin-border",
    iconClassName: `matrx-tap-icon ${color}`,
    rest,
    buttonRef: ref,
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
    label,
    ...rest
  },
  ref,
) {
  const color = className ?? "text-foreground";
  return renderTapTarget({
    icon,
    children,
    strokeWidth,
    onClick,
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
    label,
    pillClassName:
      "matrx-tap-pill hover:bg-muted active:bg-muted-foreground/15",
    iconClassName: `matrx-tap-icon ${color}`,
    rest,
    buttonRef: ref,
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
    label,
    ...rest
  },
  ref,
) {
  return renderTapTarget({
    icon,
    children,
    strokeWidth,
    onClick,
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
    label,
    pillClassName: `matrx-tap-pill ${bgColor} ${iconColor} ${hoverBgColor} ${activeBgColor}`,
    iconClassName: `matrx-tap-icon ${iconColor}`,
    labelClassName: `matrx-tap-label ${iconColor}`,
    rest,
    buttonRef: ref,
  });
});

/** Solid destructive pill — delete/remove actions. White-on-red like the
 *  primary solid is white-on-blue (see /demos/button-demo). Use THIS, never
 *  hand-pass bg-destructive with the default (dark) icon color. */
export const TapTargetButtonDestructive = forwardRef<
  HTMLButtonElement,
  TapTargetButtonSolidProps & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function TapTargetButtonDestructive(
  {
    bgColor = "bg-destructive",
    iconColor = "text-destructive-foreground",
    hoverBgColor = "hover:bg-destructive/90",
    ...rest
  },
  ref,
) {
  return (
    <TapTargetButtonSolid
      ref={ref}
      bgColor={bgColor}
      iconColor={iconColor}
      hoverBgColor={hoverBgColor}
      {...rest}
    />
  );
});

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
    label,
    ...rest
  },
  ref,
) {
  const color = className ?? "text-foreground";
  return renderTapTarget({
    size: "sm",
    icon,
    children,
    strokeWidth,
    onClick,
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
    label,
    pillClassName: "matrx-tap-pill matrx-tap-pill-sm matrx-glass-interactive",
    iconClassName: `matrx-tap-icon ${color}`,
    labelClassName: `matrx-tap-label ${color}`,
    rest,
    buttonRef: ref,
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
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-7 rounded-full matrx-glass-thin-border" />
      {/* min-w-0 lets flexible children (e.g. a truncating filename) shrink
          under container pressure; fixed-size tap buttons are unaffected. */}
      <div className="relative flex min-w-0 items-center">{children}</div>
    </div>
  );
}
