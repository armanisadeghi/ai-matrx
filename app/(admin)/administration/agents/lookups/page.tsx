import { LookupsAdminPage } from "@/features/tool-registry/lookups/components/LookupsAdminPage";

export const metadata = {
  title: "Lookups | Tool Registry | Administration",
  description:
    "Admin CRUD for the tool-registry lookup tables: ui.ui_client, ui.ui_surface, tool.executor.",
};

export default function Page() {
  return <LookupsAdminPage />;
}
