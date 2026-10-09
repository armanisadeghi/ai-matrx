// features/mandates/go/IntelligenceGoPage.tsx — the shared body of every
// "go" route (`/intelligence/go`, `/administration/intelligence/go`,
// `/agents/go`). Resolves the id server-side and redirects, or tells the truth
// through the canonical access gate. See ./intelligenceGo.ts for the lanes.

import { redirect } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { createClient } from "@/utils/supabase/server";
import { crossDeploymentHref } from "@/lib/deployment/surfaces";
import { resolveIntelligenceId } from "./resolveIntelligenceId";
import { intelligenceTargetPath, type IntelligenceLane } from "./intelligenceGo";

export interface IntelligenceGoRouteProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function asPlainError(error: unknown) {
  if (!error || typeof error !== "object") return error;
  const e = error as { message?: string; code?: string; details?: string; hint?: string };
  return { message: e.message, code: e.code, details: e.details, hint: e.hint };
}

export async function IntelligenceGoPage({
  params,
  searchParams,
  lane,
}: IntelligenceGoRouteProps & { lane: IntelligenceLane }) {
  const { slug } = await params;
  const [id = "", ...rest] = slug ?? [];
  // Sub-route and query ride through verbatim (`/go/<id>/run?x=1`). The sub
  // comes from our own route segments and is re-validated: an arbitrary value
  // here would be an open redirect inside the app.
  const sub = rest.length ? `/${rest.join("/")}` : "";
  const safeSub = sub && /^\/[a-z0-9/_-]+$/i.test(sub) ? sub : "";
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") query.set(k, v);
    else if (Array.isArray(v)) for (const one of v) query.append(k, one);
  }
  const suffix = query.size ? `?${query}` : "";

  const supabase = await createClient();
  const { target, failures } = await resolveIntelligenceId(supabase, id);

  if (target) {
    const path = `${intelligenceTargetPath(target, lane, safeSub)}${suffix}`;
    // A path this build does not serve (a member page from the admin host, or
    // the admin tree from the main host) is an absolute document navigation.
    redirect(crossDeploymentHref(path) ?? path);
  }

  if (failures.length) {
    console.error(
      "[intelligence-go] LOUD: could not resolve an id; the person is told the " +
        "truth rather than sent to a guessed page.",
      { id, failures },
    );
  }

  const [primary, ...related] = failures;
  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token={primary?.token ?? "agent"}
        id={id}
        error={primary ? asPlainError(primary.error) : undefined}
        relatedReads={related.map((f) => ({
          token: f.token,
          id,
          error: asPlainError(f.error),
        }))}
        fallbackHref={lane === "admin" ? "/administration/intelligence/mandates" : "/agents/all"}
        fallbackLabel={lane === "admin" ? "Mandates" : "Your agents"}
      />
    </div>
  );
}
