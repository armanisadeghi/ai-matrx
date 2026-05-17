import { SurfacesContainer } from "@/features/surfaces/components/SurfacesContainer";

export const metadata = {
  title: "UI Surfaces | Tool Registry | Administration",
  description:
    "Admin for ui_surface — table-driven search/filter, per-surface detail panel with overview, declared SurfaceValues, agent and tool bindings, code-manifest drift report, and one-click Sync Manifests to apply code declarations to the database.",
};

export default function Page() {
  return <SurfacesContainer />;
}
