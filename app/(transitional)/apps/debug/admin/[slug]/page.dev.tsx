import { fetchAppBySlug } from "@/utils/supabase/fetchAppAndAppletConfig";
import AppConfigViewer from "@/components/admin/applet-admin/AppConfigViewer";
import { CustomAppConfig } from "@/types/customAppTypes";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const { slug } = resolvedParams;

  let appConfig: CustomAppConfig | null = null;

  try {
    // Fetch app configuration
    appConfig = await fetchAppBySlug(slug);
  } catch (error) {
    console.error("Error fetching app:", error);
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

  // Check if appConfig is null
  if (!appConfig) {
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

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">{appConfig.name}</h1>

      <div className="mb-8">
        <AppConfigViewer app={appConfig} />
      </div>

      {/* App navigation */}
      <h2 className="text-xl font-semibold mb-4">Available Applets</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(appConfig.appletList || []).map((applet) => (
          <div
            key={applet.appletId}
            className="border rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center mb-2">
              <h3 className="text-lg font-semibold">{applet.label}</h3>
            </div>

            <a
              href={`/apps/custom/${slug}/${applet.slug}`}
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Open {applet.label}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
