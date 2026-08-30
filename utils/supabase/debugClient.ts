// utils/supabase/debugClient.ts — the dev-only logging proxy.
//
// Construction and the shared cross-subdomain auth cookie live in
// @ai-matrx/data/next (bound in utils/supabase/authCookie.ts); the only thing
// this file owns is the logging Proxy.

import { supabaseNext } from "@/utils/supabase/authCookie";

export const createClient = () => supabaseNext.browserClient();

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
  const client = supabaseNext.browserClient();

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
