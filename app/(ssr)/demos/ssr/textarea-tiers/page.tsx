import { createRouteMetadata } from "@/utils/route-metadata";
import TextareaTiersDemo from "./_client";

export const metadata = createRouteMetadata("/demos/ssr/textarea-tiers", {
  title: "Textarea Tiers Demo",
  description:
    "The canonical textarea API: the bare shadcn Textarea, the feature-rich ProTextarea (with built-in floating label), and the Field wrapper for above-label form chrome.",
});

export default function TextareaTiersPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Textarea — canonical tiers
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Two textareas, one wrapper. No mega-component. Bare{" "}
            <code className="font-mono text-xs">Textarea</code> for raw cases;{" "}
            <code className="font-mono text-xs">ProTextarea</code> for user
            content; <code className="font-mono text-xs">Field</code> for
            above-label form chrome. Floating labels are baked into ProTextarea
            as a single string prop.
          </p>
        </header>
        <TextareaTiersDemo />
      </div>
    </div>
  );
}
