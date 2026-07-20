export interface GoogleDiscoveryHealth {
  status: "connected" | "needs_attention";
  lastError: string | null;
  metadata: {
    discovery: {
      search_console: "ready" | "unavailable";
      analytics: "ready" | "unavailable";
    };
    discovery_warning_count: number;
  };
}

export function googleDiscoveryHealth(
  searchConsoleReady: boolean,
  analyticsReady: boolean,
): GoogleDiscoveryHealth {
  const warningCount = Number(!searchConsoleReady) + Number(!analyticsReady);
  const noProviderReady = !searchConsoleReady && !analyticsReady;
  return {
    status: noProviderReady ? "needs_attention" : "connected",
    lastError: noProviderReady
      ? "Google connected, but no provider properties could be discovered. Reconnect to retry."
      : null,
    metadata: {
      discovery: {
        search_console: searchConsoleReady ? "ready" : "unavailable",
        analytics: analyticsReady ? "ready" : "unavailable",
      },
      discovery_warning_count: warningCount,
    },
  };
}
