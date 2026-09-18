/**
 * How often the dock re-asks its sources. One minute: fast enough that an
 * outage or a suspension reaches the screen while it is still the thing going
 * wrong, slow enough that it is one cheap read per source per minute per open
 * super-admin tab. Focus and every write of the dock's own also refetch.
 */
// KNOB MIRROR of platform.feature_knob "platform.attention" "poll_ms" — a React Query
// refetchInterval on a render path. Change the row, then re-mirror this literal.
export const ATTENTION_POLL_MS = 60_000;
