"use client";

// WHICH AGENT IS THIS? (Arman, 2026-08-21): "When I'm clicking these buttons,
// I need to see which agent it's invoking, because I need to go look at that
// agent's instructions and figure out what's wrong."
//
// One tiny muted chip, dropped beside the title of every AI-backed surface. It
// NAMES the job — the label its author wrote in `declare_mandate(...)` — and it
// is a door straight to that mandate's own page, where the binding and the
// agent's instructions are edited. The Mandate is the selector, so no agent id
// is ever pinned in code: the chip states the JOB as truth and the agent name
// as "today".
//
// 🚨 THE CHIP NEVER PRINTS THE KEY (cold walk 20, 2026-09-22). It used to, and
// the Rulebook read `Understudy  masterwork.understudy` on every single load
// while the interview drawer read `masterwork.scout`. The key still travels —
// in the href, which is where an identifier belongs — but the words a person
// reads are words. See `features/mandates/useMandateDisplayName`.

import { useContext } from "react";
import Link from "next/link";
import { ReactReduxContext } from "react-redux";
import { UserCog } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";
import { useMandateDisplayName } from "@/features/mandates/useMandateDisplayName";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface AgentCreditProps {
  /**
   * The mandate key this surface resolves through, e.g. "masterwork.scout".
   * Typed, never `string` (V-L6a, 2026-09-17): this credit names the job to the
   * Expert and links to its admin, so a retired key here would show a real
   * person a dead mandate. A wrong key fails `pnpm type-check` instead.
   */
  mandate: AnyMandateKey;
  /** The agent bound to it today (display only — the mandate is the truth). */
  agent?: string;
}

/**
 * THE DOOR IS FOR THE PERSON WHO CAN ACT ON IT. Arman asked for this chip so HE
 * could jump to the agent's instructions — he is a platform admin. For a
 * non-technical Expert the chip is a link into an admin surface she cannot use,
 * so admins keep the chip and everyone else is shown nothing at all — absent,
 * never a greyed-out stub (jobs-bar-2026-09-16, item 12).
 *
 * That gate is NOT what makes the key safe, and treating it as though it were
 * is exactly how cold walk 20 found `masterwork.understudy` on screen: the walk
 * signed in as `admin@admin.com`, which is the identity every operator, tester
 * and walk driver uses. An admin is a person too. The key is therefore gone
 * from the rendered words for everyone, admin included.
 *
 * The store lookup is split into an inner component on purpose: this chip is
 * rendered deep inside dialogs that several suites mount standalone, and a
 * `useSelector` outside a `<Provider>` throws. No store means no proof of
 * admin, which means no chip.
 */
export function AgentCredit(props: AgentCreditProps) {
  const hasStore = useContext(ReactReduxContext) !== null;
  if (!hasStore) return null;
  return <AgentCreditForAdmins {...props} />;
}

function AgentCreditForAdmins(props: AgentCreditProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  // The name read is split off so an Expert's browser never makes it: the chip
  // she is not shown must not cost her a request either.
  if (!isAdmin) return null;
  return <AgentCreditChip {...props} />;
}

function AgentCreditChip({ mandate, agent }: AgentCreditProps) {
  const jobName = useMandateDisplayName(mandate);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          // The key rides in the address, never in the sentence — and it lands
          // on THIS mandate's page instead of the whole console, which is what
          // "go look at that agent's instructions" actually asked for.
          href={`/mandates/${encodeURIComponent(mandate)}`}
          // DELIBERATELY UNDER THE TOUCH FLOOR, and declared so rather than
          // left looking like an oversight in a phone census: this is a
          // super-admin engineering credit, not an Expert's control. Growing it
          // to 44px on a phone would put a debug affordance above the lane's own
          // buttons in visual weight. It opts OUT of `.matrx-touch-targets`.
          data-touch-exempt
          className="inline-flex items-center gap-1 rounded px-1 text-[10px] text-muted-foreground/70 hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <UserCog className="h-3 w-3" />
          <span className="hidden sm:inline">{jobName}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>
          Runs the {jobName} job
          {agent ? (
            <>
              {" "}
              — today that&apos;s <span className="font-mono">{agent}</span>
            </>
          ) : null}
          . Click to open it and edit its instructions.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
