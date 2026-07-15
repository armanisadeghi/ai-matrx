import {
  DISCOVERY_TIMEOUT,
  LOCAL_ENGINE_PROFILES,
  localEnginePrimaryPorts,
  localEngineProfileFromPort,
  localEngineScanPorts,
  type LocalEngineProfile,
} from "./constants";
import { supabase } from "@/utils/supabase/client";
import type { ConnectionInfo, HealthInfo } from "./types";

export interface LocalEngineDiscovery extends ConnectionInfo {
  profile: LocalEngineProfile;
  label: string;
  availableTools: string[];
  version: string | null;
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function engineFetch(url: string, opts: RequestInit): Promise<Response> {
  const res = await fetch(url, opts);
  if (res.status !== 401) return res;

  const { data } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;
  if (!token) return res;

  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers as Record<string, string>),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function probePort(port: number): Promise<LocalEngineDiscovery | null> {
  const profile = localEngineProfileFromPort(port);
  if (!profile) return null;

  const url = `http://127.0.0.1:${port}`;
  try {
    const healthRes = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT),
    });
    if (!healthRes.ok) return null;

    const healthData = (await healthRes.json().catch(() => ({}))) as HealthInfo;
    if (healthData.service && healthData.service !== "matrx-local") {
      return null;
    }
    if (healthData.status !== "ok" && healthData.status !== "healthy") {
      return null;
    }

    const authHeaders = await buildAuthHeaders();
    const toolsRes = await engineFetch(`${url}/tools/list`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(2000),
    });
    const availableTools: string[] = toolsRes.ok
      ? (((await toolsRes.json().catch(() => ({}))) as { tools?: string[] })
          .tools ?? [])
      : [];

    return {
      url,
      ws: `ws://127.0.0.1:${port}/ws`,
      port,
      profile,
      label: LOCAL_ENGINE_PROFILES[profile].label,
      availableTools,
      version: healthData.version ?? null,
    };
  } catch {
    return null;
  }
}

function sortDiscoveries(
  a: LocalEngineDiscovery,
  b: LocalEngineDiscovery,
): number {
  if (a.profile !== b.profile) {
    return a.profile === "live" ? -1 : 1;
  }
  return a.port - b.port;
}

async function discoverEnginesOnPorts(
  ports: number[],
): Promise<LocalEngineDiscovery[]> {
  const probes = ports.map((port) => probePort(port));
  const results = await Promise.all(probes);
  return results
    .filter((entry): entry is LocalEngineDiscovery => entry !== null)
    .sort(sortDiscoveries);
}

/** Fast startup scan: default live + default dev ports only. */
export async function discoverPrimaryLocalEngines(): Promise<
  LocalEngineDiscovery[]
> {
  return discoverEnginesOnPorts(localEnginePrimaryPorts());
}

/** Scan live (22140–22159) and dev (22240–22259) ranges; return every responding engine. */
export async function discoverAllLocalEngines(): Promise<
  LocalEngineDiscovery[]
> {
  return discoverEnginesOnPorts(localEngineScanPorts());
}

/** First engine in probe order (live range wins over dev). */
export async function discoverFirstLocalEngine(): Promise<LocalEngineDiscovery | null> {
  const all = await discoverAllLocalEngines();
  return all[0] ?? null;
}
