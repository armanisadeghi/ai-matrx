"use client";

// features/education/kits/components/MakeMoreFromKit.tsx
//
// "Make more from it" — the kit's own generate door.
//
// A kit was a dead end for everything it did not already contain: the button
// sent the learner to the generic `/education/start` ingest, which drops the kit
// entirely and asks them to upload the same document a second time — producing a
// SECOND, disconnected kit, which is the exact fragmentation this feature exists
// to end. The education home's one nudge ("this kit has no quiz") had nowhere to
// point for the same reason.
//
// So this recovers the kit's own material from its anchor (`reopenAnchor` — no
// re-upload, no new anchor) and hands it to THE canonical convert dialog. It
// runs no generation of its own: the dialog owns the target rows, the
// entitlement guard, the COPPA gate and the live stream, and the generators
// write the `source` edge back to this same anchor — so whatever is made lands
// in THIS kit rather than beside it.

import { useCallback, useEffect, useEffectEvent, useRef, useState, type ComponentProps } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { usePdfClient } from "@/features/pdf/api/client";
import { ConvertContentDialog } from "@/features/education/convert/ConvertContentDialog";
import { recoverKitMaterial, type RecoveredKitMaterial } from "../recoverKitMaterial";
import type { TargetKind } from "@/features/education/convert/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useIngest } from "@/features/education/onboard/useIngest";
import { KIT_TOKEN, type KitSource } from "../kitScope";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import type { OutlineSection } from "../outline/types";

/** A request from the kit page to open the dialog aimed at outline sections. */
export interface AimedMakeMore {
  sections: OutlineSection[];
  kind: TargetKind;
  /** Changes on every press, so the same section can be asked for twice. */
  nonce: number;
}

export function MakeMoreFromKit({
  sourceType,
  sourceId,
  kitTitle,
  /**
   * The format the learner was sent here to add (`?add=quiz` — the home's nudge
   * chip). It opens this surface and leads the dialog with that row; it never
   * starts a run, because generation spends the learner's quota and a refresh
   * would spend it again.
   */
  addTarget,
  onConverted,
  buttonVariant = "default",
  buttonClassName = "min-h-11 gap-1.5 sm:min-h-0",
  sources,
  organizationId,
  outline,
  aimed,
}: {
  /** The kit's outline + per-section counts (enables "Focus on gaps"). */
  outline?: ComponentProps<typeof ConvertContentDialog>["outline"];
  /** Coverage "Make more" / "Go deeper": open aimed at these sections. */
  aimed?: AimedMakeMore | null;
  /** A multi-source kit's Sources — "Make more" reads ALL of them. */
  sources?: readonly KitSource[];
  /** The kit's organization (the Source read runs there). */
  organizationId?: string;
  sourceType: string;
  sourceId: string;
  kitTitle: string;
  addTarget?: TargetKind;
  onConverted?: () => void;
  /** Lets a host row draw this door as its one uniform button (the kit sample). */
  buttonVariant?: "default" | "outline";
  buttonClassName?: string;
}) {
  const pdf = usePdfClient();
  const { normalizeSources } = useIngest();
  const [recovered, setRecovered] = useState<RecoveredKitMaterial | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoOpened = useRef(false);
  // The current aim (null = the plain "Make more from it" door).
  const [aim, setAim] = useState<AimedMakeMore | null>(null);

  const openDialog = useCallback(async () => {
    setError(null);
    if (recovered) {
      setOpen(true);
      return;
    }
    setBusy(true);
    try {
      const next = await recoverKitMaterial({ sourceType, sourceId, kitTitle, sources, organizationId, normalizeSources, pdf });
      setRecovered(next);
      setOpen(true);
    } catch (e) {
      // A material we cannot re-read is said out loud, in place. The learner is
      // deciding whether to re-upload; a silent no-op decides it for them.
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't re-read this material to make more from it.",
      );
    } finally {
      setBusy(false);
    }
  }, [kitTitle, normalizeSources, organizationId, pdf, recovered, sourceId, sourceType, sources]);

  // The kit page asked for a run aimed at sections (Coverage row actions).
  const openAimed = useEffectEvent((next: AimedMakeMore) => {
    setAim(next);
    void openDialog();
  });
  useEffect(() => {
    if (aimed) openAimed(aimed);
  }, [aimed]);

  // A deep link is a request to be here with the work already started.
  useEffect(() => {
    if (!addTarget || autoOpened.current) return;
    autoOpened.current = true;
    void openDialog();
  }, [addTarget, openDialog]);

  return (
    <>
      <Button
        size={buttonVariant === "default" ? "sm" : undefined}
        variant={buttonVariant}
        className={buttonClassName}
        disabled={busy}
        onClick={() => {
          setAim(null);
          void openDialog();
        }}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <AGENT_ICON className="h-4 w-4" />
        )}
        {busy ? "Reading your material…" : "Make more from it"}
      </Button>

      {error && (
        <p className="flex w-full items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
          <ErrorAlchemyMenu error={error} />
        </p>
      )}

      {recovered && (
        <ConvertContentDialog
          key={aim ? `aim:${aim.nonce}` : "kit"}
          open={open}
          onOpenChange={setOpen}
          origin={recovered.origin}
          text={recovered.text}
          sourceRef={recovered.ref}
          focusKind={aim?.kind ?? addTarget}
          onConverted={onConverted}
          outline={outline}
          sections={aim?.sections}
          orgId={organizationId}
        />
      )}
    </>
  );
}
