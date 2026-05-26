import { LookupsAdminPage } from "@/features/tool-registry/lookups/components/LookupsAdminPage";

export const metadata = {
  title: "Lookups | Tool Registry | Administration",
  description:
    "Admin CRUD for the tool-registry lookup tables: ui_client, ui_surface, tl_executor_kind, tl_gate.",
};

export default function Page() {
  return <LookupsAdminPage />;
}
