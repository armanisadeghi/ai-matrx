import { KgInspector } from "@/features/administration/kg-inspector/components/KgInspector";

export const metadata = {
  title: "KG Inspector · Administration",
  description:
    "Read-only viewer for knowledge-graph entities, mentions, and edges (NER data-quality inspection).",
};

export default function Page() {
  return <KgInspector />;
}
