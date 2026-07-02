// utils/supabase/env.ts
//
// Shared env-var guard for the Supabase client constructors in this folder.
// `process.env.X!` silently produces `undefined.trim()` (a cryptic runtime
// TypeError) when a var is missing; this throws a clear, named error instead
// — the honest narrow the type-safety doctrine requires in place of `!`.
//
// The caller MUST pass the value as a STATIC member access
// (`process.env.NEXT_PUBLIC_X`). Next.js inlines NEXT_PUBLIC_* into client
// bundles ONLY for static accesses — a dynamic `process.env[name]` lookup
// inside this helper is undefined in the browser and threw for every
// client-side Supabase client (app-wide GlobalError on fresh compiles).

/** Trims a required env var's statically-read value, throwing a clear named error if unset. */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}
