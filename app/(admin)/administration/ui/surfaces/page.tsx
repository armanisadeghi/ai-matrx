import { SurfacesContainer } from "@/features/surfaces/components/SurfacesContainer";

export const metadata = {
  title: "UI Surfaces | Administration",
  description:
    "Every page and window agents can work on: readiness, bound agents and tools, declared values, and the sync between code manifests and the database.",
};

export default function Page() {
  return <SurfacesContainer />;
}
