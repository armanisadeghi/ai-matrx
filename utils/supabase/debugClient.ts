// utils/supabase/debugClient.ts
//
// API keys: this file uses ONLY the new sb_publishable_* key.
// The legacy JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in
// this repo — do not reintroduce it (ESLint will block it).
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(),
  );

function logParams(label: string, params: any) {
  console.log(`-- ${label} Parameters:`);
  console.dir(params, { depth: null });
}

function logResults(label: string, data: any, error?: any) {
  console.log(`-- ${label} Results:`);
  console.dir(data, { depth: null });
  if (error) {
    console.dir(error, { depth: null });
  }
}

export const createDebugClient = () => {
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(),
  );

  const handler = {
    get(target: any, prop: string) {
      const original = target[prop];

      if (typeof original === "function") {
        return (...args: any[]) => {
          logParams(`Supabase.${prop}`, args);
          const result = original.apply(target, args);

          if (result instanceof Promise) {
            return result
              .then((res: any) => {
                logResults(`Supabase.${prop}`, res?.data, res?.error);
                return res;
              })
              .catch((err: any) => {
                console.error(`Supabase.${prop} - Error:`, err);
                throw err;
              });
          }

          logResults(`Supabase.${prop}`, result);
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
