import {
  fetchAppAndAppletConfig,
  fetchAppletBySlug,
} from "@/utils/supabase/fetchAppAndAppletConfig";
import AppletConfigViewer, {
  customAppletConfigToAppletViewerConfig,
} from "@/components/admin/applet-admin/AppletConfigViewer";

export default async function AppletPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; appletSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const resolvedParams = await params;
  const { slug, appletSlug } = resolvedParams;
  const searchParamsResolved = await searchParams;

  // Fetch app and applet configuration
  const config = await fetchAppAndAppletConfig(null, slug);

  if (!config || !config.app_config) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-red-600">
          Application Not Found
        </h1>
        <p>
          The requested application could not be found or an error occurred.
        </p>
      </div>
    );
  }

  const appConfig = config.app_config;
  const applets = config.applets || [];
  const currentApplet = applets.find((applet) => applet.slug === appletSlug);

  if (!currentApplet) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-red-600">Applet Not Found</h1>
        <p>The requested applet could not be found.</p>
        <a
          href={`/apps/custom/${slug}`}
          className="mt-4 inline-block text-blue-600 hover:underline"
        >
          ← Back to {appConfig.name}
        </a>
      </div>
    );
  }

  let appletForViewer;
  try {
    const fullApplet = await fetchAppletBySlug(appletSlug);
    appletForViewer = customAppletConfigToAppletViewerConfig(fullApplet);
  } catch {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-red-600">Applet Not Found</h1>
        <p>Could not load the full applet configuration.</p>
        <a
          href={`/apps/custom/${slug}`}
          className="mt-4 inline-block text-blue-600 hover:underline"
        >
          ← Back to {appConfig.name}
        </a>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <a
          href={`/apps/custom/${slug}`}
          className="text-blue-600 hover:underline"
        >
          ← Back to {appConfig.name}
        </a>
      </div>

      <h1 className="text-2xl font-bold mb-2">{currentApplet.name}</h1>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        {currentApplet.description}
      </p>

      {/* Pass the searchParams to the AppletConfigViewer */}
      <div
        id="applet-container"
        className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
        data-applet-id={currentApplet.id}
      >
        <AppletConfigViewer
          applet={appletForViewer}
          searchParams={searchParamsResolved}
        />
      </div>
    </div>
  );
}
