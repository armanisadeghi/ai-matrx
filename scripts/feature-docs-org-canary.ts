/**
 * FD-T01 canary. It is deliberately inert without --run, --cleanup, or the
 * post-retirement --negative-probe. Positive writes use syncOneFeatureDoc;
 * the negative probe is raw by design so it can prove DB NOT NULL enforcement.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import {
  buildFeatureDocInsert,
  createFeatureDocsStore,
  syncOneFeatureDoc,
  type SyncOperation,
} from "./sync-feature-docs";
import type { Database } from "@/types/database.types";

const SYSTEM_ORG = "39c38960-d30c-4840-b0c1-c9960de95582";
type CanaryMode = "run" | "cleanup" | "negative-probe";
type RawFeatureDocIdentity = {
  id: string;
  path: string;
  organization_id: string;
};

function parseMode(args: readonly string[]): CanaryMode {
  const modes: CanaryMode[] = ["run", "cleanup", "negative-probe"];
  const selected = modes.filter((mode) => args.includes(`--${mode}`));
  if (selected.length !== 1)
    throw new Error(
      "Use exactly one canary mode: --run, --cleanup <id> <path>, or post-retirement --negative-probe.",
    );
  return selected[0];
}

function assertRawFeatureDocIdentity(
  value: unknown,
  label: string,
): asserts value is RawFeatureDocIdentity {
  const id =
    value && typeof value === "object" ? Reflect.get(value, "id") : null;
  const path =
    value && typeof value === "object" ? Reflect.get(value, "path") : null;
  const organizationId =
    value && typeof value === "object"
      ? Reflect.get(value, "organization_id")
      : null;
  if (
    !value ||
    typeof value !== "object" ||
    typeof id !== "string" ||
    typeof path !== "string" ||
    typeof organizationId !== "string"
  )
    throw new Error(
      `${label} did not return an id, path, and organization_id.`,
    );
}

async function rawFeatureDocsRequest(
  url: string,
  key: string,
  path: string,
  init: RequestInit,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(
    `${url.replace(/\/$/, "")}/rest/v1/feature_docs${path}`,
    {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Profile": "admin",
        "Accept-Profile": "admin",
        ...init.headers,
      },
    },
  );
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

function oneRawIdentity(body: unknown, label: string): RawFeatureDocIdentity {
  if (!Array.isArray(body) || body.length !== 1)
    throw new Error(`${label} expected exactly one returned row.`);
  const [identity] = body;
  assertRawFeatureDocIdentity(identity, label);
  return identity;
}

async function cleanUnexpectedNegativeProbeRow(
  url: string,
  key: string,
  identity: RawFeatureDocIdentity,
): Promise<void> {
  const predicate = new URLSearchParams({
    id: `eq.${identity.id}`,
    path: `eq.${identity.path}`,
    organization_id: `eq.${identity.organization_id}`,
  }).toString();
  const deleted = await rawFeatureDocsRequest(url, key, `?${predicate}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!deleted.response.ok)
    throw new Error(
      `--negative-probe cleanup failed with HTTP ${deleted.response.status}.`,
    );
  const deletedIdentity = oneRawIdentity(
    deleted.body,
    "--negative-probe cleanup",
  );
  if (
    deletedIdentity.id !== identity.id ||
    deletedIdentity.path !== identity.path ||
    deletedIdentity.organization_id !== identity.organization_id
  )
    throw new Error("--negative-probe cleanup returned a different row.");

  const verification = await rawFeatureDocsRequest(url, key, `?${predicate}`, {
    method: "GET",
    headers: { Prefer: "return=representation" },
  });
  if (!verification.response.ok)
    throw new Error(
      `--negative-probe cleanup verification failed with HTTP ${verification.response.status}.`,
    );
  if (!Array.isArray(verification.body) || verification.body.length !== 0)
    throw new Error("--negative-probe cleanup left the unexpected row behind.");
}

async function runNegativeProbe(
  url: string,
  key: string,
  operation: SyncOperation,
): Promise<void> {
  const path = `__org_canary__/fd-t01-negative-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}/FEATURE.md`;
  const content = readFileSync(
    resolve("features/feature-docs/FEATURE.md"),
    "utf8",
  );
  const { organization_id: _omittedOrganizationId, ...payload } =
    buildFeatureDocInsert(operation, path, content);
  const insert = await rawFeatureDocsRequest(url, key, "", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (insert.response.ok) {
    const identity = oneRawIdentity(
      insert.body,
      "--negative-probe unexpected insert",
    );
    await cleanUnexpectedNegativeProbeRow(url, key, identity);
    throw new Error(
      `--negative-probe unexpectedly inserted ${identity.id}; cleanup by id, path, and organization succeeded.`,
    );
  }
  const errorCode =
    insert.body && typeof insert.body === "object"
      ? Reflect.get(insert.body, "code")
      : undefined;
  if (errorCode !== "23502")
    throw new Error(
      `--negative-probe expected PostgreSQL 23502 after default retirement, received ${typeof errorCode === "string" ? errorCode : "no error"}.`,
    );
  console.log(JSON.stringify({ path, expected_error_code: "23502", rows: 0 }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = parseMode(args);
  loadEnv({ path: ".env.local" });
  loadEnv({ path: ".env" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin credentials.");
  const supabase = createClient<Database>(url, key);
  const store = createFeatureDocsStore(supabase);
  const operation: SyncOperation = {
    organizationId: SYSTEM_ORG,
    gitHead: "fd-t01-canary",
  };
  if (mode === "run") {
    const path = `__org_canary__/fd-t01-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}/FEATURE.md`;
    const content = readFileSync(
      resolve("features/feature-docs/FEATURE.md"),
      "utf8",
    );
    const row = await syncOneFeatureDoc(store, operation, path, content);
    console.log(
      JSON.stringify({
        id: row.id,
        path: row.path,
        organization_id: row.organization_id,
      }),
    );
  } else if (mode === "cleanup") {
    const [id, path] = args.filter((arg) => !arg.startsWith("--"));
    if (!id || !path || !path.startsWith("__org_canary__/"))
      throw new Error(
        "--cleanup requires the returned id and __org_canary__ path.",
      );
    const row = await store.delete(id, SYSTEM_ORG, path);
    console.log(
      JSON.stringify({
        id: row.id,
        path: row.path,
        organization_id: row.organization_id,
      }),
    );
  } else {
    await runNegativeProbe(url, key, operation);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
