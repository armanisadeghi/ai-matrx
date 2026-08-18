import { Suspense } from "react";

import SystemErrorsPanel from "@/features/admin/system-errors/SystemErrorsPanel";

export const metadata = {
  title: "System Errors",
};

/**
 * `public.system_error` — every request crash and every captured degradation,
 * with its full traceback. Deep-linkable as `?kind=…&hours=…` so a server-side
 * alarm chip can point straight at its own evidence.
 *
 * The panel reads those params with `useSearchParams`, which requires a
 * Suspense boundary or the route cannot be prerendered.
 */
export default function SystemErrorsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
          Loading system errors…
        </div>
      }
    >
      <SystemErrorsPanel />
    </Suspense>
  );
}
