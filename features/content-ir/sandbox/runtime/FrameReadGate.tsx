/**
 * FrameReadGate — isolated Shape-frame read states.
 *
 * `ReadGate` normally reports a failed read through `ErrorNotice`, whose
 * Alchemy menu is a host-page capability. That menu reaches Next's dynamic
 * loader, the agent execution store, and the Supabase-backed action graph;
 * none can exist in the opaque no-network frame. The frame still preserves
 * the read contract: loading never becomes empty, failed reads stay failures,
 * stale rows are marked, and a supplied retry continues to be callable.
 *
 * The explicit frame note is intentional. The host owns the action menu, so a
 * Shape author is never led to believe this reduced presentation has the
 * host's context actions.
 */
import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";

export type ReadStatus = "loading" | "error" | "ready";

export interface ReadOutcome {
  status: ReadStatus;
  error?: unknown;
  onRetry?: (() => void) | undefined;
  what?: string | undefined;
}

type ReadLike = {
  status?: string | null;
  isLoading?: boolean;
  loading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  error?: unknown;
  refetch?: () => unknown;
  retry?: () => unknown;
};

export function readStatusOf(read: ReadLike): ReadStatus {
  if (
    read.isError ||
    (read.error != null && read.error !== false && read.error !== "")
  )
    return "error";
  if (read.status === "error" || read.status === "failed") return "error";
  if (
    read.isLoading ||
    read.loading ||
    read.status === "loading" ||
    read.status === "idle" ||
    read.status === "pending"
  )
    return "loading";
  return "ready";
}

export function readOf(
  read: ReadLike,
  options: { what?: string; onRetry?: () => void } = {},
): ReadOutcome {
  const again = options.onRetry ?? read.refetch ?? read.retry;
  return {
    status: readStatusOf(read),
    error: read.error ?? (read.isError ? true : undefined),
    ...(again ? { onRetry: () => void again() } : {}),
    ...(options.what ? { what: options.what } : {}),
  };
}

function FrameReadFailure({
  error,
  what,
  onRetry,
  className,
}: {
  error: unknown;
  what: string;
  onRetry?: (() => void) | undefined;
  className?: string;
}) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : `The read for ${what} failed, so nothing here is an answer — not "empty".`;
  return (
    <div
      role="alert"
      data-matrx-frame-read-failure=""
      className={`rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs ${className ?? "m-3"}`}
    >
      <p className="font-medium text-destructive">Couldn&apos;t load {what}</p>
      <p className="mt-0.5 break-words text-foreground">{message}</p>
      <p className="mt-1 text-muted-foreground">
        This isolated Shape frame cannot open the host page&apos;s action menu.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1 rounded border border-input px-2 py-1 text-xs"
        >
          <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Try again
        </button>
      ) : null}
    </div>
  );
}

export function ReadGate({
  read,
  status: statusProp,
  error: errorProp,
  what: whatProp,
  isEmpty,
  empty,
  loading,
  onRetry: onRetryProp,
  children,
}: {
  read?: ReadOutcome | undefined;
  status?: ReadStatus;
  error?: unknown;
  what?: string;
  isEmpty: boolean;
  empty: ReactNode;
  loading?: ReactNode;
  onRetry?: (() => void) | undefined;
  children: ReactNode;
}) {
  const status = statusProp ?? read?.status ?? "ready";
  const error = errorProp ?? read?.error;
  const what = whatProp ?? read?.what ?? "this list";
  const onRetry = onRetryProp ?? read?.onRetry;
  if (status === "error") {
    if (isEmpty)
      return (
        <FrameReadFailure error={error ?? true} what={what} onRetry={onRetry} />
      );
    return (
      <>
        {onRetry ? (
          <StaleDataNotice read={{ status, error, onRetry, what }} />
        ) : (
          <FrameReadFailure error={error ?? true} what={what} />
        )}
        {children}
      </>
    );
  }
  if (status === "loading" && isEmpty) {
    return (
      loading ?? (
        <div
          className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground"
          role="status"
          aria-busy="true"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Loading {what}…
        </div>
      )
    );
  }
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}

export function ReadEmpty({
  read,
  loading,
  children,
}: {
  read?: ReadOutcome | undefined;
  loading?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <ReadGate
      read={read}
      isEmpty
      empty={children ?? null}
      {...(loading === undefined ? {} : { loading })}
    >
      {null}
    </ReadGate>
  );
}

function StaleDataNotice({
  read,
  className,
}: {
  read: ReadOutcome;
  className?: string;
}) {
  const what = read.what ?? "this list";
  return (
    <div
      role="status"
      data-matrx-frame-stale-read=""
      className={`rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-foreground ${className ?? "mb-2"}`}
    >
      <p>
        The displayed {what} may be out of date because the latest read failed.
      </p>
      <p className="mt-1 text-muted-foreground">
        This isolated Shape frame cannot open the host page&apos;s action menu.
      </p>
      {read.onRetry ? (
        <button type="button" onClick={read.onRetry} className="ml-2 underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function ReadStaleNotice({
  read,
  className,
}: {
  read?: ReadOutcome | undefined;
  className?: string;
}) {
  if (read?.status !== "error") return null;
  const what = read.what ?? "this list";
  if (!read.onRetry)
    return (
      <FrameReadFailure
        error={read.error ?? true}
        what={what}
        className={className}
      />
    );
  return <StaleDataNotice read={read} className={className} />;
}
