/**
 * Peek contract.
 *
 * A "peek" is a quick read-only preview of one resource, opened from a resource
 * row's right-click menu. Every kind's peek component takes exactly this shape,
 * so the registry can treat them uniformly.
 */
export interface PeekProps {
  /** The resource id to preview. */
  id: string;
  /** Whether the peek is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
}
