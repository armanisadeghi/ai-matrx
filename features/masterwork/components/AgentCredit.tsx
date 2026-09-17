"use client";

// WHICH AGENT IS THIS? (Arman, 2026-08-21): "When I'm clicking these buttons,
// I need to see which agent it's invoking, because I need to go look at that
// agent's instructions and figure out what's wrong."
//
// One tiny muted chip, dropped beside the title of every AI-backed surface.
// Hover names the Mandate key and today's bound agent, and it links to the
// Mandate admin where the binding (and the agent's instructions) are edited.
// The Mandate is the selector — no agent id is ever pinned in code — so the
// chip states the KEY as truth and the agent name as "today".

import { useContext } from "react";
import Link from "next/link";
import { ReactReduxContext } from "react-redux";
import { UserCog } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface AgentCreditProps {
  /** The mandate key this surface resolves through, e.g. "masterwork.scout". */
  mandate: string;
  /** The agent bound to it today (display only — the mandate is the truth). */
  agent?: string;
}

/**
 * THE KEY IS FOR THE PERSON WHO CAN ACT ON IT. Arman asked for this chip so HE
 * could jump to the agent's instructions — he is a platform admin. For a
 * non-technical Expert `masterwork.understudy` is an internal identifier
 * printed on her screen, beside a word she is still learning, linking to an
 * admin route she cannot open (jobs-bar-2026-09-16, item 12). Admins keep the
 * key and the link; everyone else is shown nothing at all — absent, never a
 * greyed-out stub.
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

function AgentCreditForAdmins({ mandate, agent }: AgentCreditProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  if (!isAdmin) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/mandates"
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
          <span className="hidden sm:inline">{mandate}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>
          Runs through the <span className="font-mono">{mandate}</span> mandate
          {agent ? (
            <>
              {" "}
              — today that&apos;s <span className="font-mono">{agent}</span>
            </>
          ) : null}
          . Click to open the mandate admin and edit its instructions.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
