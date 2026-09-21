import PageHeader from "@/features/shell/components/header/PageHeader";
import { StaffHeader } from "@/features/personal-staff/components/StaffHeader";
import { StaffRoom } from "@/features/personal-staff/components/StaffRoom";
import { resolveStaffSeed } from "@/features/personal-staff/service.server";

/**
 * `/staff` — the in-app door onto a person's staff.
 *
 * WHAT IS ON THE SERVER AND WHY. The header row and the chat column's frame
 * are in the first paint. `resolveStaffSeed` gives this page the
 * `personal_staff.front_line` Holder at the SYSTEM rung — the only rung a
 * Server Component can honestly reach — which is the same first-paint seed
 * `/chat/new` paints from. Nothing below it shifts when the real answer lands.
 *
 * WHAT IS NOT ON THE SERVER, AND WHY IT CANNOT BE. The THREAD comes from
 * `POST {aidream}/personal-staff/open`, which is gated by
 * `require_organization_context`. In this repo the active organization exists
 * only in the browser — `getActiveOrgId` reads Redux and nothing else may
 * stand in for it (`ensureOrgIdServer` REFUSES rather than choosing; CLAUDE.md
 * § "A 'default organization' is at most a per-client DISPLAY preference").
 * So the door is asked from `StaffRoom`, one hop after hydration, with the
 * organization the person actually selected. No Server Component in this repo
 * calls aidream with that header, and this one does not become the first.
 */
export default async function StaffPage() {
  const seed = await resolveStaffSeed();

  return (
    <>
      <PageHeader>
        <StaffHeader
          seedAgentId={seed.agentId}
          seedAgentName={seed.agentName}
        />
      </PageHeader>
      {/* NOTHING FAILS SILENTLY. The seed is optional — the door answers with
          the rung that actually runs a hop after hydration — but a page that
          painted without it says so in one line rather than looking merely
          empty. It is a notice, never an error state: the thread still loads. */}
      {seed.seedNotice ? (
        <p className="border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground">
          {seed.seedNotice} Your staff is still loading normally.
        </p>
      ) : null}
      <div className="h-full overflow-hidden">
        <StaffRoom seedAgentId={seed.agentId} />
      </div>
    </>
  );
}
