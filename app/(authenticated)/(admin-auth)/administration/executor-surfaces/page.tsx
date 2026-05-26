import { ExecutorSurfacesContainer } from "@/features/tool-registry/executor-surfaces/components/ExecutorSurfacesContainer";

export const metadata = {
  title: "Executor Surfaces | Tool Registry | Administration",
  description:
    "Manage tl_executor bindings — which tools are available on each runtime (matrx-extend.browser, mcp.*, server:*) and which auto-load on launch.",
};

export default function Page() {
  return <ExecutorSurfacesContainer />;
}
