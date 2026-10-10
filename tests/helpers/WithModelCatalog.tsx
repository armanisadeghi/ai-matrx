/**
 * The model-picker provider every suite needs when it renders a surface that draws a
 * model badge/picker (`useModelCatalog()` throws without `<ModelCatalogProvider>` above it).
 *
 * The REAL package catalog and favorites run; only the database client under them is the
 * double, and it answers the model reads with no rows. So a badge for an unknown model
 * correctly renders nothing — the suite is never handed a stand-in catalog that claims models exist.
 */
import type { ReactNode } from "react";
import { ModelCatalogProvider } from "@ai-matrx/agents/models/react";
import { createModelCatalog, createModelFavorites } from "@ai-matrx/agents/models";

type PgResult = { data: unknown; error: null };
const empty: PgResult = { data: [], error: null };
const query = (): PromiseLike<PgResult> & Record<string, unknown> => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq"]) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  q.then = (resolve: (r: PgResult) => unknown) => Promise.resolve(empty).then(resolve);
  return q as PromiseLike<PgResult> & Record<string, unknown>;
};
const client = {
  rpc: () => Promise.resolve(empty),
  schema: () => ({ from: () => query() }),
};

const catalog = createModelCatalog({ client: client as never });
const favorites = createModelFavorites({ client: (() => client) as never });

export function WithModelCatalog({ children }: { children: ReactNode }) {
  return (
    <ModelCatalogProvider catalog={catalog} favorites={favorites}>
      {children}
    </ModelCatalogProvider>
  );
}
