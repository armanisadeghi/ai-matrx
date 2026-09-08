"use client";

// features/bindings/ScopeHolderBar.tsx
//
// WHO THIS IS FOR, AND WHAT RUNS — three cells across the top of the one
// binding UI: RUNG · HOLDER · JOB.
//
// UI-STANDARD P13: scope is ONE DESCRIBED CONTROL INSIDE THE FLOW, not a
// property of which URL family you happened to open. Before this, `/mandates/…`
// meant "my answer", `/organizations/…/mandates/…` meant "my org's answer" and
// the system answer lived on a different page family entirely — the person
// editing never saw the ladder they were standing on and could not move. The
// routes survive as entry points and PRE-SELECT the rung (D1, resolved
// 2026-08-31 by the defaults rule).
//
// The rung control is `ShortcutScopePicker` — the same described select the
// shortcut UI has used for months, each rung carrying its own sentence and
// revealing an entity picker when it needs one. It is given `allowedScopes`
// because a mandate binding is written for a user, an org, or everybody
// (`agent.mandate_binding.principal_type`) and has no project or task rung:
// offering one would be a control that cannot be saved.

import { useEffect, useMemo } from "react";
import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectBuiltinAgents } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import type { AgentTab } from "@/features/agents/redux/agent-consumers/slice";
import { ShortcutScopePicker } from "@/features/agent-shortcuts/components/ShortcutScopePicker";
import { AGENT_SCOPES, type AgentScope } from "@/features/agent-shortcuts/constants";
import { HolderAssignment } from "./HolderAssignment";
import {
  SYSTEM_RUNG_COVERS,
  SYSTEM_RUNG_HOLDER_RULE,
  SYSTEM_RUNG_TITLE,
  systemRungHolderIsPersonal,
} from "./system-rung";
import {
  DEFAULT_HOLDER_RUNG,
  type DefaultHolderRungOffer,
} from "./default-holder-rung";

/** The rungs a mandate binding can actually be written at. */
export type BindingRung = "global" | "org" | "user";

/**
 * Every rung this bar can STAND ON — the three binding rungs plus the mandate's
 * own default (`system`), which is not a binding at all but the three
 * `mandate.definition.default_holder_*` columns beneath them.
 *
 * 🔶 THE NAMING COLLISION, NAMED. The campaign's frozen ladder is `system` ·
 * `global` · `org` · `user`, and the register says `global` is never
 * relabelled `system`. `system-rung.ts` nonetheless titles the **global**
 * binding rung "System — decides for every user". Nothing here renames it —
 * that lane is live in these same files — so this rung leads with the word
 * "default" in every sentence a reader sees, and the collision travels to the
 * register as a finding. See `default-holder-rung.ts`.
 */
export type WorkspaceRung = BindingRung | typeof DEFAULT_HOLDER_RUNG;

export interface HolderDraft {
  kind: "agent" | "workflow";
  agentId: string | null;
  agentVersionId: string | null;
  useLatest: boolean;
  workflowId: string | null;
}

export interface ScopeHolderBarProps {
  rung: WorkspaceRung;
  organizationId: string | null;
  /** Super-admin authority — the system rung is theirs alone (server 403s). */
  allowGlobal: boolean;
  /**
   * 🚨 THE HOST DECIDES THE PERSPECTIVE (Arman, 2026-09-08, FIX-R4).
   *
   * When a host stands on ONE rung and only that rung — the admin route IS the
   * system rung of a mandate — the rung is not a choice, so there is no
   * selector. The bar STATES the rung instead ("System — decides for every
   * user") and offers no User/Org, because offering a move the page does not
   * mean is exactly the "meaningless garbage" Arman named.
   *
   * `undefined` (the default) keeps P13's movable control for every host whose
   * question really is "which rung am I setting".
   */
  fixedRung?: WorkspaceRung | readonly WorkspaceRung[];
  onRungChange: (rung: WorkspaceRung, organizationId: string | null) => void;
  /**
   * 🚨 THE BOTTOM RUNG — the mandate's OWN default holder — AS A FOURTH CHOICE
   * (FIX-R3/W3).
   *
   * `defaultHolderRungOffer()` has already decided whether this caller may set
   * it, and carries the words for either answer: the label and what it covers
   * when it is offered, or the refusal naming WHO may decide and what the
   * reader can do instead. The bar renders one or the other and never both —
   * a rung that is neither offered nor explained is the dead control the
   * fourth law forbids.
   *
   * `null`/absent = this host does not manage the bottom rung at all, and the
   * cell says nothing about it.
   */
  defaultHolderOffer?: DefaultHolderRungOffer | null;
  /**
   * WHO HOLDS THE BOTTOM RUNG RIGHT NOW — the mandate definition's own
   * `default_holder_*`, resolved to a name by the host (FIX-R6/F3).
   *
   * `null` means the host has not read it yet and the cell says so. `set:false`
   * means it was read and there is nobody. A `set:true` with a null `name` is
   * an unresolvable holder, and it is stated as unresolvable — never printed as
   * an id and never quietly rendered as "no holder", which is the lie that sent
   * a walker looking for a save that had actually worked.
   */
  defaultHolderNow?: { set: boolean; name: string | null } | null;
  /**
   * F3 — the standing sentence about what moving the rung costs, printed
   * whenever there IS something to lose. `null` when the draft is clean, so it
   * is a fact about right now and never decorative noise.
   */
  unsavedNote?: string | null;
  /**
   * 🚨 WHERE THE SAVED ROW ACTUALLY ANSWERS — the SERVER'S sentence
   * (`BindingResult.applies_in`, aidream v0.2.456), printed verbatim under the
   * rung it describes.
   *
   * The three rungs are not symmetric about organizations and the row cannot be
   * read to find out: a user binding stamps an org that is bookkeeping, not a
   * scope, and it follows the person into every organization they work in. That
   * was read as a leak once already (V3-CORRECTNESS F10). The write path is the
   * only thing that knows, so it says it and this cell shows it — `null` until
   * a write has spoken, because the alternative is the client inventing a
   * scope sentence the server never agreed to.
   */
  appliesIn?: string | null;
  /**
   * Organization id → name, for resolving ids inside the SERVER'S sentences.
   * The server names an org by UUID because it has no name to hand; this screen
   * does, and a name is never a UUID where a name exists (V1 round 3, the G2
   * class one cell over).
   */
  organizationNames?: Readonly<Record<string, string>>;

  holder: HolderDraft;
  onHolderChange: (next: HolderDraft) => void;
  /**
   * The holder agent's REAL NAME, resolved by the workspace.
   *
   * 🚨 V2 finding G2: without it `EntityRef` falls back to `id.slice(0,8)…`,
   * so the loudest thing in the HOLDER cell was the raw UUID prefix
   * `8cfa8351…` with the human name truncated beneath it. A name is never a
   * UUID when a name exists; `null` means it genuinely is not read yet, and
   * the cell says so rather than printing an id as if it were an identity.
   */
  holderName?: string | null;

  /** The job being bound — identity, what it answers in, what it offers. */
  job: {
    mandateKey: string;
    label: string;
    outputKind: string | null;
    /** null while the offer is still being read — never a premature 0. */
    offeredCount: number | null;
    offerSourceLine: string;
    /**
     * WHETHER THE OFFER COVERS WHAT THE HOLDER NEEDS — `coverageLine()` in
     * `words.ts`, derived from the live draft. This is the JOB cell's real
     * content (V2 G3): the wireframe's "enough to feed every input below
     * without asking the user anything", said honestly for the map as it
     * stands right now.
     */
    coverageLine: string;
  };

  /** One honest sentence about the ladder as it stands right now. */
  ladderLine: string;
  disabled?: boolean;

  /**
   * 🚨 THE SYSTEM PERSPECTIVE IS THREE CONTROLS AND NOTHING ELSE (Arman,
   * 2026-09-08, FIX-R9): *"3 values are all that is needed and then the mapping
   * of the inputs. The ui acts as though there are so many more things."*
   *
   * On that host the rung is not a choice (the admin page IS the system rung),
   * the job's identity is already the page's own heading, and everything the
   * old cells explained is either stated by a control or deleted. Every other
   * host keeps the three-cell bar.
   */
  perspective?: "person" | "organization" | "system";
  /**
   * THE DOOR'S OWN VERDICT on the rung this host manages — one sentence and,
   * when something is wrong, its remedy. Derived from `mandate.resolve`'s
   * `dropped_code`/`dropped_reason` by the host, never re-derived here.
   */
  healthNote?: { sentence: string; remedy: string | null; broken: boolean } | null;
}

const RUNG_TO_SCOPE: Record<BindingRung, AgentScope> = {
  global: AGENT_SCOPES.GLOBAL,
  org: AGENT_SCOPES.ORGANIZATION,
  user: AGENT_SCOPES.USER,
};

const MANDATE_SCOPES: readonly AgentScope[] = [
  AGENT_SCOPES.GLOBAL,
  AGENT_SCOPES.ORGANIZATION,
  AGENT_SCOPES.USER,
];

function scopeToRung(scope: AgentScope): BindingRung {
  if (scope === AGENT_SCOPES.GLOBAL) return "global";
  if (scope === AGENT_SCOPES.ORGANIZATION) return "org";
  return "user";
}

/**
 * 🚨 WHAT MAY HOLD THIS JOB AT THIS RUNG — a HARD restriction on the picker,
 * never a warning after the fact.
 *
 * Arman, 2026-08-31: *"why would anything allow me to connect anything other
 * than system agents?"* — and he rejected warn-and-allow by name. Before this,
 * `AgentListDropdown` was mounted here with NO restriction props at all, so the
 * system rung opened on **Mine · 40** of the admin's own personal agents and the
 * only protection was `GlobalBindAgentGuard` refusing at save time.
 *
 * The correct behaviour was already in this repo and is reused verbatim —
 * `ShortcutForm`'s global-scope branch (`initialTab="system"`, the sentence,
 * the destructive alert on a non-system pin). `GlobalBindAgentGuard` stays as
 * the BELT for the API path; this is the door.
 *
 * The ladder, said as a rule about who breaks:
 *   · **system rung** — everybody on the platform runs this, so only a SYSTEM
 *     agent may hold it. A personal agent breaks every user the moment its
 *     owner renames, un-shares or archives it.
 *   · **org rung** — everyone in one organization runs this, so a personal
 *     agent is the same defect at organization size. Shared and system agents
 *     only.
 *   · **user rung** — your own answer, your own agents. Unrestricted, and
 *     correctly so (VISION-RECONCILIATION D3).
 */
function holderRestriction(
  rung: WorkspaceRung,
  /**
   * The bottom rung's own offer, when that is the rung being stood on — it
   * carries the holder rule, which differs by HOME: a system-homed default runs
   * for every user on the platform (system agents only), an org-homed one runs
   * for one organization (shared or system agents, the org rung's rule).
   */
  defaultHolderOffer?: DefaultHolderRungOffer | null,
): {
  visibleTabs?: readonly AgentTab[];
  initialTab?: AgentTab;
  includeSystemInAll?: boolean;
  /** The sentence printed beside the picker. `null` at the unrestricted rung. */
  sentence: string | null;
} {
  if (rung === DEFAULT_HOLDER_RUNG) {
    // 🚨 RESTRICT AS FAR AS WE CAN HONESTLY SEE, NEVER WARN-AND-ALLOW. The
    // server judges containment for real (409, FIX-R1's one predicate) and its
    // sentence is printed verbatim; this is the door in front of it.
    if (defaultHolderOffer?.systemHomed) {
      return {
        visibleTabs: ["system"],
        initialTab: "system",
        includeSystemInAll: true,
        sentence: defaultHolderOffer.holderRule,
      };
    }
    return {
      visibleTabs: ["shared", "system"],
      initialTab: "shared",
      includeSystemInAll: true,
      sentence:
        defaultHolderOffer?.holderRule ??
        "An organization's default runs for everyone in it, so only agents shared with the organization — or system agents — can hold it.",
    };
  }
  switch (rung) {
    case "global":
      return {
        visibleTabs: ["system"],
        initialTab: "system",
        includeSystemInAll: true,
        sentence: SYSTEM_RUNG_HOLDER_RULE,
      };
    case "org":
      return {
        visibleTabs: ["shared", "system"],
        initialTab: "shared",
        includeSystemInAll: true,
        sentence:
          "An organization's answer runs for everyone in it, so only agents shared with the organization — or system agents — can be bound here.",
      };
    default:
      return { sentence: null };
  }
}

export function ScopeHolderBar({
  rung,
  organizationId,
  allowGlobal,
  fixedRung,
  defaultHolderOffer = null,
  defaultHolderNow = null,
  onRungChange,
  unsavedNote = null,
  appliesIn = null,
  organizationNames = {},
  holder,
  onHolderChange,
  holderName = null,
  job,
  ladderLine,
  disabled = false,
  perspective = "person",
  healthNote = null,
}: ScopeHolderBarProps) {
  const dispatch = useAppDispatch();
  const pinnedList: readonly WorkspaceRung[] | null = !fixedRung
    ? null
    : typeof fixedRung === "string"
      ? [fixedRung]
      : fixedRung.length > 0
        ? fixedRung
        : null;
  const onDefaultHolderRung = rung === DEFAULT_HOLDER_RUNG;
  const restriction = holderRestriction(rung, defaultHolderOffer);
  /**
   * 🚨 A NAME IS NEVER A UUID WHERE A NAME EXISTS (V1 round 3; the G2 class
   * again, one cell over). `applies_in` is the SERVER'S sentence and is printed
   * verbatim — but it names the organization by raw id, because the server has
   * no name to hand, while this screen shows that organization's NAME two lines
   * above. Substituting the name for the id is a display resolution of an
   * identifier, not a rewrite of the server's meaning: every other word is
   * untouched, and an id we cannot resolve is left exactly as sent rather than
   * replaced with a guess.
   */
  const appliesInResolved = appliesIn
    ? appliesIn.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        (id) => organizationNames[id.toLowerCase()] ?? id,
      )
    : null;

  // The system catalogue is only in the slice after a FULL list fetch, and the
  // restriction below is what makes it the only catalogue offered at the system
  // rung — so fetch it exactly when that rung is standing, the same trigger
  // `ShortcutForm` uses for the same reason.
  const restricted = restriction.sentence !== null;
  useEffect(() => {
    if (!restricted) return;
    dispatch(fetchAgentsListFull());
  }, [restricted, dispatch]);

  // 🚨 THE BELT ON A PIN THAT ALREADY EXISTS. Restricting the picker stops a
  // new bad choice; it says nothing about a row bound before the restriction
  // existed, or through the API. `ShortcutForm` prints exactly this alert, and
  // a screen that shows a forbidden holder without saying so is the lie the
  // fourth law forbids. Silent until the catalogue is actually read — an empty
  // list is "not loaded", never "not a system agent".
  const builtinAgents = useAppSelector(selectBuiltinAgents);
  const systemHolderViolation = useMemo(() => {
    // The SAME violation at both rungs whose blast radius is the whole
    // platform: the `global` binding rung, and a SYSTEM-homed mandate's own
    // default. An org-homed default is a different scope and a different rule,
    // judged by the server's containment predicate rather than here.
    const platformWide =
      rung === "global" ||
      (onDefaultHolderRung && Boolean(defaultHolderOffer?.systemHomed));
    if (!platformWide) return false;
    if (holder.kind !== "agent") return false;
    // ONE RULE, shared with the save refusal in `OneBindingWorkspace` — the
    // alert and the thing that actually stops the write cannot disagree.
    return systemRungHolderIsPersonal(
      holder.agentId,
      builtinAgents.map((a) => a.id),
    );
  }, [
    rung,
    onDefaultHolderRung,
    defaultHolderOffer?.systemHomed,
    holder.kind,
    holder.agentId,
    builtinAgents,
  ]);

  /**
   * THE THREE CONTROLS, built once and placed by the perspective — so the
   * system host and every other host are the SAME control, never two that
   * drift.
   */
  const holderControls = (
    <HolderAssignment
      holder={holder}
      onHolderChange={onHolderChange}
      holderName={holderName}
      mandateKey={job.mandateKey}
      agentTabs={restriction}
      outputKind={job.outputKind}
      // 🚨 FIX-R13/B — THE COVERAGE FACT GOES WHERE THE JOB CELL USED TO BE,
      // and NOWHERE ELSE. Every other host still renders it in the JOB cell
      // below; the system host has no JOB cell (FIX-R9-UI deleted it under
      // D19), and this sentence is the only place on that page that says
      // whether what the job offers actually feeds what the holder needs.
      // Passing it on both hosts would be the repetition Arman rejected.
      coverageLine={perspective === "system" ? job.coverageLine : null}
      refusal={
        // Verbatim, unchanged: it is the rule Arman ruled on, and the guard
        // that pins it (`system-rung-holder-refusal.test.tsx`) reads this
        // sentence. Only its home moved.
        systemHolderViolation
          ? "This holder is NOT a system agent, and the system rung runs for every user on the platform. Duplicate it into a system agent through the system-agents admin, then bind the copy."
          : null
      }
      disabled={disabled}
    />
  );

  // 🚨 THE ADMIN PANEL: THREE LABELS, THREE INPUTS, ONE VERDICT. No rung cell
  // (this host is one rung), no job cell (the page's heading is the job), no
  // explanatory prose. The only sentence is the door's own verdict, and only
  // when there is one.
  if (perspective === "system") {
    return (
      <section className="rounded-xl border border-border bg-card p-3">
        {holderControls}
        {/* WHERE THE ROW THAT WAS JUST WRITTEN ACTUALLY ANSWERS, in the SERVER'S
            own words. It is null until a write has spoken, so it is never
            standing explanation — it is the receipt for the save that just
            happened, and dropping it from this host would have quietly deleted
            the one sentence V1 R2-2 was fought over. */}
        {appliesInResolved ? (
          <p className="mt-3 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            Saved — {appliesInResolved}
          </p>
        ) : null}
        {healthNote ? (
          <div
            className={
              healthNote.broken
                ? "mt-3 space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5"
                : "mt-3 rounded-lg border border-border/50 bg-muted/30 p-2.5"
            }
          >
            <p
              className={
                healthNote.broken
                  ? "flex items-start gap-1.5 text-[12px] leading-relaxed text-destructive"
                  : "text-[12px] leading-relaxed text-foreground"
              }
            >
              {healthNote.broken ? (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : null}
              <span>{healthNote.sentence}</span>
            </p>
            {healthNote.remedy ? (
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                {healthNote.remedy}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-3 py-2">
        <h3 className="text-[12.5px] font-semibold text-foreground">
          Who this is for, and what runs
        </h3>
      </header>

      {/* 🚨 THREE CELLS, PROPORTIONED TO WHAT THEY HOLD (V2 finding G3, a
          re-occurrence of a class Arman rejected by name). Equal thirds gave
          the HOLDER — a name, a version control and its consequence sentence —
          the same 240px the RUNG's one select gets, so the holder overflowed
          while the RUNG cell sat 62% empty and the JOB cell 73%. The holder now
          takes the width it needs and the two reference cells compress first,
          exactly as the match's own grid template already does with its rails.
          The ladder sentence moved OUT of the header and INTO the rung cell:
          it is a fact about the rung, so it belongs where the rung is chosen —
          which fills that cell with meaning instead of padding. */}
      <div className="grid gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* ── RUNG ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Rung
          </p>
          {pinnedList ? (
            /* THE RUNGS ARE STATED, NOT SEARCHED FOR. A pinned host manages a
               FIXED set — the admin route manages the job's own default and the
               platform-wide binding, and nothing else — so the cell names the
               rung it is standing on and, when there is a sibling, offers that
               one by name. A scope select would offer rungs this page does not
               mean. */
            <div className="space-y-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5">
              <p className="text-[12px] font-medium text-foreground">
                {pinnedRungWords(rung, defaultHolderOffer).noun}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {pinnedRungWords(rung, defaultHolderOffer).covers}
              </p>
              {pinnedList
                .filter((other) => other !== rung)
                .map((other) => (
                  <Button
                    key={other}
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={disabled}
                    onClick={() => onRungChange(other, null)}
                  >
                    {/* NOT lowercased — a rung's noun can carry an
                        organization's NAME (FIX-R6/F3). */}
                    Set {pinnedRungWords(other, defaultHolderOffer).noun} instead
                  </Button>
                ))}
            </div>
          ) : onDefaultHolderRung ? (
            /* STANDING ON THE BOTTOM RUNG. The scope select cannot represent it
               — it is not a binding principal — so the rung is STATED here, in
               the words `defaultHolderRungOffer()` chose for this reader's own
               situation, with the way back beside it. */
            <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5">
              <p className="text-[12px] font-medium text-foreground">
                {defaultHolderOffer?.label ?? "The job's own default"}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {defaultHolderOffer?.covers ??
                  "Whoever this names runs the job wherever no binding above it answers."}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-6 px-1.5 text-[11px] text-muted-foreground"
                disabled={disabled}
                onClick={() => onRungChange("user", null)}
              >
                Set a binding above it instead
              </Button>
            </div>
          ) : (
            <ShortcutScopePicker
              scope={RUNG_TO_SCOPE[rung]}
              scopeId={organizationId ?? undefined}
              allowGlobal={allowGlobal}
              allowedScopes={MANDATE_SCOPES}
              disabled={disabled}
              onScopeChange={(scope, scopeId) =>
                onRungChange(scopeToRung(scope), scopeId ?? null)
              }
            />
          )}
          {/* THE RUNG EXPLAINS ITSELF IN ITS OWN CELL — who it covers and what
              it overrides — instead of a lone select in dead space. */}
          {/* `ladderLine` OPENS with this rung's own `covers` sentence and then
              names which rungs are answered today — one paragraph, not two, so
              the cell is filled with the ladder rather than with a repeat. */}
          {/* A fixed-rung host has already said what the rung covers, and the
              ladder line is about rungs it does not manage — so it is dropped
              rather than restated. */}
          {pinnedList || onDefaultHolderRung ? null : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {ladderLine}
            </p>
          )}
          {/* THE SAVED ROW SAYS WHERE IT ANSWERS, in the server's own words —
              beneath the ladder sentence, which is about the rung you are
              choosing, not about the row that exists. */}
          {appliesInResolved ? (
            /* 🚨 FOLDED AFTER IT IS READ (V2 round 3: it drove the cell to
               52.8% empty and never cleared). It is a fact about the write that
               just happened — worth reading once, not worth owning the cell
               afterwards — so it opens expanded and the person can close it. */
            <details
              open
              className="rounded-md border border-border bg-muted/40 px-2 py-1.5"
            >
              <summary className="cursor-pointer text-[11px] font-medium text-foreground">
                Saved — where this applies
              </summary>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {appliesInResolved}
              </p>
            </details>
          ) : null}
          {/* 🚨 WHY THE BLANKET SENTENCE IS GONE (FIX-R3/W3). This cell used to
              print, to every reader who was not a super admin, "The system rung
              — the answer everybody gets — is a super-admin decision, so it is
              not offered here." One sentence, two rungs, and wrong about both
              of them for an org-homed job: the mandate's own default belongs to
              the HOME organization's administrators, and the reader was told a
              platform administrator owned it. Each rung now speaks for itself,
              about the situation actually in front of this reader. */}
          {!allowGlobal && !pinnedList && !onDefaultHolderRung ? (
            <p className="text-[10.5px] leading-snug text-muted-foreground/80">
              &ldquo;{SYSTEM_RUNG_TITLE}&rdquo; is a platform-wide binding, and
              only a super admin may write one — so that rung is absent from the
              list above.
            </p>
          ) : null}
          {/* ── THE BOTTOM RUNG, OFFERED OR EXPLAINED ── */}
          {defaultHolderOffer && !pinnedList && !onDefaultHolderRung ? (
            <div className="space-y-1 rounded-md border border-dashed border-border px-2 py-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                The job&apos;s own default
              </p>
              {/* 🚨 A RUNG DESCRIBED IS A RUNG ANSWERED (FIX-R6/F3). This block
                  said what the bottom rung COVERS and offered a button to go
                  set it, and never once said who holds it TODAY — so a reader
                  standing on a rung above had no way to see the default they
                  had just saved, and the empty holder cell beside it read as
                  "there is nothing". The current answer comes from the mandate
                  definition through the one accessor; an unreadable name says
                  it is unreadable rather than printing an id. */}
              <p className="text-[11px] leading-relaxed text-foreground">
                {defaultHolderNow === null
                  ? "Reading who holds it…"
                  : defaultHolderNow.set
                    ? `Held by ${defaultHolderNow.name ?? "an agent whose name could not be read — reload to see it"} today.`
                    : "Nobody holds it — this job has no default of its own."}
              </p>
              {defaultHolderOffer.offered ? (
                <>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {defaultHolderOffer.covers}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={disabled}
                    onClick={() => onRungChange(DEFAULT_HOLDER_RUNG, null)}
                  >
                    Set {defaultHolderOffer.label}
                  </Button>
                </>
              ) : (
                /* NOT OFFERED, AND THE SENTENCE SAYS WHO MAY DECIDE — plus
                   what this reader can still do. A refusal without a remedy is
                   the half that always goes missing. */
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {defaultHolderOffer.refusal}
                </p>
              )}
            </div>
          ) : null}
          {unsavedNote ? (
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              {unsavedNote}
            </p>
          ) : null}
          {rung === "org" && !organizationId ? (
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              Pick the organization this answer is for — nothing can be saved
              until you do.
            </p>
          ) : null}
        </div>

        {/* ── HOLDER ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Holder
          </p>
          {/* WHO MAY HOLD THIS, SAID BEFORE THE PICKER IS OPENED — the rule,
              not an apology after a refusal. `holderRestriction()` carries the
              reason and the props that enforce it together, so the sentence
              can never drift from what the list does. */}
          {restriction.sentence ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              {restriction.sentence}
            </p>
          ) : null}
          {holderControls}
          {/* 🚨 AN EMPTY ASSIGNMENT NAMES THE RUNG IT IS EMPTY AT (FIX-R6/F3),
              on the hosts where a rung is a choice. A walker who had just set
              the job's own default read a subject-less "No holder yet" beside
              a block headed "The job's own default" and reported the save lost.
              The three controls state everything else; this states the one
              thing they cannot — WHICH rung is empty, and what that costs.
              The system host has one rung and its own verdict, so it prints
              neither. */}
          {(holder.kind === "agent" && !holder.agentId) ||
          (holder.kind === "workflow" && !holder.workflowId) ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Nothing is set at{" "}
              {/* NOT lowercased: the bottom rung's noun carries the home
                  organization's NAME. */}
              {pinnedRungWords(rung, defaultHolderOffer).noun} yet.
              {onDefaultHolderRung
                ? " This is the bottom rung, so while it is empty the job has no holder of its own at all."
                : " That is only about this rung: whatever a rung below it names is still what runs."}
            </p>
          ) : null}
        </div>

        {/* ── THE JOB ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Job
          </p>
          <div className="rounded-md border border-border px-2 py-1.5">
            <span className="block text-[12px] font-medium text-foreground">
              {job.label}
            </span>
            <code className="block font-mono text-[10px] text-muted-foreground">
              {job.mandateKey}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="py-0 font-mono text-[9.5px]">
              {job.outputKind ?? "no declared output kind"}
            </Badge>
            <Badge variant="outline" className="py-0 text-[9.5px]">
              {job.offeredCount === null
                ? "reading what it offers…"
                : `offers ${job.offeredCount}`}
            </Badge>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {job.offerSourceLine}
          </p>
          {/* DOES THE OFFER COVER THE HOLDER? The cell's own reason to exist,
              and the answer to the only question a person asks while looking
              at it. */}
          <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {job.coverageLine}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * The words for a rung a PINNED host is standing on, or offering as its
 * sibling. The bottom rung's words come from `defaultHolderRungOffer()`, which
 * already knows whether this job is homed in the Matrx System organization or
 * in somebody's workspace — so a pinned host never invents a sentence about a
 * rung whose decider it has not established.
 */
export function pinnedRungWords(
  rung: WorkspaceRung,
  defaultHolderOffer: DefaultHolderRungOffer | null,
): { noun: string; covers: string } {
  if (rung === DEFAULT_HOLDER_RUNG) {
    return {
      noun: defaultHolderOffer?.label ?? "The job's own default",
      covers:
        defaultHolderOffer?.covers ??
        "Whoever this names runs the job wherever no binding above it answers.",
    };
  }
  if (rung === "global") {
    return { noun: SYSTEM_RUNG_TITLE, covers: SYSTEM_RUNG_COVERS };
  }
  return rungWords(rung);
}

/** What each rung covers, in one sentence — the ladder, said out loud (P13). */
export function rungWords(rung: WorkspaceRung): {
  noun: string;
  covers: string;
} {
  switch (rung) {
    case DEFAULT_HOLDER_RUNG:
      // Generic on purpose: the bottom rung's real words NAME ITS HOME, and
      // only `defaultHolderRungOffer()` knows that. Anything printed beside the
      // rung itself uses the offer's `label`/`covers`; this exists so a caller
      // reaching for the ladder's vocabulary at this rung is never handed the
      // user rung's words by a `default:` branch.
      return {
        noun: "the job's own default",
        covers:
          "Whoever this names runs the job wherever no binding above it answers.",
      };
    case "global":
      return {
        noun: "the system answer",
        covers:
          "Everybody on the platform gets this, unless their organization or they themselves override it.",
      };
    case "org":
      return {
        noun: "an organization's answer",
        covers:
          "Everyone in one organization gets this. It overrides the system answer; a member may still override it for themselves.",
      };
    default:
      return {
        noun: "your own answer",
        covers:
          "This applies everywhere you run. It overrides your organization's answer and the system answer.",
      };
  }
}
