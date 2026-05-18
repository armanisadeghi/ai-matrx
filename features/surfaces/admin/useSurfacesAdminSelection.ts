"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * URL-driven selection for the surfaces admin shell:
 *   ?surface=<surface_name>   — which surface is selected (col 4)
 *   ?binding=<binding_id>     — which binding is being edited (col 3)
 *
 * Using search params (not nested routes) keeps the layout shell stable
 * across selection changes — Next.js doesn't tear down the resizable
 * panels. We can graduate to nested routes later if needed.
 */
export function useSurfacesAdminSelection() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const surfaceName = params.get("surface") ?? null;
  const bindingId = params.get("binding") ?? null;

  const update = useCallback(
    (next: { surface?: string | null; binding?: string | null }) => {
      const nextParams = new URLSearchParams(params.toString());
      if ("surface" in next) {
        if (next.surface) nextParams.set("surface", next.surface);
        else nextParams.delete("surface");
      }
      if ("binding" in next) {
        if (next.binding) nextParams.set("binding", next.binding);
        else nextParams.delete("binding");
      }
      const qs = nextParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const selectSurface = useCallback(
    (name: string | null) => {
      // Changing surface clears the active binding — a binding is scoped
      // to (agent, surface), so a stale id from a different surface is
      // never meaningful.
      update({ surface: name, binding: null });
    },
    [update],
  );

  const selectBinding = useCallback(
    (id: string | null) => {
      update({ binding: id });
    },
    [update],
  );

  return { surfaceName, bindingId, selectSurface, selectBinding };
}
