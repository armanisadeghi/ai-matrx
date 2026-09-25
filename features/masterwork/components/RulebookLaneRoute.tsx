"use client";

// features/masterwork/components/RulebookLaneRoute.tsx
//
// The ONE page scaffold for a Rulebook working-mode route under
// `/masterwork/[id]/<lane>` (Arman's ruling, 2026-08-17: every
// creation/working mode gets a real URL). RouteHeader with a back door to the
// Rulebook, load-by-id, the canonical AccessGate for a failed read, and the
// lane's ONE shared component rendered as the body — the same component the
// detail page's dialog/panel entry renders, so the two entry points can never
// drift apart.
//
// It also carries the Rulebook SURFACE (2026-08-19). Before this, only
// `RulebookDetailPage` mounted `SurfaceRuntimeProvider`, so the very same
// Conductor / Scout launched from `/conduct` or `/interview` passed
// `surfaceName` with NOBODY publishing values — one implementation, two doors,
// full scope through one and an empty scope through the other. Every lane now
// gets the scope, the client tool, and the gate from this one scaffold; a lane
// that adds a route must not hand-roll any of the three.
//
// It carries the surface's WRITE half too (2026-09-12). The surface declares
// `rule_draft`, but only the detail page registered a handler for it, so a
// Conductor running on `/conduct` was told by the server it could stage a rule
// and then found no handler — a declared door with nothing behind it (live
// defect, conversation 2546a1d2-61fc-49af-b894-9577235bec12). The lane now
// mounts the SAME `RuleEditorDialog` the detail page uses and lands the save
// through the SAME canonical CAS upsert (`saveEditedRule`), so a staged rule
// behaves identically through either door and the Expert still presses Save.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { toast } from "@/lib/toast";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  SurfaceRuntimeProvider,
  useSurfaceClientTools,
  useSurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { MASTERWORK_RULEBOOK_SURFACE_NAME } from "@/features/surfaces/manifests/masterwork-rulebook.manifest";
import { RecordOrganizationSwitchOffer } from "@/features/organizations/components/RecordOrganizationSwitchOffer";
import { isBlankSlateInterview, subscribeBlankSlate } from "@/features/masterwork/record/blankSlateLane";
import {
  buildRulebookSurfaceScope,
  CLOSED_RULEBOOK_WORKSPACE_STATE,
  type RulebookDraftSnapshot,
} from "../agent-context/rulebookSurfaceScope";
import { requireRuleDraftInput } from "../agent-context/ruleDraftInput";
import { saveEditedRule } from "../ruleSave";
import { getRulebook, listMasterworksForRulebook } from "../service";
import {
  RuleEditorDialog,
  type RuleEditorResult,
} from "./detail/RuleEditorDialog";
import type { Masterwork, Rulebook, RulebookRule } from "../types";

export interface RulebookLaneRenderArgs {
  rulebook: Rulebook;
  canEdit: boolean;
  /** Adopt a fresh Rulebook row (a CAS write returned one). */
  setRulebook: (rulebook: Rulebook) => void;
  /** Refetch the Rulebook (drafts landed server-side). */
  reload: () => void;
}

/**
 * 🚨 A RULEBOOK PAGE NEVER CARRIES THE PREVIOUS RULEBOOK'S WORDS
 * (jobs-bar-2026-09-16 cold walk 2, finding #1's strongest remaining lead).
 *
 * Every lane route under `/masterwork/[id]/<lane>` is the SAME React element
 * position, so a Rulebook→Rulebook navigation changes a prop and nothing else:
 * React keeps the mounted instance, and every `useState` initialiser in the
 * scaffold AND in the lane body keeps whatever it computed from the FIRST
 * Rulebook. The live instance of that: `CapturePlanPage` seeds its goal field
 * from `rulebook.description` in a `useState` initialiser, so opening Rulebook
 * B's plan form after Rulebook A's showed A's sentence in B's form — a
 * first-timer reads that as their work landing on the wrong record, and there
 * is no way on screen to tell the two apart. The scaffold also kept the
 * previous Rulebook in state while the next one loaded, so children briefly
 * rendered the old row's name, rules and organization for real.
 *
 * ONE line closes the whole class for all 14 lanes at once: the identity of a
 * record-scoped page IS the record, so the mount is keyed by it. A different
 * Rulebook is a different page — fresh state everywhere below, and the load
 * starts from `loading` instead of from the last Rulebook's row. Fix the
 * class, never the instance: no lane may hand-roll a per-id reset, and a new
 * lane inherits this without knowing it exists.
 *
 * Guard: `features/masterwork/__tests__/a-rulebook-page-never-carries-the-previous-rulebooks-words.test.tsx`.
 */
export function RulebookLaneRoute(props: RulebookLaneRouteProps) {
  return <RulebookLaneRouteInstance key={props.rulebookId} {...props} />;
}

interface RulebookLaneRouteProps {
  rulebookId: string;
  /** Lane slug published on the surface scope, e.g. "sources", "conduct". */
  lane: string;
  /** The lane's short header title, e.g. "Sources". */
  title: string;
  /** Owner-only lanes refuse politely, with the door back. */
  requireOwner?: boolean;
  ownerMessage?: string;
  /**
   * "scroll" (default) — a padded, centered, vertically scrolling column.
   * "fill" — a full-height flex column the lane owns entirely (live
   * conversations: the Conductor and the Scout scroll their own transcript).
   * "bare" — the scrolling shell with NO inner container, for a lane whose
   * component already draws its own width and padding. A frame either IS the
   * chrome or has none; wrapping a self-contained page in a second padded
   * column is the box-in-a-box the user can see.
   */
  body?: "scroll" | "fill" | "bare";
  children: (args: RulebookLaneRenderArgs) => ReactNode;
}

function RulebookLaneRouteInstance({
  rulebookId,
  lane,
  title,
  requireOwner = false,
  ownerMessage,
  body = "scroll",
  children,
}: RulebookLaneRouteProps) {
  const userId = useAppSelector(selectUserId);
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [masterworks, setMasterworks] = useState<Masterwork[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const [nextRulebook, nextMasterworks] = await Promise.all([
          getRulebook(rulebookId),
          // Masterworks are part of the Rulebook's surface truth on every
          // lane; a failure here must never hide the lane itself.
          listMasterworksForRulebook(rulebookId).catch(
            () => [] as Masterwork[],
          ),
        ]);
        if (isCancelled()) return;
        setRulebook(nextRulebook);
        setMasterworks(nextMasterworks);
        setError(null);
      } catch (err) {
        // NEVER swallow this. The error is what tells AccessGate whether the
        // Expert is denied, signed out, or looking at a real fault.
        if (!isCancelled()) setError(err);
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [rulebookId],
  );

  const reload = useCallback(() => {
    void load(() => false);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const canEdit =
    rulebook !== null && userId !== null && rulebook.created_by === userId;


  // ── The `rule_draft` write target ────────────────────────────────────────
  // A declared target MUST have a handler wherever its surface is mounted:
  // the client offers `apply_surface_write` only for handler-backed targets,
  // and the server now advertises only the targets that offer names — so an
  // unwired mount silently costs the agent a capability the page promises.
  // The lane stages into the same editor the detail page opens; the Expert
  // still presses Save.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RulebookRule | undefined>(undefined);
  const [editorSection, setEditorSection] = useState<string | undefined>(
    undefined,
  );
  const [stagedRuleDraft, setStagedRuleDraft] = useState<
    Partial<RulebookDraftSnapshot> | undefined
  >(undefined);
  const [draftRevision, setDraftRevision] = useState(0);
  const [activeRuleDraft, setActiveRuleDraft] =
    useState<RulebookDraftSnapshot | null>(null);

  const existingIds = useMemo(
    () => new Set((rulebook?.rules ?? []).map((rule) => rule.id)),
    [rulebook?.rules],
  );

  useSurfaceWriteHandlers(MASTERWORK_RULEBOOK_SURFACE_NAME, {
    // Validate-then-apply: every throw reaches the agent verbatim and nothing
    // half-opens the editor.
    rule_draft: (value: unknown) => {
      if (!rulebook) throw new Error("The Rulebook is still loading.");
      if (!canEdit) throw new Error("You cannot edit this Rulebook.");
      const next = requireRuleDraftInput(value, rulebook);
      setEditing(next.initial);
      setEditorSection(next.draft.section);
      setStagedRuleDraft(next.draft);
      setActiveRuleDraft(null);
      setDraftRevision((revision) => revision + 1);
      setEditorOpen(true);
    },
  });

  const handleEditorOpenChange = useCallback((open: boolean) => {
    setEditorOpen(open);
    if (!open) {
      setStagedRuleDraft(undefined);
      setActiveRuleDraft(null);
    }
  }, []);

  const saveStagedRule = useCallback(
    async ({ rule, isNew }: RuleEditorResult) => {
      if (!rulebook) return;
      const saved = await saveEditedRule({ rulebook, rule, isNew });
      setRulebook(saved);
      toast.success(isNew ? "Rule added" : "Rule saved", {
        description: `Rulebook is now version ${saved.version}.`,
      });
    },
    [rulebook],
  );

  // THE ARCHIVED-ITEMS LAW (common-docs/policies/archived-items.md, Arman
  // 2026-09-09). This frame renders no Masterwork list of its own — it is the
  // lane's data provider and the agent's surface scope — so it takes the law's
  // DEFAULT: `listMasterworksForRulebook` without `includeArchived` returns the
  // live systems only, and an archived Masterwork is never handed to an agent
  // as something it can run or rebuild. The archived half is read and revealed
  // on the Masterworks lane and the Rulebook page, which carry the control.
  // The blank-slate register is module-level (it crosses a file boundary the
  // props cannot), so this subscription is what turns a declaration into a
  // rebuilt scope callback.
  const blankSlateEpoch = useSyncExternalStore(
    subscribeBlankSlate,
    () => isBlankSlateInterview(rulebookId),
    () => false,
  );

  const buildSurfaceScope = useCallback(() => {
    if (!rulebook) {
      throw new Error("The Rulebook surface is still loading.");
    }
    return buildRulebookSurfaceScope({
      rulebook,
      canEdit,
      masterworks,
      lane,
      // 🚨 A BLANK-SLATE INTERVIEW IS THE ONE CASE THIS SURFACE STAYS QUIET.
      // The provider republishes its scope on every turn, so an interview
      // launched with an empty scope got the whole Rulebook back one turn
      // later and opened by reciting it (found live 2026-09-15). The panel
      // declares the mode in `record/blankSlateLane.ts`; identity, permission
      // and lane still go out, so client tools and write targets keep working.
      withholdContent: isBlankSlateInterview(rulebookId),
      // The read twin of the `rule_draft` write target, and the honest
      // workspace state: an agent that staged a rule here can read back
      // exactly what is sitting in the editor.
      activeRuleDraft,
      workspaceState: {
        ...CLOSED_RULEBOOK_WORKSPACE_STATE,
        editor_open: editorOpen,
      },
    });
    // `blankSlateEpoch` is not read inside — it is the register's change
    // signal, so a mode declared after this callback was memoised rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeRuleDraft,
    blankSlateEpoch,
    canEdit,
    editorOpen,
    lane,
    masterworks,
    rulebook,
    rulebookId,
  ]);

  // The one client tool every lane can honestly service: refetch this
  // workspace's Rulebook + Masterworks through the canonical loaders.
  useSurfaceClientTools(MASTERWORK_RULEBOOK_SURFACE_NAME, {
    masterwork_refresh_rulebook: async () => {
      const [nextRulebook, nextMasterworks] = await Promise.all([
        getRulebook(rulebookId),
        listMasterworksForRulebook(rulebookId),
      ]);
      if (!nextRulebook) {
        throw new Error(
          "This Rulebook no longer exists, or you no longer have access to it.",
        );
      }
      setRulebook(nextRulebook);
      setMasterworks(nextMasterworks);
      return {
        rulebook_version: nextRulebook.version,
        // Honest count: the LIVE Masterworks, which is all this read returns.
        masterwork_count: nextMasterworks.length,
      };
    },
  });

  const header = (
    <RouteHeader
      left={
        <>
          <ChevronLeftTapButton
            href={`/masterwork/${rulebookId}`}
            ariaLabel="Back to the Rulebook"
          />
          {/* PHONE FIRST: the lane's own name never truncates, the Rulebook's
              always may. `truncate` on the <h1> alone did nothing here — the
              name is an inline child, so at 375px it ran past the header's
              `overflow-hidden` edge and was HARD CUT mid-word with no ellipsis
              (jobs-bar-2026-09-16 lanes-b, item 2). A flex row with an explicit
              `min-w-0` on the shrinking half is what actually ellipsises. */}
          <h1 className="ml-2 flex min-w-0 items-baseline gap-2 text-sm font-medium text-foreground">
            <span className="shrink-0">{title}</span>
            {rulebook ? (
              <span className="min-w-0 truncate font-normal text-muted-foreground">
                {rulebook.name}
              </span>
            ) : null}
          </h1>
        </>
      }
      right={
        <MandateDoorLink
          feature="masterwork"
          label="Masterwork agents"
          context={{ rulebookId }}
        />
      }
    />
  );

  const shellClass =
    body === "fill"
      ? "flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]"
      : "h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]";

  if (loading) {
    return (
      <>
        {header}
        <div className={shellClass}>
          {/* A NAKED SPINNER SAYS NOTHING (P8). The other two waiting states on
              this scaffold already name what they are doing; this one — the
              first thing a first-timer sees on every lane route — did not. */}
          <div className="flex h-full flex-1 flex-col items-center justify-center gap-3">
            <LoadingSpinner />
            <p className="text-sm text-muted-foreground">
              Opening {title.toLowerCase()}…
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!rulebook) {
    // NEVER hand-write "doesn't exist or you don't have access" copy. Under
    // RLS an empty read means four different things (denied · deleted · never
    // existed · signed out); AccessGate resolves the TRUE state and lets a
    // blocked Expert ask the owner for access in one click.
    return (
      <>
        {header}
        <div className={shellClass}>
          <AccessGate
            token="rulebook"
            id={rulebookId}
            error={error}
            onRetry={reload}
            fallbackHref="/masterwork/all"
            fallbackLabel="Back to Masterwork Studio"
          />
        </div>
      </>
    );
  }

  // Not an access story: the Expert CAN read this Rulebook, and this lane is
  // deliberately owner-only because the rules must come from the Expert.
  if (requireOwner && !canEdit) {
    return (
      <>
        {header}
        <div className={shellClass}>
          <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              {ownerMessage ??
                "Only the Rulebook's owner can work here — the rules have to come from the Expert themself."}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/masterwork/${rulebookId}`}>Open the Rulebook</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={MASTERWORK_RULEBOOK_SURFACE_NAME}
      getScope={buildSurfaceScope}
      isEditable={canEdit}
    >
      {header}
      <div className={shellClass}>
        {/* THE PERSON, NOT THE ORG (2026-09-23): the lane opens whatever
            organization is selected, and never moves the selection itself.
            When the Rulebook lives elsewhere it says so and offers the switch —
            doing things (the plan, the build) still happens in an organization. */}
        <RecordOrganizationSwitchOffer
          organizationId={rulebook.organization_id}
          what="Rulebook"
          className="mx-auto mb-3 w-full max-w-3xl shrink-0"
        />
        {body === "fill" ? (
          <div className="mx-auto flex h-full w-full min-h-0 max-w-3xl flex-1 flex-col overflow-hidden">
            {children({ rulebook, canEdit, setRulebook, reload })}
          </div>
        ) : body === "bare" ? (
          children({ rulebook, canEdit, setRulebook, reload })
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8 sm:px-6">
            {children({ rulebook, canEdit, setRulebook, reload })}
          </div>
        )}
      </div>
      {canEdit ? (
        <RuleEditorDialog
          open={editorOpen}
          onOpenChange={handleEditorOpenChange}
          sections={rulebook.sections}
          existingIds={existingIds}
          initial={editing}
          defaultSection={editorSection}
          onSave={saveStagedRule}
          surfaceName={MASTERWORK_RULEBOOK_SURFACE_NAME}
          getSurfaceScope={buildSurfaceScope}
          rulebookId={rulebook.id}
          rulebookVersion={rulebook.version}
          organizationId={rulebook.organization_id}
          stagedDraft={stagedRuleDraft}
          draftRevision={draftRevision}
          onDraftChange={setActiveRuleDraft}
        />
      ) : null}
    </SurfaceRuntimeProvider>
  );
}
