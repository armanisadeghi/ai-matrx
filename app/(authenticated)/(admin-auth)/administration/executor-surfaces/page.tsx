import { ExecutorSurfacesContainer } from "@/features/tool-registry/executor-surfaces/components/ExecutorSurfacesContainer";

export const metadata = {
  title: "Tool Runtimes | Tool Registry | Administration",
  description:
    "Tools per runtime — for each runtime (matrx-extend.browser, mcp.*, server:*), see which tools are available and which auto-load on launch.",
};

export default function Page() {
  return <ExecutorSurfacesContainer />;
}
