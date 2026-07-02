// utils/supabase/debugClient.ts
//
// API keys: this file uses ONLY the new sb_publishable_* key.
// The legacy JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in
// this repo — do not reintroduce it (ESLint will block it).
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { requireEnv } from "@/utils/supabase/env";

export const createClient = () =>
  createBrowserClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  );

function logParams(label: string, params: unknown) {
  console.log(`-- ${label} Parameters:`);
  console.dir(params, { depth: null });
}

function logResults(label: string, data: unknown, error?: unknown) {
  console.log(`-- ${label} Results:`);
  console.dir(data, { depth: null });
  if (error) {
    console.dir(error, { depth: null });
  }
}

export const createDebugClient = () => {
  const client = createBrowserClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  );

  // MATRX-EXCEPTION: dev-only logging proxy wraps every method of the
  // Supabase client dynamically (`.from`, `.rpc`, `.schema`, ...); the
  // Supabase client's method surface isn't a fixed shape this proxy can
  // declare statically, so the trap stays typed against `object`/`unknown`
  // rather than the concrete client interface.
  const handler: ProxyHandler<object> = {
    get(target, prop) {
      const original = Reflect.get(target, prop);

      if (typeof original === "function") {
        return (...args: unknown[]) => {
          logParams(`Supabase.${String(prop)}`, args);
          const result = (original as (...a: unknown[]) => unknown).apply(target, args);

          if (result instanceof Promise) {
            return result
              .then((res: { data?: unknown; error?: unknown }) => {
                logResults(`Supabase.${String(prop)}`, res?.data, res?.error);
                return res;
              })
              .catch((err: unknown) => {
                console.error(`Supabase.${String(prop)} - Error:`, err);
                throw err;
              });
          }

          logResults(`Supabase.${String(prop)}`, result);
          return result;
        };
      }

      return original;
    },
  };

  return new Proxy(client, handler);
};

// Export both clients
export const supabaseStandard = createClient();
export const supabaseDebug = createDebugClient();
