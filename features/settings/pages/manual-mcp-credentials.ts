import { headerFieldKey } from "@/features/agents/services/mcp-connections.service";

export interface ManualHeaderInput {
  name: string;
  value: string;
}

export interface ManualMcpCredentials {
  endpointOverride?: string;
  fields: Record<string, string>;
}

export function buildManualMcpCredentials(
  catalogEndpoint: string,
  endpointOverride: string,
  headers: ManualHeaderInput[],
): ManualMcpCredentials {
  const trimmedOverride = endpointOverride.trim();
  if (trimmedOverride) {
    const catalogUrl = new URL(catalogEndpoint);
    const overrideUrl = new URL(trimmedOverride);
    if (overrideUrl.protocol !== "https:") {
      throw new Error("The endpoint override must use HTTPS");
    }
    if (overrideUrl.hostname !== catalogUrl.hostname) {
      throw new Error(
        "The endpoint override must use the catalog provider host",
      );
    }
  }

  const fields: Record<string, string> = {};
  for (const header of headers) {
    const name = header.name.trim();
    const value = header.value.trim();
    if (!name && !value) continue;
    if (!name || !value) {
      throw new Error("Every custom header needs both a name and a value");
    }
    if (!/^[A-Za-z0-9-]+$/.test(name)) {
      throw new Error(`Invalid HTTP header name: ${name}`);
    }
    const key = headerFieldKey(name);
    if (key in fields) {
      throw new Error(`Duplicate HTTP header: ${name}`);
    }
    fields[key] = value;
  }
  if (Object.keys(fields).length === 0) {
    throw new Error("Add at least one custom header");
  }

  return {
    endpointOverride: trimmedOverride || undefined,
    fields,
  };
}
