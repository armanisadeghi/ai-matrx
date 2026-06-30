/**
 * Client-side utility for fetching app and applet data
 */

// Fetch app and applet by slug
export async function fetchAppBySlug(slug: string) {
  console.log("[FETCH-DEBUG] Client-side fetchAppBySlug starting:", slug);

  try {
    const url = `/api/apps/${slug}`;
    console.log("[FETCH-DEBUG] Fetching URL:", url);

    const startTime = Date.now();
    const response = await fetch(url, {
      // Important for fetches to complete in SSR environment
      cache: "no-store",
      headers: {
        "x-request-source": "client",
        "x-request-timestamp": new Date().toISOString(),
      },
    });
    const endTime = Date.now();
    console.log(
      `[FETCH-DEBUG] Response received in ${endTime - startTime}ms, status:`,
      response.status,
    );

    if (!response.ok) {
      let errorMessage = `Failed to fetch app: ${response.status}`;
      let errorData: { error?: string } | null = null;

      try {
        errorData = await response.json();
        errorMessage = errorData?.error || errorMessage;
      } catch (parseError) {
        console.error(
          "[FETCH-DEBUG] Could not parse error response:",
          parseError,
        );
        // Try to get text if JSON parsing fails
        const textContent = await response
          .text()
          .catch(() => "No response body");
        console.error("[FETCH-DEBUG] Raw response:", textContent);
      }

      console.error(
        "[FETCH-DEBUG] Error fetching app by slug:",
        errorMessage,
        errorData,
      );
      throw new Error(`API Error: ${errorMessage}`);
    }

    const data = await response.json();
    console.log("[FETCH-DEBUG] App data structure received:", {
      hasAppConfig: !!data?.app_config,
      numApplets: data?.applets?.length || 0,
      appSlug: data?.app_config?.slug,
    });

    return data;
  } catch (error) {
    console.error("[FETCH-DEBUG] Exception in fetchAppBySlug:", error);
    throw error;
  }
}

// Fetch app and applet by ID
export async function fetchAppById(id: string) {
  console.log("[FETCH-DEBUG] Client-side fetchAppById starting:", id);

  try {
    const url = `/api/apps/id/${id}`;
    console.log("[FETCH-DEBUG] Fetching URL:", url);

    const startTime = Date.now();
    const response = await fetch(url, {
      // Important for fetches to complete in SSR environment
      cache: "no-store",
      headers: {
        "x-request-source": "client",
        "x-request-timestamp": new Date().toISOString(),
      },
    });
    const endTime = Date.now();
    console.log(
      `[FETCH-DEBUG] Response received in ${endTime - startTime}ms, status:`,
      response.status,
    );

    if (!response.ok) {
      let errorMessage = `Failed to fetch app: ${response.status}`;
      let errorData: { error?: string } | null = null;

      try {
        errorData = await response.json();
        errorMessage = errorData?.error || errorMessage;
      } catch (parseError) {
        console.error(
          "[FETCH-DEBUG] Could not parse error response:",
          parseError,
        );
        // Try to get text if JSON parsing fails
        const textContent = await response
          .text()
          .catch(() => "No response body");
        console.error("[FETCH-DEBUG] Raw response:", textContent);
      }

      console.error(
        "[FETCH-DEBUG] Error fetching app by ID:",
        errorMessage,
        errorData,
      );
      throw new Error(`API Error: ${errorMessage}`);
    }

    const data = await response.json();
    console.log("[FETCH-DEBUG] App data structure received:", {
      hasAppConfig: !!data?.app_config,
      numApplets: data?.applets?.length || 0,
      appId: data?.app_config?.id,
    });

    return data;
  } catch (error) {
    console.error("[FETCH-DEBUG] Exception in fetchAppById:", error);
    throw error;
  }
}
