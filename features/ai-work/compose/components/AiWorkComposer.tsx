"use client";

/**
 * `/work/new` — compose and launch work.
 *
 * Answers one question in eight plain-language steps: *what do I want done, by
 * whom, with what knowledge, and where should the result live?*
 *
 * THE INVENTORY LAW — this surface builds no execution, no picker, and no
 * store of its own. It composes, in order:
 *   1. Destination   → `destinationAvailability` over the live capability read
 *   2. Request       → the run's user input
 *   3. Expert system → `AgentListDropdown` (the canonical agent picker)
 *   4. Skills        → `RunSkillPicker` (the canonical per-run skill picker)
 *   5. Context       → `SmartAgentResourcePickerButton` + `useAttachResource`
 *                      (a stored file becomes a durable file→conversation edge
 *                      the backend injects at call time) and `ContextLensBar`
 *                      for the active scopes
 *   6. Home          → `UniversalAssociationPicker`, applied as canonical
 *                      `conversation → project|task|war_room` edges at launch
 *   7. Timing        → run now, save as a reusable request, or hand off to the
 *                      EXISTING schedule engine at `/schedules/new`
 *   8. Review        → the exact facts, then Run
 *
 * Execution is `launchAgentExecution` through `useAgentLauncher` — the ONE
 * agent execution path — so the run leaves a canonical conversation with all
 * the normal doors. The run streams in the floating `LiveRunWindow` (never a
 * spinner, never a block at the top of the page that shifts what the user is
 * reading), and the conversation stays reachable at `/chat/<id>`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookmarkPlus,
  CalendarClock,
  CircleAlert,
  Loader2,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { RunSkillPicker } from "@/features/agents/components/inputs/smart-input/RunSkillPicker";
import { SmartAgentResourcePickerButton } from "@/features/agents/components/inputs/resources/SmartAgentResourcePickerButton";
import { SmartAgentResourceChips } from "@/features/agents/components/inputs/resources/SmartAgentResourceChips";
import { AttachedDocumentChips } from "@/features/agents/components/inputs/resources/AttachedDocumentChips";
import { ContextLensBar } from "@/features/scopes/components/active-context/ContextLensBar";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import { associationsService } from "@/features/scopes/service/associationsService";
import { createAssignment } from "@/features/war-room/service/associations";
import { roomRef } from "@/features/war-room/types";
import { useUser } from "@/lib/hooks/useUser";
import {
  INITIAL_CAPABILITY,
  readManagedCapability,
  type ManagedCapability,
} from "@/features/ai-work/lib/managedClaudeCapability";
import type { WorkDestinationId } from "../destinations";
import {
  createSavedRequest,
  readSavedRequest,
  updateSavedRequest,
  type SavedRequest,
  type SavedRequestHome,
} from "../savedRequests";
import { ComposerSection } from "./ComposerSection";
import { DestinationStep } from "./DestinationStep";
import { HomeStep } from "./HomeStep";

/** Reasonable ceiling for the "did the conversation row land yet?" retry. */
const HOME_ATTACH_ATTEMPTS = 4;
const HOME_ATTACH_DELAY_MS = 600;

export interface AiWorkComposerProps {
  /** SSR-resolved default agent (the `chat.default_new_chat` slot). */
  defaultAgentId: string | null;
  defaultAgentName: string | null;
  /** `?request=<id>` — reopen a saved request into the form. */
  savedRequestId?: string;
}

export function AiWorkComposer(props: AiWorkComposerProps) {
  const [agentId, setAgentId] = useState<string | null>(props.defaultAgentId);

  if (!agentId) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-6 text-center">
          <CircleAlert className="mx-auto h-6 w-6 text-amber-600 dark:text-amber-400" />
          <p className="mt-2 text-sm font-medium text-foreground">
            No expert system could be resolved.
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            The default agent for new work did not resolve. Pick one to
            continue.
          </p>
          <div className="mt-3 flex justify-center">
            <AgentListDropdown
              label="Choose an expert system"
              onSelect={setAgentId}
              consumerId="ai-work-composer"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ComposerBody
      {...props}
      agentId={agentId}
      onAgentChange={setAgentId}
      key={agentId}
    />
  );
}

function ComposerBody({
  agentId,
  defaultAgentName,
  savedRequestId,
  onAgentChange,
}: AiWorkComposerProps & {
  agentId: string;
  onAgentChange: (id: string) => void;
}) {
  const dispatch = useAppDispatch();
  const { userId } = useUser();
  const openLiveRun = useOpenLiveRunWindow();

  // ── The run's identity. Managed mode mints ONE stable conversation id for
  //    this composer + agent pair, which is what every canonical per-run picker
  //    below binds to. The row itself is created server-side on the first turn.
  const { conversationId, launchAgent } = useAgentLauncher(agentId, {
    surfaceKey: `ai-work-composer:${agentId}`,
    sourceFeature: "chat",
    apiEndpointMode: "agent",
    ready: false,
  });

  const [destination, setDestination] = useState<WorkDestinationId>("ai-matrx");
  const [capability, setCapability] =
    useState<ManagedCapability>(INITIAL_CAPABILITY);
  const [requestText, setRequestText] = useState("");
  const [homes, setHomes] = useState<SavedRequestHome[]>([]);
  const [openStep, setOpenStep] = useState<number>(2);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRequest | null>(null);
  const [savedLabel, setSavedLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const skillSettings = useAppSelector(
    selectBuilderAdvancedSettings(conversationId ?? ""),
  );
  const skillIds = skillSettings?.addedSkills ?? [];

  // ── Live destination capability. One reader, shared with /work/connections.
  useEffect(() => {
    let cancelled = false;
    void readManagedCapability().then((next) => {
      if (!cancelled) setCapability(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Reopen a saved request into the form.
  useEffect(() => {
    if (!savedRequestId) return;
    let cancelled = false;
    void readSavedRequest(savedRequestId)
      .then((request) => {
        if (cancelled || !request) {
          if (!cancelled && !request) {
            toast.error("That saved request could not be opened.");
          }
          return;
        }
        setSaved(request);
        setSavedLabel(request.label);
        setRequestText(request.requestText);
        setDestination(request.destination);
        setHomes(request.homes);
        if (request.agentId && request.agentId !== agentId) {
          onAgentChange(request.agentId);
          return;
        }
        if (conversationId && request.skillIds.length > 0) {
          dispatch(
            setBuilderAdvancedSettings({
              conversationId,
              changes: { addedSkills: request.skillIds },
            }),
          );
        }
      })
      .catch((error: unknown) => {
        console.error("[ai-work/new] saved request read failed", error);
        toast.error("That saved request could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [savedRequestId, conversationId, agentId, dispatch, onAgentChange]);

  const canRun =
    destination === "ai-matrx" &&
    requestText.trim().length > 0 &&
    Boolean(conversationId);

  /**
   * Applies the Home picks as REAL canonical edges once the conversation row
   * exists. `assoc_add` authorizes against the conversation, and turn 1 creates
   * it, so the first attempt can legitimately be too early — it retries a
   * bounded number of times and then SCREAMS rather than dropping the link.
   */
  const attachHomes = async (runConversationId: string) => {
    for (const home of homes) {
      let attached = false;
      let lastError = "";
      for (let attempt = 0; attempt < HOME_ATTACH_ATTEMPTS; attempt += 1) {
        try {
          if (home.token === "war_room") {
            await createAssignment({
              ref: roomRef(home.id),
              entityType: "conversation",
              entityId: runConversationId,
            });
            attached = true;
            break;
          }
          const result = await associationsService.add({
            sourceType: "conversation",
            sourceId: runConversationId,
            targetType: home.token,
            targetId: home.id,
          });
          if (result.ok) {
            attached = true;
            break;
          }
          lastError = result.error.message;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
        await new Promise((resolve) =>
          setTimeout(resolve, HOME_ATTACH_DELAY_MS),
        );
      }
      if (!attached) {
        console.error(
          `[ai-work/new] could not file the run under ${home.token} ${home.id}: ${lastError}`,
        );
        toast.error(
          `The run started, but it could not be filed under "${home.label}". Open the conversation and add it there.`,
        );
      }
    }
  };

  const handleRun = async () => {
    if (!canRun || !conversationId) return;
    setLaunching(true);
    const handle = openLiveRun({
      conversationId,
      label: savedLabel.trim() || "Your request",
      pending: true,
      instanceId: `ai-work-composer:${conversationId}`,
    });
    try {
      const result = await launchAgent(agentId, {
        agentId,
        conversationId,
        surfaceKey: `ai-work-composer:${agentId}`,
        sourceFeature: "chat",
        apiEndpointMode: "agent",
        config: { displayMode: "direct", autoRun: true, allowChat: true },
        runtime: { userInput: requestText.trim() },
      });
      handle.update({
        conversationId: result.conversationId,
        requestId: result.requestId ?? null,
        pending: false,
      });
      setLaunched(result.conversationId);
      await attachHomes(result.conversationId);
    } catch (error) {
      handle.close();
      console.error("[ai-work/new] launch failed", error);
      toast.error(
        error instanceof Error
          ? `The run could not start — ${error.message}`
          : "The run could not start.",
      );
    } finally {
      setLaunching(false);
    }
  };

  const handleSave = async () => {
    const label = savedLabel.trim();
    if (!label) {
      toast.error("Give the request a name so you can find it again.");
      return;
    }
    if (!requestText.trim()) {
      toast.error("Write what you want done before saving the request.");
      return;
    }
    setSaving(true);
    try {
      const input = {
        label,
        description: null,
        requestText: requestText.trim(),
        agentId,
        destination,
        skillIds,
        homes,
      };
      if (saved) {
        const result = await updateSavedRequest(saved.id, saved.version, input);
        if (result.status === "saved") {
          setSaved(result.request);
          toast.success(`Saved "${result.request.label}".`);
        } else if (result.status === "conflict") {
          setSaved(result.current);
          toast.error(
            "Someone else changed this saved request while you were editing. It has been reloaded — apply your change again.",
          );
        } else {
          toast.error("That saved request no longer exists.");
        }
      } else {
        const created = await createSavedRequest(input);
        setSaved(created);
        toast.success(`Saved "${created.label}". Find it in Saved requests.`);
      }
    } catch (error) {
      console.error("[ai-work/new] save failed", error);
      toast.error(
        error instanceof Error
          ? `The request could not be saved — ${error.message}`
          : "The request could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggle = (step: number) =>
    setOpenStep((current) => (current === step ? -1 : step));

  const scheduleHref = `/schedules/new?agentId=${encodeURIComponent(
    agentId,
  )}&prompt=${encodeURIComponent(requestText.trim())}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
      <header>
        <h1 className="text-lg font-semibold text-foreground">Start work</h1>
        <p className="text-xs text-muted-foreground">
          Say what you want done, choose who does it and what they should know,
          then run it now or save it to run again.
        </p>
      </header>

      <ComposerSection
        step={1}
        title="Who does the work"
        question="Choose where this work runs."
        answer={destination === "ai-matrx" ? "AI Matrx" : undefined}
        complete
        open={openStep === 1}
        onToggle={() => toggle(1)}
      >
        <DestinationStep
          value={destination}
          capability={capability}
          onChange={setDestination}
        />
      </ComposerSection>

      <ComposerSection
        step={2}
        title="Your request"
        question="Describe the job in your own words."
        answer={requestText.trim() ? requestText.trim().slice(0, 90) : undefined}
        complete={requestText.trim().length > 0}
        open={openStep === 2}
        onToggle={() => toggle(2)}
      >
        <Textarea
          value={requestText}
          onChange={(event) => setRequestText(event.target.value)}
          rows={6}
          placeholder="For example: Read the three attached contracts and list every deadline, who owns it, and what happens if we miss it."
          className="text-sm"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Plain language is enough. You never have to write a system prompt.
        </p>
      </ComposerSection>

      <ComposerSection
        step={3}
        title="Expert system"
        question="Who should do it?"
        answer={defaultAgentName ?? undefined}
        complete
        open={openStep === 3}
        onToggle={() => toggle(3)}
      >
        <AgentListDropdown
          label="Change the expert system"
          activeAgentId={agentId}
          onSelect={onAgentChange}
          consumerId="ai-work-composer"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          An expert system is a configured AI Matrx agent — its instructions,
          tools, and models are already set up for a kind of work.
        </p>
      </ComposerSection>

      <ComposerSection
        step={4}
        title="Skills"
        question="Add extra expertise for this run."
        answer={skillIds.length > 0 ? `${skillIds.length} added` : undefined}
        complete={skillIds.length > 0}
        open={openStep === 4}
        onToggle={() => toggle(4)}
      >
        {conversationId ? (
          <div className="h-72 overflow-hidden rounded-lg border border-border">
            <RunSkillPicker conversationId={conversationId} />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          A skill is reusable know-how. Anything you add here is included in
          this run on top of what the expert system already knows.
        </p>
      </ComposerSection>

      <ComposerSection
        step={5}
        title="Context"
        question="What should it read?"
        open={openStep === 5}
        onToggle={() => toggle(5)}
      >
        {conversationId ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <SmartAgentResourcePickerButton
                conversationId={conversationId}
                triggerSize="default"
              />
              <span className="text-xs text-muted-foreground">
                Attach files, notes, tasks, pages, and more.
              </span>
            </div>
            <AttachedDocumentChips conversationId={conversationId} />
            <SmartAgentResourceChips conversationId={conversationId} />
            <ContextLensBar conversationId={conversationId} />
          </div>
        ) : null}
      </ComposerSection>

      <ComposerSection
        step={6}
        title="Home"
        question="Where should the result live?"
        answer={homes.length > 0 ? `${homes.length} linked` : undefined}
        complete={homes.length > 0}
        open={openStep === 6}
        onToggle={() => toggle(6)}
      >
        <HomeStep homes={homes} onChange={setHomes} />
      </ComposerSection>

      <ComposerSection
        step={7}
        title="Timing"
        question="Run it now, save it, or schedule it."
        open={openStep === 7}
        onToggle={() => toggle(7)}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ai-work-saved-label"
              className="text-xs font-medium text-foreground"
            >
              Save this as a reusable request
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="ai-work-saved-label"
                value={savedLabel}
                onChange={(event) => setSavedLabel(event.target.value)}
                placeholder="Name this request"
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />
                )}
                {saved ? "Update" : "Save"}
              </Button>
            </div>
            {saved && (
              <p className="text-xs text-muted-foreground">
                Saved as version {saved.version}.{" "}
                <Link
                  href="/work/requests"
                  className="text-primary hover:underline"
                >
                  Open Saved requests
                </Link>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Button asChild variant="outline" size="sm">
              <Link href={scheduleHref}>
                <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                Schedule it instead
              </Link>
            </Button>
            <span className="text-xs text-muted-foreground">
              Opens the schedule builder with this expert system and request
              filled in.
            </span>
          </div>
        </div>
      </ComposerSection>

      <ComposerSection
        step={8}
        title="Review and run"
        question="Check what will happen."
        open={openStep === 8}
        onToggle={() => toggle(8)}
      >
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Destination</dt>
          <dd className="text-foreground">AI Matrx</dd>
          <dt className="text-muted-foreground">Expert system</dt>
          <dd className="text-foreground">
            {defaultAgentName ?? "The selected agent"}
          </dd>
          <dt className="text-muted-foreground">Added skills</dt>
          <dd className="text-foreground">
            {skillIds.length > 0 ? `${skillIds.length}` : "None"}
          </dd>
          <dt className="text-muted-foreground">Filed under</dt>
          <dd className="text-foreground">
            {homes.length > 0
              ? homes.map((home) => home.label).join(", ")
              : "Nothing yet"}
          </dd>
          <dt className="text-muted-foreground">Where it goes</dt>
          <dd className="text-foreground">
            A conversation in your account, watchable while it runs.
          </dd>
        </dl>
      </ComposerSection>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button onClick={handleRun} disabled={!canRun || launching}>
          {launching ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-4 w-4" />
          )}
          Run it now
        </Button>
        {!requestText.trim() && (
          <span className="text-xs text-muted-foreground">
            Write your request first.
          </span>
        )}
        {launched && (
          <Link
            href={`/chat/${launched}`}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Open the conversation
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
