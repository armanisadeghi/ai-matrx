/**
 * One live connection from this browser to one device, straight to the relay (Vercel is never in
 * the path). The token rides the WebSocket subprotocol and is re-read on every (re)connect; every
 * session refresh hands the relay the new one without dropping the socket (relay.reauth); and the
 * client comes back the instant the person does (page visible, bfcache restore, network back).
 * Terminals survive drops: the client reattaches them with since_seq.
 */

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createDesktopClient } from "@ai-matrx/desktop-protocol/client";
import type { DesktopClient, DesktopClientState } from "@ai-matrx/desktop-protocol/client";
import type { RelayDeviceStatusEvent } from "@ai-matrx/desktop-protocol";
import { useDesktopWake } from "@ai-matrx/desktop-protocol/react";

import { supabase } from "@/utils/supabase/client";
import { getAccessTokenOrNull } from "@/lib/python-client";

import { consoleStatus } from "./connection";
import type { ConsoleStatus } from "./connection";
import { relayConnectUrl, relaySubprotocols } from "./relay";

/** Reported to the device in hello; the relay and the Mac log it. */
const CLIENT_VERSION = "web-1";

async function requireToken(): Promise<string> {
  const token = await getAccessTokenOrNull();
  if (!token) throw new Error("Not signed in");
  return token;
}

export interface DeviceConnection {
  client: DesktopClient;
  state: DesktopClientState;
  /** The relay's last word on the device itself (online, since when, its app version). */
  device: RelayDeviceStatusEvent | null;
  status: ConsoleStatus;
}

/** Mount once per device (key the caller by deviceId). Connects on mount, closes on unmount. */
export function useDeviceClient(deviceId: string): DeviceConnection {
  const [client] = useState<DesktopClient>(() =>
    createDesktopClient({
      url: relayConnectUrl(deviceId),
      protocols: async () => relaySubprotocols(await requireToken()),
      getToken: requireToken,
      clientType: "web",
      clientVersion: CLIENT_VERSION,
    }),
  );
  const [device, setDevice] = useState<RelayDeviceStatusEvent | null>(null);
  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);

  useEffect(() => {
    const off = client.on("relay.device_status", (payload) => setDevice(payload));
    client.connect();
    return () => {
      off();
      client.close();
    };
  }, [client]);

  // Every refreshed session token goes to the relay at once, so an hour-long terminal never drops.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session?.access_token) client.reauth(session.access_token);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  useDesktopWake(client);

  return { client, state, device, status: consoleStatus(state, device) };
}
