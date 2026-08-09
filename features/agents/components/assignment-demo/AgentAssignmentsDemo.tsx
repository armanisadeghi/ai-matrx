"use client";

import {
  CircleStop,
  Dice5,
  Grid2X2,
  ListRestart,
  Plus,
  RefreshCw,
  Rows3,
  Trash2,
} from "lucide-react";

import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import {
  agentAssignmentsActions,
  selectAgentAssignmentsDemo,
  type AssignmentDemoMode,
} from "@/features/agents/redux/agent-assignments/agent-assignments.slice";
import {
  cancelAssignmentDemo,
  runAssignmentDemo,
} from "@/features/agents/redux/agent-assignments/agent-assignments.thunks";
import { selectLiveAgents } from "@/features/agents/redux/agent-definition/selectors";
import { useAppDispatch, useAppSelector, useDispatchThunk } from "@/lib/redux/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { cn } from "@/lib/utils";

const MODES: Array<{
  value: AssignmentDemoMode;
  label: string;
  description: string;
  icon: typeof Dice5;
}> = [
  {
    value: "single_random",
    label: "Single random",
    description: "Normal agent API with one opt-in variable marker",
    icon: Dice5,
  },
  {
    value: "coordinated_rows",
    label: "Paired rows",
    description: "Keep topics and research sources together",
    icon: Rows3,
  },
  {
    value: "independent_random",
    label: "Random batch",
    description: "Draw unbiased combinations with optional uniqueness",
    icon: ListRestart,
  },
  {
    value: "cartesian",
    label: "All combinations",
    description: "Materialize the product of every option list",
    icon: Grid2X2,
  },
];

export function AgentAssignmentsDemo() {
  const dispatch = useAppDispatch();
  const dispatchThunk = useDispatchThunk();
  const state = useAppSelector(selectAgentAssignmentsDemo);
  const agents = useAppSelector(selectLiveAgents);
  const running = state.runStatus === "running";
  const progress = state.total > 0 ? (state.completed / state.total) * 100 : 0;

  const selectAgent = (agentId: string) => {
    const agent = agents.find((candidate) => candidate.id === agentId);
    dispatch(
      agentAssignmentsActions.setAgent({
        id: agentId,
        name: agent?.name ?? null,
      }),
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Agent assignment engine
            </h1>
            <Badge variant="secondary">API + UI demo</Badge>
          </div>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Run an ordinary saved agent once with a secure random option, or
            create a durable coordinated session that pairs, randomizes, or
            enumerates many variable sets. Reusing the same session key resumes
            unfinished work without rerunning completed items.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            const active = state.mode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => dispatch(agentAssignmentsActions.setMode(mode.value))}
                disabled={running}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-accent",
                  running && "cursor-not-allowed opacity-60",
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="text-sm font-medium">{mode.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {mode.description}
                </p>
              </button>
            );
          })}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Agent and prompt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Saved agent</Label>
                  <AgentListDropdown
                    onSelect={selectAgent}
                    activeAgentId={state.agentId}
                    label={state.agentName ?? "Select an agent"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assignment-user-input">User input</Label>
                  <Textarea
                    id="assignment-user-input"
                    value={state.userInput}
                    onChange={(event) =>
                      dispatch(agentAssignmentsActions.setUserInput(event.target.value))
                    }
                    rows={4}
                    disabled={running}
                  />
                </div>
              </CardContent>
            </Card>

            {state.mode === "single_random" ? (
              <SingleRandomEditor disabled={running} />
            ) : state.mode === "coordinated_rows" ? (
              <PairedRowsEditor disabled={running} />
            ) : (
              <OptionVariablesEditor disabled={running} mode={state.mode} />
            )}
          </div>

          <aside className="space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Execution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {state.mode !== "single_random" && (
                  <div className="space-y-2">
                    <Label htmlFor="assignment-concurrency">Concurrency</Label>
                    <Input
                      id="assignment-concurrency"
                      type="number"
                      min={1}
                      max={100}
                      value={state.maxConcurrency}
                      onChange={(event) =>
                        dispatch(
                          agentAssignmentsActions.setMaxConcurrency(
                            Number(event.target.value),
                          ),
                        )
                      }
                      disabled={running}
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => dispatchThunk(runAssignmentDemo())}
                    disabled={running || !state.agentId}
                  >
                    <RefreshCw className={cn("size-4", running && "animate-spin")} />
                    {state.sessionKey ? "Resume session" : "Run demo"}
                  </Button>
                  {running && state.sessionId && (
                    <Button
                      variant="destructive"
                      onClick={() => dispatchThunk(cancelAssignmentDemo())}
                    >
                      <CircleStop className="size-4" />
                      Cancel session
                    </Button>
                  )}
                  {state.sessionKey && !running && (
                    <Button
                      variant="outline"
                      onClick={() => dispatch(agentAssignmentsActions.resetSession())}
                    >
                      New session
                    </Button>
                  )}
                </div>

                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium capitalize">{state.runStatus}</span>
                    {state.total > 0 && (
                      <span className="text-muted-foreground">
                        {state.completed} / {state.total}
                      </span>
                    )}
                  </div>
                  <Progress value={progress} />
                  {/* The assignment session is real and durable, but it has no
                      UI route of its own (only the REST read documented below),
                      so there is nothing to open. It gets the canonical uuid
                      cell rather than an invented door: 8…4 in place, full
                      value on hover, one-click copy. */}
                  {state.sessionId && (
                    <div className="group flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      Session:{" "}
                      <MatrxUuidCell value={state.sessionId} label="Session" />
                    </div>
                  )}
                  {state.sessionKey && (
                    <p className="break-all font-mono text-[11px] text-muted-foreground">
                      Idempotency key: {state.sessionKey}
                    </p>
                  )}
                </div>

                {state.error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {state.error}
                  </div>
                )}
              </CardContent>
            </Card>

            <ApiReference mode={state.mode} />
          </aside>
        </div>

        <ResultsPanel />
      </main>
    </div>
  );
}

function SingleRandomEditor({ disabled }: { disabled: boolean }) {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectAgentAssignmentsDemo);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Opted-in variable</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="single-variable-name">Variable name</Label>
          <Input
            id="single-variable-name"
            value={state.singleVariableName}
            onChange={(event) =>
              dispatch(
                agentAssignmentsActions.setSingleVariableName(event.target.value),
              )
            }
            disabled={disabled}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          The selected agent must define this choice-backed variable with random
          assignment enabled. The normal agent endpoint receives the exact marker
          below; the server validates the definition and chooses with secure,
          unbiased randomness.
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {`{"${state.singleVariableName || "variable"}": {"type": "auto_assign", "strategy": "random"}}`}
        </pre>
      </CardContent>
    </Card>
  );
}

function PairedRowsEditor({ disabled }: { disabled: boolean }) {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectAgentAssignmentsDemo);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Blog topics + research</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => dispatch(agentAssignmentsActions.addRow())}
          disabled={disabled}
        >
          <Plus className="size-4" />
          Add row
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.rows.map((row, index) => (
          <div
            key={row.id}
            className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <div className="space-y-1">
              <Label htmlFor={`topic-${row.id}`}>Topic {index + 1}</Label>
              <Input
                id={`topic-${row.id}`}
                value={row.topic}
                onChange={(event) =>
                  dispatch(
                    agentAssignmentsActions.updateRow({
                      id: row.id,
                      field: "topic",
                      value: event.target.value,
                    }),
                  )
                }
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`research-${row.id}`}>Research data</Label>
              <Input
                id={`research-${row.id}`}
                value={row.research}
                onChange={(event) =>
                  dispatch(
                    agentAssignmentsActions.updateRow({
                      id: row.id,
                      field: "research",
                      value: event.target.value,
                    }),
                  )
                }
                disabled={disabled}
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="self-end"
              onClick={() => dispatch(agentAssignmentsActions.removeRow(row.id))}
              disabled={disabled || state.rows.length === 1}
              aria-label={`Remove topic ${index + 1}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <ToggleRow
          label="Randomize row order"
          checked={state.randomizeOrder}
          onCheckedChange={(checked) =>
            dispatch(agentAssignmentsActions.setRandomizeOrder(checked))
          }
          disabled={disabled}
        />
      </CardContent>
    </Card>
  );
}

function OptionVariablesEditor({
  disabled,
  mode,
}: {
  disabled: boolean;
  mode: "independent_random" | "cartesian";
}) {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectAgentAssignmentsDemo);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Variable option lists</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => dispatch(agentAssignmentsActions.addVariable())}
          disabled={disabled}
        >
          <Plus className="size-4" />
          Add variable
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.variables.map((variable) => (
          <div
            key={variable.id}
            className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[minmax(140px,0.35fr)_minmax(0,1fr)_auto]"
          >
            <div className="space-y-1">
              <Label htmlFor={`variable-name-${variable.id}`}>Name</Label>
              <Input
                id={`variable-name-${variable.id}`}
                value={variable.name}
                onChange={(event) =>
                  dispatch(
                    agentAssignmentsActions.updateVariable({
                      id: variable.id,
                      field: "name",
                      value: event.target.value,
                    }),
                  )
                }
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`variable-options-${variable.id}`}>
                Options, one per line
              </Label>
              <Textarea
                id={`variable-options-${variable.id}`}
                value={variable.options}
                onChange={(event) =>
                  dispatch(
                    agentAssignmentsActions.updateVariable({
                      id: variable.id,
                      field: "options",
                      value: event.target.value,
                    }),
                  )
                }
                rows={3}
                disabled={disabled}
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="self-end"
              onClick={() =>
                dispatch(agentAssignmentsActions.removeVariable(variable.id))
              }
              disabled={disabled || state.variables.length === 1}
              aria-label={`Remove variable ${variable.name || variable.id}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}

        <div className="grid gap-3 sm:grid-cols-2">
          {mode === "independent_random" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="assignment-count">Assignments to draw</Label>
                <Input
                  id="assignment-count"
                  type="number"
                  min={1}
                  max={100000}
                  value={state.count}
                  onChange={(event) =>
                    dispatch(
                      agentAssignmentsActions.setCount(Number(event.target.value)),
                    )
                  }
                  disabled={disabled}
                />
              </div>
              <ToggleRow
                label="Without replacement"
                checked={state.withoutReplacement}
                onCheckedChange={(checked) =>
                  dispatch(agentAssignmentsActions.setWithoutReplacement(checked))
                }
                disabled={disabled}
              />
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="assignment-limit">Maximum combinations</Label>
              <Input
                id="assignment-limit"
                type="number"
                min={1}
                max={100000}
                value={state.limit}
                onChange={(event) =>
                  dispatch(
                    agentAssignmentsActions.setLimit(Number(event.target.value)),
                  )
                }
                disabled={disabled}
              />
            </div>
          )}
          <ToggleRow
            label="Randomize materialized order"
            checked={state.randomizeOrder}
            onCheckedChange={(checked) =>
              dispatch(agentAssignmentsActions.setRandomizeOrder(checked))
            }
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <Label className="text-sm">{label}</Label>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

function ApiReference({ mode }: { mode: AssignmentDemoMode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Public API used here</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 font-mono text-xs text-muted-foreground">
        {mode === "single_random" ? (
          <p>POST /api/ai/agents/&#123;agent_id&#125;</p>
        ) : (
          <>
            <p>POST /api/ai/agent-assignments</p>
            <p>GET /api/ai/agent-assignments/sessions/&#123;session_id&#125;</p>
            <p>
              POST /api/ai/agent-assignments/sessions/&#123;session_id&#125;/cancel
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ResultsPanel() {
  const state = useAppSelector(selectAgentAssignmentsDemo);
  if (state.mode === "single_random") {
    if (!state.streamedText) return null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agent response</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm">{state.streamedText}</pre>
        </CardContent>
      </Card>
    );
  }
  if (!state.result) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Durable results ({state.result.items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.result.items.map((item) => (
          <article
            key={item.id}
            className="group space-y-2 rounded-md border border-border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{item.key}</span>
                <Badge variant="outline">{item.status}</Badge>
              </div>
              {/* A real conversation the run just produced — the whole point
                  of a durable result is being able to go read it. */}
              {item.conversation_id && (
                <MatrxUuidCell
                  value={item.conversation_id}
                  token="conversation"
                  label="Conversation"
                />
              )}
            </div>
            <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(item.values, null, 2)}
            </pre>
            {finalText(item.output) && (
              <div className="whitespace-pre-wrap text-sm">{finalText(item.output)}</div>
            )}
            {item.error && (
              <p className="text-sm text-destructive">{item.error.message}</p>
            )}
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

function finalText(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const final = (value as Record<string, unknown>).final_text;
  return typeof final === "string" ? final : null;
}
