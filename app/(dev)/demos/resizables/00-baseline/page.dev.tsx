import { Group, Panel } from "react-resizable-panels";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";
import { Handle } from "../_lib/Handle";
import { DemoTitle } from "../_lib/DemoTitle";

export const metadata = createRouteMetadata("/demos/resizables/00-baseline", {
  title: "00 · Baseline 2-panel split",
  description:
    "Smallest possible v4 example: <Group> + <Panel> + <Separator> + <Panel>. No persistence, no client component.",
});

// SERVER COMPONENT. No 'use client'.
//
// <Group>, <Panel>, <Separator> all carry their own 'use client' inside the
// library. The page renders them directly from a Server Component as long as
// it doesn't pass any function props (functions can't cross the RSC boundary).
// For persistence (cookie writes via onLayoutChanged) we wrap <Group> in a
// 'use client' component — see demo 01-cookie-ssr.
export default function BaselineDemoPage() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-0 p-0 min-w-0 w-full">
          <ChevronLeftTapButton
            href="/demos/resizables"
            variant="transparent"
            ariaLabel="Back"
          />
          <DemoTitle
            title="Demo 00 — baseline"
            subtitle="2-panel split · no persistence · pure server component"
          />
        </div>
      </PageHeader>

      <div className="h-full overflow-hidden">
        <Group
          id="demo-baseline"
          orientation="horizontal"
          className="h-full w-full"
        >
          <Panel id="left" defaultSize="50%" minSize="20%">
            {/* static title at top — clear the header zone with pt */}
            <div className="h-full overflow-auto bg-muted px-4 pb-4 pt-[var(--shell-header-h)]">
              <h2 className="text-sm font-medium mb-2">Left panel</h2>
              <p className="text-xs text-muted-foreground">
                <code className="text-foreground">defaultSize=&quot;50%&quot;</code>{" "}
                <code className="text-foreground">minSize=&quot;20%&quot;</code>
              </p>
            </div>
          </Panel>

          <Handle />

          <Panel id="right" defaultSize="50%" minSize="20%">
            <div className="h-full overflow-auto bg-card px-4 pb-4 pt-[var(--shell-header-h)]">
              <h2 className="text-sm font-medium mb-2">Right panel</h2>
              <p className="text-xs text-muted-foreground">
                Drag the separator. Reload returns to default 50/50 (no
                persistence wired up in this demo).
              </p>
            </div>
          </Panel>
        </Group>
      </div>
    </>
  );
}
