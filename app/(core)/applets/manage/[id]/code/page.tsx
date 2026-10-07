import { getApplet } from "@/lib/applets/data";
import { AppletHeader } from "@/features/applets/components/route-header/AppletHeader";
import { AppletEditPageClient } from "./AppletEditPageClient";

interface CodePageProps {
  params: Promise<{ id: string }>;
}

export default async function AppletCodePage({ params }: CodePageProps) {
  const { id } = await params;
  const app = await getApplet(id);

  return (
    <>
      <AppletHeader
        appId={app.id}
        appName={app.name}
        initialStatus={app.status}
        initialPublishedToWeb={app.published_to_web}
        active="code"
      />
      {/* Whole-surface editor (activity bar, file tabs, chat) is static
          chrome, not scrolling content — it must start below the glass
          header rather than sliding behind it (same pattern as /code). */}
      <div
        className="h-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <AppletEditPageClient app={app} />
      </div>
    </>
  );
}
