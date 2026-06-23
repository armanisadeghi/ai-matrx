import { cookies } from "next/headers";
import type { Layout } from "react-resizable-panels";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";
import { MountStateProvider } from "./MountStateProvider";
import { ConditionalHeaderControls } from "./HeaderControls";
import { ConditionalGroup } from "./ConditionalGroup";

export const metadata = createRouteMetadata(
  "/demos/resizables/05-conditional-panels",
  {
    title: "05 · Conditional panels (mount / unmount)",
    description:
      "Right panel is mounted vs unmounted (not just collapsed). Each combination of mounted panels remembers its own layout.",
  },
);

const TOGGLE_COOKIE = "panels:demo-05:toggles";
const GROUP_ID = "demo-05";

interface Toggles {
  showRight: boolean;
}

function buildLayoutCookieKey(panelIds: string[]) {
  // Matches the library's auto-save key format so reads and writes line up.
  return `react-resizable-panels:${[GROUP_ID, ...panelIds].join(":")}`;
}

async function readState(): Promise<{
  showRight: boolean;
  initialLayout: Layout | undefined;
}> {
  const store = await cookies();

  const togglesRaw = store.get(TOGGLE_COOKIE)?.value;
  let showRight = true;
  if (togglesRaw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(togglesRaw)) as Toggles;
      showRight = !!parsed.showRight;
    } catch {}
  }

  const panelIds = ["left", "center", ...(showRight ? ["right"] : [])];
  const layoutRaw = store.get(buildLayoutCookieKey(panelIds))?.value;
  let initialLayout: Layout | undefined;
  if (layoutRaw) {
    try {
      initialLayout = JSON.parse(decodeURIComponent(layoutRaw)) as Layout;
    } catch {}
  }

  return { showRight, initialLayout };
}

// SERVER COMPONENT. Reads BOTH the toggle cookie AND the matching combination's
// layout cookie so the SSR pass mounts the right set of panels with the right
// flex-grow values. Without the layout read, server renders auto-distributed
// sizes and the client recomputes from the cookie → hydration mismatch.
export default async function ConditionalPanelsPage() {
  const { showRight, initialLayout } = await readState();

  return (
    <MountStateProvider
      initialShowRight={showRight}
      toggleCookie={TOGGLE_COOKIE}
    >
      <PageHeader>
        <ConditionalHeaderControls />
      </PageHeader>

      <div className="h-full overflow-hidden">
        <ConditionalGroup initialLayout={initialLayout} />
      </div>
    </MountStateProvider>
  );
}
