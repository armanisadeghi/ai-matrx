"use client";

/**
 * The one way a people list says its roster read went wrong (RC-B12 round 12).
 * - Nothing read (`error`, no rows): the failure, with the Alchemy Menu and a retry.
 * - Some organizations read and some did not (`partialFailures`): the rows stay,
 *   and a StaleDataNotice names who is missing — never a silently short list.
 * Renders nothing when the read was whole.
 */
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { StaleDataNotice } from "@ai-matrx/design-system";
import {
  describeConnectionFailures,
  type ConnectionReadFailure,
} from "@/features/messaging/hooks/useUserConnections";

export function ConnectionsReadNotice({
  error,
  partialFailures,
  hasRows,
  onRetry,
  what = "your contacts",
  className,
}: {
  error: string | null;
  partialFailures: ConnectionReadFailure[];
  hasRows: boolean;
  onRetry: () => void;
  what?: string;
  className?: string;
}) {
  if (error && !hasRows) {
    return <ReadFailure error={error} what={what} onRetry={onRetry} className={className ?? "m-2"} />;
  }
  if (partialFailures.length > 0) {
    return (
      <StaleDataNotice
        hasData
        partial
        what={describeConnectionFailures(partialFailures)}
        detail={partialFailures.map((f) => `${f.source}: ${f.error}`).join("; ")}
        onRetry={onRetry}
        className={className ?? "my-2"}
      />
    );
  }
  return null;
}
