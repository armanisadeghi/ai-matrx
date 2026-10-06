/**
 * Controllable host ports for the `chatHost` slice tests: identity, org and prefs a test can
 * change and that notify like a real port.
 */

import type {
  ChatIdentity,
  ChatIdentityPort,
  ChatOrganization,
  ChatOrgPort,
  ChatPrefsPort,
} from "../../host/contract";
import { createFakeDb } from "../../testing/fake-db";
import { resolveChatHost } from "../../host/configure";

export const PRIYA: ChatIdentity = {
  userId: "5f0c1e7a-3b52-4b8e-9a41-2d6f8c0e9b13",
  isAuthenticated: true,
  adminLevel: null,
  email: "priya.raman@harborlightdental.com",
  displayName: "Priya Raman",
  avatarUrl: null,
  accessToken: null,
  authReady: true,
  fingerprintId: null,
  name: null,
  preferredUsername: null,
  picture: null,
};

export const HARBOR_LIGHT: ChatOrganization = {
  id: "8b2d4f60-71c9-4e3a-b5d8-0a9e6c4f2b17",
  name: "Harbor Light Dental",
};

export function createTestPorts(initial: {
  identity: ChatIdentity;
  org: ChatOrganization | null;
  prefs?: Record<string, string>;
}) {
  let identity = initial.identity;
  let org = initial.org;
  const prefs = new Map(Object.entries(initial.prefs ?? {}));
  const identityListeners = new Set<() => void>();
  const orgListeners = new Set<() => void>();
  const prefListeners = new Set<(key: string) => void>();

  const identityPort: ChatIdentityPort = {
    current: () => identity,
    subscribe(listener) {
      identityListeners.add(listener);
      return () => identityListeners.delete(listener);
    },
    getAccessToken: async () => null,
  };
  const orgPort: ChatOrgPort = {
    active: () => org,
    subscribe(listener) {
      orgListeners.add(listener);
      return () => orgListeners.delete(listener);
    },
    require: async () => {
      if (!org) throw new Error("no organization");
      return org.id;
    },
  };
  const prefsPort: ChatPrefsPort = {
    get: (key) => prefs.get(key) ?? null,
    set(key, value) {
      prefs.set(key, value);
      prefListeners.forEach((l) => l(key));
    },
    remove(key) {
      prefs.delete(key);
      prefListeners.forEach((l) => l(key));
    },
    subscribe(listener) {
      prefListeners.add(listener);
      return () => prefListeners.delete(listener);
    },
    knob: (key, fallback) => (prefs.get(key) as never) ?? fallback,
    snapshot: () => Object.fromEntries(prefs),
  };

  const host = {
    db: createFakeDb().db,
    identity: identityPort,
    org: orgPort,
    prefs: prefsPort,
    server: { baseUrl: () => "https://server.app.matrxserver.com" },
  };
  return {
    host,
    resolved: resolveChatHost(host),
    setIdentity(next: ChatIdentity) {
      identity = next;
      identityListeners.forEach((l) => l());
    },
    setOrg(next: ChatOrganization | null) {
      org = next;
      orgListeners.forEach((l) => l());
    },
    prefs: prefsPort,
    listenerCount: () => identityListeners.size + orgListeners.size + prefListeners.size,
  };
}
