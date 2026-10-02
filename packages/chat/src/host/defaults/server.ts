/**
 * Default server port: the production AI Dream server; headers carry the
 * bearer token and the active organization.
 */

import type {
  ChatIdentityPort,
  ChatOrgPort,
  ChatServerPort,
} from "../contract";

export const DEFAULT_CHAT_SERVER_URL = "https://server.app.matrxserver.com";

export function createDefaultServer(
  identity: () => ChatIdentityPort,
  org: () => ChatOrgPort,
): ChatServerPort {
  return {
    baseUrl: () => DEFAULT_CHAT_SERVER_URL,
    async headers() {
      const headers: Record<string, string> = {};
      const token = await identity().getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const active = org().active();
      if (active) headers["X-Organization-Id"] = active.id;
      return headers;
    },
  };
}
