/**
 * A kind frame has no access to the host page's surface registry or route.
 * The error menu remains available, but its payload explicitly says that
 * surface values are unavailable inside this isolated frame.
 */
import type { ErrorSurfaceSnapshot } from "@/components/errors/error-alchemy";

const FRAME_SNAPSHOT: ErrorSurfaceSnapshot = {
  surfaceName: null,
  label: null,
  status: "unregistered",
  declared: [],
  values: null,
  note: "This error is inside an isolated Shape frame; the host page's surface values are unavailable here.",
};

export function useErrorSurfaceSnapshot(): {
  read: () => ErrorSurfaceSnapshot;
  refresh: () => void;
} {
  return {
    read: () => FRAME_SNAPSHOT,
    refresh: () => {},
  };
}
