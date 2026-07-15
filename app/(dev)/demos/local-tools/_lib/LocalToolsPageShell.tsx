"use client";

import type { ReactNode } from "react";
import { ConnectionBar } from "./ConnectionBar";
import { LocalToolsHeader } from "./LocalToolsHeader";
import { useMatrxLocalContext } from "./MatrxLocalContext";

interface LocalToolsPageShellProps {
  children: ReactNode;
  /** Optional strip between ConnectionBar and body (page-specific controls). */
  toolbar?: ReactNode;
  /** Pinned footer (e.g. hub connection info). */
  footer?: ReactNode;
  hideConnectionBar?: boolean;
  className?: string;
}

export function LocalToolsPageShell({
  children,
  toolbar,
  footer,
  hideConnectionBar = false,
  className = "bg-textured",
}: LocalToolsPageShellProps) {
  const local = useMatrxLocalContext();

  return (
    <>
      <LocalToolsHeader />
      <div
        className={`h-full flex flex-col overflow-hidden min-h-0 ${className}`}
      >
        {!hideConnectionBar && (
          <div className="shrink-0 border-b px-3 py-1">
            <ConnectionBar hook={local} />
          </div>
        )}
        {toolbar ? <div className="shrink-0 border-b">{toolbar}</div> : null}
        {children}
        {footer ? <div className="shrink-0">{footer}</div> : null}
      </div>
    </>
  );
}
