"use client";

import { cloneElement, isValidElement } from "react";

import { TapTargetButton, TapTargetButtonTransparent } from "@ai-matrx/tap-target";
import type { TableToolbarActionProps } from "@ai-matrx/design-system/data-table/host";

type TableToolbarActionWithActiveProps = TableToolbarActionProps & { active?: boolean };

const PAGE_LABEL_CLASS = "!h-auto !w-auto min-w-0 max-w-7 overflow-hidden text-ellipsis whitespace-nowrap text-center text-xs leading-none tabular-nums";
const LONG_PAGE_LABEL_CLASS = "text-[11px]";

function tableActionContent(children: TableToolbarActionProps["children"]) {
  // TapTarget's IconContent applies `.matrx-tap-icon` to every element passed
  // as `icon`. A page number is text, not a glyph: reset that 14px geometry,
  // keep it inside the primitive's 28px pill, and let the button's existing
  // Page N tooltip provide the full value for an exceptionally long number.
  const pageLabelClass = (value: string | number) =>
    `${PAGE_LABEL_CLASS} ${String(value).length > 3 ? LONG_PAGE_LABEL_CLASS : ""}`;

  if (typeof children === "string" || typeof children === "number") {
    return <span className={pageLabelClass(children)}>{children}</span>;
  }

  if (!isValidElement<{ className?: string; children?: unknown }>(children)) {
    return children;
  }

  if (typeof children.type !== "string" || children.type === "svg") {
    return cloneElement(children, {
      className: `![height:var(--matrx-table-action-icon-size,1.25rem)] ![width:var(--matrx-table-action-icon-size,1.25rem)] ${children.props.className ?? ""}`,
    });
  }

  const content = children.props.children;
  const isText = typeof content === "string" || typeof content === "number";
  return cloneElement(children, {
    className: `${isText ? pageLabelClass(content) : PAGE_LABEL_CLASS} ${children.props.className ?? ""}`,
  });
}

/** The application implementation of the shared table toolbar action port. */
export function TableToolbarAction({
  ariaLabel,
  tooltip,
  disabled = false,
  busy = false,
  active = false,
  onClick,
  children,
}: TableToolbarActionWithActiveProps) {
  const icon = tableActionContent(children);
  return (
    active ? (
      <TapTargetButton
        ariaLabel={ariaLabel}
        tooltip={tooltip ?? ariaLabel}
        disabled={disabled}
        aria-busy={busy || undefined}
        aria-current="page"
        onClick={onClick}
        icon={icon}
      />
    ) : (
      <TapTargetButtonTransparent
        ariaLabel={ariaLabel}
        tooltip={tooltip ?? ariaLabel}
        disabled={disabled}
        aria-busy={busy || undefined}
        onClick={onClick}
        icon={icon}
      />
    )
  );
}
