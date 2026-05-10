/**
 * slot-stubs — starter source for Tier-2 slot overrides.
 *
 * When a user toggles `slot_overrides[slot] = 'custom'` on a shell, the
 * code editor opens with the corresponding stub pre-loaded. Each stub
 * documents the props the slot receives at runtime and shows a minimal
 * working override that exercises the public hook contract.
 *
 * Slot props mirror the `useAgentApp()` return shape — anything the hook
 * exposes is passed through, so users can copy the same patterns the
 * built-in shells use.
 */
import type { AgentAppSlotName } from "@/features/agent-apps/types";

const VARIABLE_INPUT_STUB = `// Variable input slot — replaces the default SmartAgentVariables form.
// Props (from useAgentApp): variables, setVariable, variableDefinitions,
// submit, isExecuting.

function CustomVariableInput({
  variables,
  setVariable,
  variableDefinitions,
  submit,
  isExecuting,
}) {
  const defs = variableDefinitions || [];
  return (
    <div className="space-y-3">
      {defs.map((def) => (
        <div key={def.name}>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {def.label || def.name}
          </Label>
          <Input
            value={variables[def.name] ?? ""}
            onChange={(e) => setVariable(def.name, e.target.value)}
            placeholder={def.placeholder || def.name}
            className="mt-1"
          />
        </div>
      ))}
      <Button
        onClick={() => submit()}
        disabled={isExecuting}
        size="sm"
      >
        {isExecuting ? "Running…" : "Run"}
      </Button>
    </div>
  );
}

export default CustomVariableInput;
`;

const RESULT_RENDERER_STUB = `// Result renderer slot — replaces MarkdownStream for the agent's response.
// Useful when the agent emits structured JSON/XML you want to parse into
// bespoke UI (e.g. card grids, charts, custom interactive widgets).
// Props (from useAgentApp): response, isStreaming, requestId, conversationId.

function CustomResultRenderer({ response, isStreaming }) {
  // Try to parse the response as JSON; fall through to plain text.
  let parsed = null;
  try { parsed = JSON.parse(response); } catch {}

  if (parsed && Array.isArray(parsed.items)) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {parsed.items.map((item, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-sm">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {item.body}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="prose prose-sm max-w-none">
      <Markdown content={response} isStreamActive={isStreaming} />
    </div>
  );
}

export default CustomResultRenderer;
`;

const MESSAGE_DISPLAY_STUB = `// Message display slot — replaces the entire conversation transcript.
// Props (from useAgentApp): messages, isStreaming, response.

function CustomMessageDisplay({ messages, isStreaming, response }) {
  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div key={m.id} className="border rounded-md p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            {m.role}
          </div>
          <div className="text-sm whitespace-pre-wrap">{m.content}</div>
        </div>
      ))}
      {isStreaming && response && (
        <div className="border border-primary/40 rounded-md p-3">
          <div className="text-xs uppercase tracking-wider text-primary mb-1">
            Assistant (streaming)
          </div>
          <Markdown content={response} isStreamActive />
        </div>
      )}
    </div>
  );
}

export default CustomMessageDisplay;
`;

const PRE_EXECUTION_GATE_STUB = `// Pre-execution gate slot — shown before the first run.
// Useful for consent, onboarding, or context gathering that must happen
// once before the agent starts.
// Props (from useAgentApp): submit, setVariable, setContext, agent.
// Plus: onContinue() — called when the gate is dismissed.

function CustomPreExecutionGate({ onContinue, agent, setContext }) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) return null;

  return (
    <div className="max-w-md mx-auto p-6 rounded-lg border border-border bg-card">
      <h2 className="text-lg font-semibold mb-2">
        {agent?.name || "Welcome"}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        This app uses your context to generate a response. Review the inputs
        on the next screen before running.
      </p>
      <Button
        onClick={() => {
          setConfirmed(true);
          onContinue();
        }}
        size="sm"
      >
        Continue
      </Button>
    </div>
  );
}

export default CustomPreExecutionGate;
`;

const HEADER_STUB = `// Header slot — replaces the shell's title row.
// Props: app (record), agent (definition).

function CustomHeader({ app, agent }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
      <div>
        <h1 className="text-base font-semibold">{app.name}</h1>
        {app.tagline && (
          <p className="text-xs text-muted-foreground">{app.tagline}</p>
        )}
      </div>
      {agent && (
        <span className="text-xs text-muted-foreground">
          via {agent.name}
        </span>
      )}
    </div>
  );
}

export default CustomHeader;
`;

const APP_STUB = `// Fully custom app — the entire UI lives here.
// Props (from useAgentApp): all hook fields. See useAgentApp.ts for full list.

function CustomApp({
  agent,
  variables,
  setVariable,
  variableDefinitions,
  submit,
  response,
  isStreaming,
  isExecuting,
  error,
}) {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">{agent?.name || "Agent"}</h1>
      {(variableDefinitions || []).map((def) => (
        <div key={def.name}>
          <Label>{def.label || def.name}</Label>
          <Input
            value={variables[def.name] ?? ""}
            onChange={(e) => setVariable(def.name, e.target.value)}
          />
        </div>
      ))}
      <Button onClick={() => submit()} disabled={isExecuting}>
        {isExecuting ? "Running…" : "Run"}
      </Button>
      {error && <div className="text-sm text-destructive">{error}</div>}
      {(response || isStreaming) && (
        <Markdown content={response} isStreamActive={isStreaming} />
      )}
    </div>
  );
}

export default CustomApp;
`;

export const SLOT_STUBS: Record<AgentAppSlotName, string> = {
  variableInput: VARIABLE_INPUT_STUB,
  resultRenderer: RESULT_RENDERER_STUB,
  messageDisplay: MESSAGE_DISPLAY_STUB,
  preExecutionGate: PRE_EXECUTION_GATE_STUB,
  input: VARIABLE_INPUT_STUB, // alias for shells that label this differently
  header: HEADER_STUB,
  historySidebar: APP_STUB, // generic stub; sidebar override is rare
  app: APP_STUB,
};

export interface SlotMeta {
  name: AgentAppSlotName;
  label: string;
  description: string;
}

/**
 * Slot catalog per shell — defines which slots a shell exposes. The
 * editor renders an "Override" toggle for each entry; the runtime only
 * reads code for slots the active shell knows how to render.
 */
export const SHELL_SLOT_CATALOG: Record<string, SlotMeta[]> = {
  chat: [
    {
      name: "variableInput",
      label: "Variable input",
      description: "Override the variable form (Smart Variables).",
    },
    {
      name: "resultRenderer",
      label: "Result renderer",
      description: "Custom rendering for agent output (replaces MarkdownStream).",
    },
    {
      name: "messageDisplay",
      label: "Message display",
      description: "Replace the conversation transcript wholesale.",
    },
    {
      name: "preExecutionGate",
      label: "Pre-execution gate",
      description: "Welcome / consent / setup screen shown before the first run.",
    },
    {
      name: "header",
      label: "Header",
      description: "Override the shell's title row.",
    },
  ],
  form_to_result: [
    {
      name: "variableInput",
      label: "Variable input",
      description: "Override the variable form.",
    },
    {
      name: "resultRenderer",
      label: "Result renderer",
      description: "Custom rendering for the agent's response.",
    },
    {
      name: "preExecutionGate",
      label: "Pre-execution gate",
      description: "Welcome / consent screen shown before the first run.",
    },
    {
      name: "header",
      label: "Header",
      description: "Override the shell's title row.",
    },
  ],
  widget: [
    {
      name: "variableInput",
      label: "Variable input",
      description: "Override the variable form.",
    },
    {
      name: "resultRenderer",
      label: "Result renderer",
      description: "Custom rendering for the agent's response.",
    },
  ],
  fully_custom: [
    {
      name: "app",
      label: "App",
      description: "The full app UI lives here.",
    },
  ],
};

export function getSlotsForShell(shellKind: string): SlotMeta[] {
  return SHELL_SLOT_CATALOG[shellKind] ?? [];
}
