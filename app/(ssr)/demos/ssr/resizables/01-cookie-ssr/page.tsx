import { Panel } from "react-resizable-panels";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { ClientGroup } from "../_lib/ClientGroup";
import { Handle } from "../_lib/Handle";
import { DemoTitle } from "../_lib/DemoTitle";
import { readLayoutCookie } from "../_lib/readLayoutCookie";

export const metadata = createRouteMetadata(
  "/demos/ssr/resizables/01-cookie-ssr",
  {
    title: "01 · Cookie-backed SSR persistence",
    description:
      "Server reads the cookie, passes defaultLayout, the smallest possible 'use client' wrapper writes on pointer-up.",
  },
);

const COOKIE_NAME = "panels:demo-01";

// SERVER COMPONENT. Reads the cookie at request time, passes Layout to the
// client wrapper as a serializable prop. Panels themselves are instantiated
// here (server) — their children are server too. The only client island is
// <ClientGroup>, because onLayoutChanged is a function and functions cannot
// cross the RSC boundary.
export default async function CookieSsrDemoPage() {
  const defaultLayout = await readLayoutCookie(COOKIE_NAME);

  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-0 p-0 min-w-0 w-full">
          <ChevronLeftTapButton
            href="/demos/ssr/resizables"
            variant="transparent"
            ariaLabel="Back"
          />
          <DemoTitle
            title="Demo 01 — cookie-backed SSR"
            subtitle="server reads · client writes on pointer-up · no flash on reload"
          />
        </div>
      </PageHeader>

      <div className="h-full overflow-hidden">
        <ClientGroup
          id="demo-01"
          cookieName={COOKIE_NAME}
          orientation="horizontal"
          defaultLayout={defaultLayout}
          className="h-full w-full"
        >
          <Panel id="left" defaultSize="20%" minSize="5%">
            <div className="h-full overflow-auto bg-muted px-4 pb-4 pt-[var(--shell-header-h)]">
              <h2 className="text-sm font-medium mb-2">Left</h2>
              <p className="text-xs text-muted-foreground">
                <code className="text-foreground">id=&quot;left&quot;</code> · default 20%
              </p>
            </div>
          </Panel>

          <Handle />

          <Panel id="center" defaultSize="60%" minSize="30%">
            <div className="h-full overflow-auto bg-card px-4 pb-4 pt-[var(--shell-header-h)]">
              <h2 className="text-sm font-medium mb-2">Center</h2>
              <p className="text-xs text-muted-foreground">
                <code className="text-foreground">id=&quot;center&quot;</code> · default 60%
              </p>
              <p className="mt-3 text-xs text-foreground/85">
                Drag a separator and reload — your sizes return because the
                cookie <code className="font-mono">{COOKIE_NAME}</code> is read
                server-side and seeded into <code>defaultLayout</code> before
                first paint.
              </p>
            </div>
          </Panel>

          <Handle />

          <Panel id="right" defaultSize="20%" minSize="5%">
            <div className="h-full overflow-auto bg-muted px-4 pb-4 pt-[var(--shell-header-h)]">
              <h2 className="text-sm font-medium mb-2">Right</h2>
              <p className="text-xs text-muted-foreground">
                <code className="text-foreground">id=&quot;right&quot;</code> · default 20%
              </p>
            </div>
          </Panel>
        </ClientGroup>
      </div>
    </>
  );
}
