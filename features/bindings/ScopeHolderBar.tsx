"use client";

// features/bindings/ScopeHolderBar.tsx
//
// Scope and holder controls for every binding host. Mandate specification
// belongs in Definition; this bar does not repeat its identity or input inventory.
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

import {
  FieldHelp,
  PropertyRow,
  StatusToken,
} from "@/components/official/ConfigurationFields";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectBuiltinAgents } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import type { AgentTab } from "@ai-matrx/agents/catalog";
import { ShortcutScopePicker } from "@/features/agent-shortcuts/components/ShortcutScopePicker";
import {
  AGENT_SCOPES,
  type AgentScope,
} from "@/features/agent-shortcuts/constants";
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
   * host also shows its scope selector and default-holder actions.
   */
  perspective?: "person" | "organization" | "system";
  /**
   * THE DOOR'S OWN VERDICT on the rung this host manages — one sentence and,
   * when something is wrong, its remedy. Derived from `mandate.resolve`'s
   * `dropped_code`/`dropped_reason` by the host, never re-derived here.
   */
  healthNote?: {
    sentence: string;
    remedy: string | null;
    broken: boolean;
  } | null;
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
      // Matching owns coverage; the holder picker only selects its implementation.
      coverageLine={null}
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
    <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-3">
      <div>
        <PropertyRow
          label="Scope"
          source={
            pinnedList && rung === "org"
              ? (organizationNames[organizationId ?? ""] ??
                "Organization name unavailable")
              : undefined
          }
          help={
            <div className="space-y-2">
              <p>
                {pinnedList || onDefaultHolderRung
                  ? pinnedRungWords(rung, defaultHolderOffer).covers
                  : ladderLine}
              </p>
              {!allowGlobal && !pinnedList && !onDefaultHolderRung ? (
                <p>Platform-wide bindings require a super administrator.</p>
              ) : null}
            </div>
          }
          value={
            pinnedList ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>{pinnedRungWords(rung, defaultHolderOffer).noun}</span>
                {pinnedList
                  .filter((other) => other !== rung)
                  .map((other) => (
                    <Button
                      key={other}
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onRungChange(other, null)}
                    >
                      {pinnedRungWords(other, defaultHolderOffer).noun}
                    </Button>
                  ))}
              </div>
            ) : onDefaultHolderRung ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>{defaultHolderOffer?.label ?? "Mandate default"}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onRungChange("user", null)}
                >
                  Personal override
                </Button>
              </div>
            ) : (
              <ShortcutScopePicker
                className="[&>div:first-child>label]:sr-only"
                scope={RUNG_TO_SCOPE[rung]}
                scopeId={organizationId ?? undefined}
                allowGlobal={allowGlobal}
                allowedScopes={MANDATE_SCOPES}
                disabled={disabled}
                onScopeChange={(scope, scopeId) =>
                  onRungChange(scopeToRung(scope), scopeId ?? null)
                }
              />
            )
          }
        />
        {rung === "org" && !organizationId ? (
          <PropertyRow
            label="Organization"
            value={<StatusToken status="caution" label="Required" />}
            help="Choose an organization before saving its binding."
          />
        ) : null}
        {defaultHolderOffer && !pinnedList && !onDefaultHolderRung ? (
          <PropertyRow
            label="Mandate default"
            source={defaultHolderOffer.homeName}
            help={
              defaultHolderOffer.offered
                ? defaultHolderOffer.covers
                : defaultHolderOffer.refusal
            }
            value={
              <div className="flex flex-wrap items-center gap-2">
                {defaultHolderNow === null ? (
                  <StatusToken status="unknown" label="Not loaded" />
                ) : defaultHolderNow.set ? (
                  (defaultHolderNow.name ?? (
                    <StatusToken status="caution" label="Name unavailable" />
                  ))
                ) : (
                  "Not assigned"
                )}
                {defaultHolderOffer.offered ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onRungChange(DEFAULT_HOLDER_RUNG, null)}
                  >
                    Edit default
                  </Button>
                ) : (
                  <StatusToken status="neutral" label="Read only" />
                )}
              </div>
            }
          />
        ) : null}
        <PropertyRow
          label="Changes"
          value={
            unsavedNote ? (
              <StatusToken status="caution" label="Unsaved" />
            ) : (
              "None"
            )
          }
          help={unsavedNote ?? undefined}
        />
        {appliesInResolved ? (
          <PropertyRow
            label="Last save"
            value="Saved"
            help={appliesInResolved.replace(
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
              "Organization name unavailable",
            )}
          />
        ) : null}
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold">Holder</h3>
          {restriction.sentence ? (
            <FieldHelp label="Eligible holders">
              {restriction.sentence}
            </FieldHelp>
          ) : null}
        </div>
        {holderControls}
        {(holder.kind === "agent" && !holder.agentId) ||
        (holder.kind === "workflow" && !holder.workflowId) ? (
          <PropertyRow
            label="Local holder"
            value="Not assigned"
            source={pinnedRungWords(rung, defaultHolderOffer).noun}
            help={
              onDefaultHolderRung
                ? "No mandate default is assigned."
                : "No holder is assigned at this scope. The resolution chain can still provide an inherited holder."
            }
          />
        ) : null}
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
