"use client";

/**
 * HOST RE-EXPORT — the Alert implementation lives in
 * `@ai-matrx/design-system`.
 *
 * The package version grows the variant set to the full status vocabulary:
 * `default | destructive | warning | success | info`, all token-driven. Reach
 * for `variant="warning"` instead of hand-rolling an amber banner — that habit
 * (this file only ever had two variants) is why the 0.7.0 census found dozens
 * of literal-palette status divs across four repos.
 *
 * The ONE host addition: a `destructive` Alert is an error on screen, and every
 * error on screen carries the Alchemy Menu (`ErrorAlchemyMenu`) so the person
 * can hand an AI the exact sentence, the page's surface and its declared
 * values. The menu lives here — host side — because it needs the host's
 * surface registry; the package stays framework-neutral. Its text is read from
 * the rendered Alert at the click, so every existing caller inherits it with
 * no change.
 */

import * as React from "react";
import {
  Alert as PackageAlert,
  AlertDescription,
  AlertTitle,
  alertVariants,
  type AlertProps,
} from "@ai-matrx/design-system";
import {
  ErrorAlchemyMenu,
  readRenderedError,
} from "@/components/errors/ErrorAlchemyMenu";
import { cn } from "@/lib/utils";

type HostAlertProps = AlertProps & { ref?: React.Ref<HTMLDivElement> };

function DestructiveAlert({ className, children, ref, ...props }: HostAlertProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const setRoot = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  return (
    <PackageAlert
      {...props}
      ref={setRoot}
      variant="destructive"
      data-error-alchemy-root=""
      className={cn("pr-10", className)}
    >
      {children}
      <ErrorAlchemyMenu
        className="absolute right-2 top-2 !pl-0"
        input={() => readRenderedError(rootRef.current)}
      />
    </PackageAlert>
  );
}

export function Alert(props: HostAlertProps) {
  if (props.variant === "destructive") return <DestructiveAlert {...props} />;
  return <PackageAlert {...props} />;
}

export { AlertDescription, AlertTitle, alertVariants, type AlertProps };
