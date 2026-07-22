import type { ApiService } from "@/lib/api/service-routing";
import { selectResolvedServiceBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { getStoreSingleton } from "@/lib/redux/store-singleton";

/** Resolve an independently deployed Python service from the canonical Redux target. */
export function resolveServiceBaseUrl(service: ApiService): string {
  const store = getStoreSingleton();
  if (!store) {
    throw new Error(
      `Cannot resolve the ${service} service before the application store is ready.`,
    );
  }
  const url = selectResolvedServiceBaseUrl(
    store.getState() as Parameters<typeof selectResolvedServiceBaseUrl>[0],
    service,
  );
  if (!url) {
    throw new Error(
      `No ${service} URL is configured for the selected server environment.`,
    );
  }
  return url.replace(/\/+$/, "");
}
