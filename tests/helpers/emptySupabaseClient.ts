/**
 * `jest.mock("@/utils/supabase/client", ...)` for suites that never talk to a database but
 * import code that builds `@ai-matrx/associations` at module load (features/scopes/service/
 * associationsService.ts). That store REFUSES a `dataSource` with no `rpc`/`schema`, so a bare
 * `{ supabase: {} }` dies at import. Here the port has them, and any actual call fails loudly,
 * naming that the suite reached for a database it never configured.
 */
function unconfigured(member: string) {
  return () => {
    throw new Error(`supabase.${member} was called in a suite that configured no database`);
  };
}

export function emptySupabaseClient() {
  return {
    rpc: unconfigured("rpc"),
    schema: unconfigured("schema"),
    from: unconfigured("from"),
  };
}

export function emptySupabaseClientModule() {
  const supabase = emptySupabaseClient();
  return { supabase, createClient: () => supabase };
}
