/**
 * Shape frames have no Agents chrome, so they cannot disclose a fixed mandate
 * into the host's menu. The host page owns that declaration; this keeps the
 * ordinary CopyButtons compatibility path frame-safe without importing the
 * manifest registry or its application state.
 */
export function useAlchemyDisclosure(_enabled = true): void {
  void _enabled;
}
