/**
 * /rag/data-stores — per-user data store management.
 *
 * Counterpart to the admin surface in dashboard/. Both surfaces talk to
 * the same rag.data_stores + rag.data_store_members tables; RLS scopes
 * what each user sees.
 */

import { DataStoresPage } from "@/features/rag/components/data-stores/DataStoresPage";

export default function Page() {
  return <DataStoresPage />;
}
