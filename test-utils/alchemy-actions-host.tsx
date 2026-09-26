/**
 * test-utils/alchemy-actions-host.tsx
 *
 * The app's ONE Alchemy action registry, for jest suites that mount a real
 * transcript, column or rich document outside `app/Providers.tsx`.
 *
 * WHY. ALC-15 S2 (56ce11b631) made the rich-document layouts (`ActionBar`,
 * `MenuVariant`) read the one registry from `<AlchemyActionsProvider>`, which
 * `AlchemyHost` mounts at the app root for every route group. A suite that
 * mounts those layouts bare gets "Alchemy actions: render inside
 * <AlchemyActionsProvider>" from the package, the message section's boundary
 * draws "This section could not be displayed", and the suite reads an empty
 * answer. That is the harness missing the root host, not a product defect.
 *
 * This builds the registry exactly as `AlchemyHost` does — the same
 * `createAlchemyHostPorts` over the suite's REAL store and the same
 * `createActionRegistry` — without `AlchemyHost`'s session side (router,
 * Supabase transfer session), which the transcript never reaches.
 */

import { useState, type ReactNode } from "react";
import { createActionRegistry } from "@ai-matrx/alchemy/actions";
import { AlchemyActionsProvider } from "@ai-matrx/alchemy/react/host";
import { createAlchemyHostPorts } from "@/components/agent-copy/alchemy-host-ports";
import { useAppStore } from "@/lib/redux/hooks";

export function AlchemyActionsTestHost({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const [ports] = useState(() => createAlchemyHostPorts({ store }));
  const [registry] = useState(() => createActionRegistry({ ports }));
  return (
    <AlchemyActionsProvider ports={ports} registry={registry}>
      {children}
    </AlchemyActionsProvider>
  );
}
