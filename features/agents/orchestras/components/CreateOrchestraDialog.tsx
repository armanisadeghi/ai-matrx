// features/agents/orchestras/components/CreateOrchestraDialog.tsx
//
// Create an Orchestra from an EXISTING agent as its conductor. The picker is
// `AgentListInlinePicker` — the exact canonical roster used across chat.
//
// A Matrx admin also gets the SYSTEM tab, and that is what makes a system
// Orchestra possible at all: an Orchestra IS a conductor agent plus its
// `orchestra` self-edge, so a picker that could not offer a builtin meant the
// platform had no way to build one. The tab is admin-only in the UI; the writes
// behind it (`assoc_add`) re-check editor access on the conductor, and
// `orchestra_list` re-checks viewer access, so this is convenience, not the gate.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import {
  createOrchestra,
  addAgentToOrchestra,
} from "@/features/agents/redux/orchestras/thunks";
import { accentClasses } from "./accents";
import {
  DEFAULT_ORCHESTRA_ACCENT,
  ORCHESTRA_ACCENTS,
  type OrchestraAccent,
} from "../constants";

const PICKER_CONSUMER = "orchestras-conductor-picker";
const USER_AGENT_TABS = ["mine", "shared", "all"] as const;
const ADMIN_AGENT_TABS = ["mine", "shared", "all", "system"] as const;

export interface CreateOrchestraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, this agent is added as the Orchestra's first member after creation. */
  seedMemberId?: string;
  /** Switch to the "generate a new conductor" flow (for users without one). */
  onGenerateInstead?: () => void;
}

export function CreateOrchestraDialog({
  open,
  onOpenChange,
  seedMemberId,
  onGenerateInstead,
}: CreateOrchestraDialogProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const isAdmin = useAppSelector(selectIsAdmin);

  const [conductorId, setConductorId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState<OrchestraAccent>(
    DEFAULT_ORCHESTRA_ACCENT,
  );
  const [busy, setBusy] = useState(false);

  const selected = useAppSelector((state) =>
    conductorId ? selectAgentById(state, conductorId) : undefined,
  );

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setConductorId(null);
      setLabel("");
      setTagline("");
      setAccent(DEFAULT_ORCHESTRA_ACCENT);
    }
    onOpenChange(next);
  };

  const handleCreate = async () => {
    if (!conductorId) return;
    setBusy(true);
    const res = await dispatch(
      createOrchestra({
        conductorId,
        label: label.trim() || undefined,
        config: { accent, tagline: tagline.trim() || undefined },
      }),
    );
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error ?? "Could not create the Orchestra.");
      return;
    }
    if (seedMemberId)
      await dispatch(
        addAgentToOrchestra({ conductorId, agentId: seedMemberId }),
      );
    toast.success("Orchestra created.");
    handleOpenChange(false);
    router.push(`/agents/orchestras/${conductorId}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            New Orchestra
          </DialogTitle>
          <DialogDescription>
            Pick the agent that presides over this Orchestra as its conductor,
            then add members on the builder canvas.
            {onGenerateInstead && (
              <>
                {" "}
                Don&apos;t have one?{" "}
                <button
                  type="button"
                  onClick={onGenerateInstead}
                  className="font-medium text-primary hover:underline"
                >
                  Generate an conductor
                </button>
                .
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* conductor picker — canonical roster */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Conductor agent
            </label>
            <div className="h-64 overflow-hidden rounded-md border border-border">
              <AgentListInlinePicker
                consumerId={PICKER_CONSUMER}
                onSelect={setConductorId}
                activeAgentId={conductorId}
                initialTab="mine"
                includeSystemInAll={isAdmin}
                visibleTabs={isAdmin ? ADMIN_AGENT_TABS : USER_AGENT_TABS}
                excludeAgentIds={seedMemberId ? [seedMemberId] : undefined}
                className="h-full"
              />
            </div>
          </div>

          {/* identity */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Orchestra name{" "}
                <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={
                  selected?.name
                    ? `Defaults to "${selected.name}"`
                    : "Name this Orchestra…"
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Tagline{" "}
                <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <Input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="What does this Orchestra accomplish together?"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Accent
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ORCHESTRA_ACCENTS.map((acc) => {
                  const ac = accentClasses(acc);
                  return (
                    <button
                      key={acc}
                      type="button"
                      aria-label={acc}
                      onClick={() => setAccent(acc)}
                      className={cn(
                        "h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                        ac.dot,
                        accent === acc
                          ? "ring-foreground/40"
                          : "ring-transparent",
                      )}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!conductorId || busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Create Orchestra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
