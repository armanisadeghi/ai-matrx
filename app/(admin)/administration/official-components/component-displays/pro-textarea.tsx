"use client";

import React, { useMemo, useState } from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  ProJsonTextarea,
  type ProJsonValidationState,
  type ProJsonValidator,
} from "@/components/official/ProJsonTextarea";
import { Field } from "@/components/official/Field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

// Compact, code-style feature tag.
function FeatureTag({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="text-[10px] font-mono font-normal">
      {children}
    </Badge>
  );
}

// Section header + feature-tag row + variant frame, used for every demo.
function Variant({
  title,
  features,
  children,
  code,
}: {
  title: string;
  features: string[];
  children: React.ReactNode;
  code: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {features.map((f) => (
          <FeatureTag key={f}>{f}</FeatureTag>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        {children}
      </div>
      <pre className="text-[11px] leading-snug text-muted-foreground bg-muted rounded-md p-2 overflow-x-auto">
        {code}
      </pre>
    </div>
  );
}

export default function ProTextareaDisplay({
  component,
}: ComponentDisplayProps) {
  // Per-variant state — each isolated so demos don't bleed into each other.
  const [bare, setBare] = useState("");
  const [floating, setFloating] = useState("");
  const [fieldVal, setFieldVal] = useState("");
  const [chat, setChat] = useState("");
  const [cmdEnter, setCmdEnter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [grow, setGrow] = useState("");
  const [replaceMode, setReplaceMode] = useState("");
  const [minimal, setMinimal] = useState("");
  const [errVal, setErrVal] = useState("");
  const [cleanupDemo, setCleanupDemo] = useState(
    "so um basically what i wanted to say is that the the meeting went pretty good i think and we should probably like follow up with the client by next week maybe tuesday or wednesday",
  );
  const [jsonValue, setJsonValue] = useState(`{
  "name": "Support triage payload",
  "version": 0,
  "enabled": true,
  "rules": [
    {
      "field": "priority",
      "operator": "in",
      "value": ["low", "medium", "urgent"]
    }
  ],
  "extra": "This key is intentionally unknown"
}`);
  const [jsonValidation, setJsonValidation] =
    useState<ProJsonValidationState | null>(null);

  const jsonSchema = useMemo(
    () => ({
      type: "object",
      required: ["name", "version", "rules"],
      additionalProperties: true,
      properties: {
        name: { type: "string", minLength: 3 },
        version: { type: "integer", minimum: 1 },
        enabled: { type: "boolean" },
        rules: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["field", "operator", "value"],
            properties: {
              field: { type: "string", minLength: 1 },
              operator: { enum: ["eq", "neq", "in", "contains"] },
              value: {},
            },
          },
        },
      },
    }),
    [],
  );

  const jsonValidators = useMemo<ProJsonValidator[]>(
    () => [
      ({ parsed }) => {
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return [];
        }
        const data = parsed as Record<string, unknown>;
        if (data.enabled === false) {
          return [
            {
              kind: "custom",
              severity: "warning",
              path: "/enabled",
              message: "Disabled payloads can be saved, but agents may ignore them.",
              source: "demo custom validator",
            },
          ];
        }
        return [];
      },
    ],
    [],
  );

  if (!component) return null;

  // Single combined `code` block for the wrapper. Each variant below carries its
  // own focused snippet (3-8 lines) so the right thing is visible per section;
  // this top-level block summarizes the full prop surface.
  const code = `import { ProTextarea } from '@/components/official/ProTextarea';
import { ProJsonTextarea } from '@/components/official/ProJsonTextarea';
import { Field } from '@/components/official/Field';

// Every supported prop, with defaults inline.
<ProTextarea
  // --- text content (standard textarea) ---
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="…"                // ignored when floatingLabel is set
  disabled={false}
  rows={5}
  aria-invalid={false}           // turns floating label destructive

  // --- voice + streaming transcription ---
  onTranscriptionComplete={(text) => {}}   // final result callback
  onTranscriptionError={(err) => {}}       // error toast handled internally
  appendTranscript={true}                  // false = replace existing text
  protectTranscription={true}              // warn modal on unmount mid-record
  onRequestClose={() => {}}                // paired with .requestClose() expando

  // --- "…" actions menu (top-right, floats over text, hover-only) ---
  showCopyButton={true}            // Copy item in the menu
  enableCleanup={true}             // AI "Clean up" item — ON by default
  cleanupAgentId={null}            // override the cleanup agent (default: surface "clean" role)
  cleanupContextItems={[]}         // extra context blocks for the cleanup agent

  // --- submit button (bottom-right, primary) ---
  onSubmit={() => {}}                      // enables the button + shortcuts
  submitDisabled={false}                   // force-disable regardless of content
  isSubmitting={false}                     // spinner inside the Send icon
  submitLabel="Send"                       // tooltip / aria-label
  submitOnCmdEnter={true}                  // default true when onSubmit is set
  submitOnEnter={false}                    // plain Enter sends; Shift+Enter = newline

  // --- auto-grow ---
  autoGrow={false}
  minHeight={120}                          // px
  maxHeight={400}                          // px

  // --- floating label (dense forms, bg-card surface only) ---
  floatingLabel="Notes"                    // suppresses placeholder

  // --- styling escape hatches ---
  className=""                             // textarea
  wrapperClassName=""                      // relative wrapper
/>

<ProJsonTextarea
  value={json}
  onChange={(e) => setJson(e.target.value)}
  schema={jsonSchema}                      // JSON Schema via AJV
  rootType="object"
  allowedTopLevelKeys={["name", "version", "enabled", "rules"]}
  validators={[customValidator]}           // domain-specific checks
  onValidationChange={setValidation}
  surfaceName="matrx-user/demo-json"
  getApplicationScope={(state) => ({
    content: state.text,
    json_valid: state.isValid,
    json_issues: state.issues,
    page_state: { selectedModelId, activeTab }
  })}
/>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Tier-2 canonical textarea. Streaming voice, a hover-revealed '…' menu (Copy + AI Clean up, on by default), submit, auto-grow, floating label, and protection modal. Top-right controls float over the text and auto-hide while typing (mirrors the OS cursor)."
    >
      <div className="w-full max-w-3xl space-y-8">
        {/* Behaviour callouts the docstring guarantees — surfaced at the top so
            admins remember they exist without scrolling through every demo. */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-semibold text-foreground">
              Hover controls float over the text and auto-hide on keystroke.
            </span>{" "}
            The mic + &ldquo;…&rdquo; menu reserve no gutter — they overlay the
            text and reappear on mouse motion (never from focus), matching the
            OS cursor behaviour. Recording/transcribing always keeps the mic
            visible.
          </p>
          <p>
            <span className="font-semibold text-foreground">
              Streaming voice is live.
            </span>{" "}
            Partial transcript flows into the textarea as you speak; final
            result fires{" "}
            <code className="font-mono text-[11px]">
              onTranscriptionComplete
            </code>
            .
          </p>
          <p>
            <span className="font-semibold text-foreground">
              Protection modal is built in.
            </span>{" "}
            Closing while recording/transcribing pops an AlertDialog. Wire it
            via <code className="font-mono text-[11px]">requestClose()</code> on
            the ref +{" "}
            <code className="font-mono text-[11px]">onRequestClose</code>.
          </p>
        </div>

        {/* 1. Bare placeholder — the simplest possible usage */}
        <Variant
          title="1. Bare textarea"
          features={["placeholder", "voice", "… menu", "clean up", "no label"]}
          code={`<ProTextarea
  value={v}
  onChange={(e) => setV(e.target.value)}
  placeholder="Type or hit the mic…"
  className="min-h-[100px]"
/>`}
        >
          <ProTextarea
            value={bare}
            onChange={(e) => setBare(e.target.value)}
            placeholder="Type or hit the mic… (hover or click to reveal controls)"
            className="min-h-[100px]"
            onTranscriptionComplete={(t) =>
              toast.success("Voice input added", {
                description: t.slice(0, 80),
              })
            }
          />
        </Variant>

        {/* 2. Floating label — needs bg-card surface to mask the border */}
        <Variant
          title="2. Floating label (dense forms)"
          features={["floatingLabel", "bg-card only", "no placeholder"]}
          code={`<ProTextarea
  floatingLabel="Internal notes"
  value={v}
  onChange={(e) => setV(e.target.value)}
  className="min-h-[100px]"
/>`}
        >
          <ProTextarea
            floatingLabel="Internal notes"
            value={floating}
            onChange={(e) => setFloating(e.target.value)}
            className="min-h-[100px]"
          />
        </Variant>

        {/* 3. <Field> wrapper — above-label form with help, description, counter, error */}
        <Variant
          title="3. <Field> wrapper (above-label, full form chrome)"
          features={[
            "help tooltip",
            "description",
            "character counter",
            "error",
          ]}
          code={`<Field
  label="Bio"
  htmlFor="bio"
  required
  help="Markdown supported. Visible on your public profile."
  description="Tell visitors who you are."
  count={value.length}
  maxCount={280}
  error={value.length > 280 ? "Too long" : undefined}
>
  <ProTextarea
    id="bio"
    value={value}
    onChange={(e) => setValue(e.target.value)}
    placeholder="A short bio…"
    aria-invalid={value.length > 280}
    className="min-h-[90px]"
  />
</Field>`}
        >
          <Field
            label="Bio"
            htmlFor="pro-textarea-demo-bio"
            required
            help="Markdown supported. Visible on your public profile."
            description="Tell visitors who you are."
            count={fieldVal.length}
            maxCount={280}
            error={fieldVal.length > 280 ? "Bio is too long" : undefined}
          >
            <ProTextarea
              id="pro-textarea-demo-bio"
              value={fieldVal}
              onChange={(e) => setFieldVal(e.target.value)}
              placeholder="A short bio…"
              aria-invalid={fieldVal.length > 280}
              className="min-h-[90px]"
            />
          </Field>
        </Variant>

        {/* 4. Chat-style submit — Enter sends, Shift+Enter newline, auto-grow */}
        <Variant
          title="4. Chat send — Enter to submit, Shift+Enter for newline"
          features={["onSubmit", "submitOnEnter", "autoGrow", "Send button"]}
          code={`<ProTextarea
  value={msg}
  onChange={(e) => setMsg(e.target.value)}
  onSubmit={() => {
    sendMessage(msg);
    setMsg("");
  }}
  submitOnEnter
  autoGrow
  minHeight={56}
  maxHeight={200}
  placeholder="Message the agent…"
/>`}
        >
          <ProTextarea
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            onSubmit={() => {
              toast.success("Message sent", { description: chat });
              setChat("");
            }}
            submitOnEnter
            autoGrow
            minHeight={56}
            maxHeight={200}
            placeholder="Message the agent… (Enter sends, Shift+Enter newline)"
          />
        </Variant>

        {/* 5. Cmd/Ctrl+Enter submit with isSubmitting spinner */}
        <Variant
          title="5. Cmd/Ctrl+Enter submit with loading state"
          features={[
            "onSubmit",
            "isSubmitting",
            "submitDisabled",
            "submitLabel",
          ]}
          code={`<ProTextarea
  value={v}
  onChange={(e) => setV(e.target.value)}
  onSubmit={async () => {
    setSubmitting(true);
    await save(v);
    setSubmitting(false);
  }}
  isSubmitting={submitting}
  submitDisabled={!v.trim()}
  submitLabel="Save draft"
  placeholder="Cmd/Ctrl+Enter to save…"
  className="min-h-[100px]"
/>`}
        >
          <ProTextarea
            value={cmdEnter}
            onChange={(e) => setCmdEnter(e.target.value)}
            onSubmit={() => {
              setSubmitting(true);
              setTimeout(() => {
                setSubmitting(false);
                toast.success("Saved", { description: cmdEnter.slice(0, 80) });
                setCmdEnter("");
              }, 900);
            }}
            isSubmitting={submitting}
            submitLabel="Save draft"
            placeholder="Cmd/Ctrl+Enter to save…"
            className="min-h-[100px]"
          />
        </Variant>

        {/* 6. Auto-grow within a clamped range */}
        <Variant
          title="6. Auto-grow (clamped min/max)"
          features={["autoGrow", "minHeight", "maxHeight"]}
          code={`<ProTextarea
  autoGrow
  minHeight={60}
  maxHeight={240}
  value={v}
  onChange={(e) => setV(e.target.value)}
  placeholder="Grows with your content up to 240px…"
/>`}
        >
          <ProTextarea
            autoGrow
            minHeight={60}
            maxHeight={240}
            value={grow}
            onChange={(e) => setGrow(e.target.value)}
            placeholder="Grows with your content up to 240px…"
          />
        </Variant>

        {/* 7. Replace-mode voice (appendTranscript={false}) */}
        <Variant
          title="7. Voice in replace mode"
          features={["appendTranscript={false}", "overwrites existing text"]}
          code={`<ProTextarea
  value={v}
  onChange={(e) => setV(e.target.value)}
  appendTranscript={false}      // overwrites instead of appending
  placeholder="Speak to replace what's typed…"
  className="min-h-[100px]"
/>`}
        >
          <ProTextarea
            value={replaceMode}
            onChange={(e) => setReplaceMode(e.target.value)}
            appendTranscript={false}
            placeholder="Type something, then hit the mic — the recording replaces it."
            className="min-h-[100px]"
          />
        </Variant>

        {/* 8. Minimal — no menu at all (voice only), used in compact toolbars */}
        <Variant
          title="8. Minimal (no menu — voice only)"
          features={[
            "showCopyButton={false}",
            "enableCleanup={false}",
            "voice only",
          ]}
          code={`<ProTextarea
  value={v}
  onChange={(e) => setV(e.target.value)}
  showCopyButton={false}    // hide Copy
  enableCleanup={false}     // hide AI Clean up
  placeholder="Mic only — the … menu is gone."
  className="min-h-[80px]"
/>`}
        >
          <ProTextarea
            value={minimal}
            onChange={(e) => setMinimal(e.target.value)}
            showCopyButton={false}
            enableCleanup={false}
            placeholder="Mic only — the … menu is gone."
            className="min-h-[80px]"
          />
        </Variant>

        {/* 9. Error state via aria-invalid + Field */}
        <Variant
          title="9. Error state (aria-invalid)"
          features={["aria-invalid", "Field error", "destructive label"]}
          code={`<Field
  label="Reason"
  htmlFor="reason"
  error="Reason is required"
>
  <ProTextarea
    id="reason"
    value={v}
    onChange={(e) => setV(e.target.value)}
    aria-invalid
    placeholder="…"
    className="min-h-[80px]"
  />
</Field>`}
        >
          <Field
            label="Reason"
            htmlFor="pro-textarea-demo-reason"
            error={errVal.trim() ? undefined : "Reason is required"}
          >
            <ProTextarea
              id="pro-textarea-demo-reason"
              value={errVal}
              onChange={(e) => setErrVal(e.target.value)}
              aria-invalid={!errVal.trim()}
              placeholder="Start typing to clear the error…"
              className="min-h-[80px]"
            />
          </Field>
        </Variant>

        {/* 10. Disabled */}
        <Variant
          title="10. Disabled"
          features={["disabled", "controls hidden", "no hover state"]}
          code={`<ProTextarea
  value="Locked content"
  disabled
  className="min-h-[80px]"
/>`}
        >
          <ProTextarea
            value="Locked content — controls don't appear on hover, mic and the … menu are inert."
            onChange={() => {}}
            disabled
            className="min-h-[80px]"
          />
        </Variant>

        {/* 11. AI Clean up — default-on menu action */}
        <Variant
          title="11. AI Clean up (on by default)"
          features={["enableCleanup (default)", "… menu", "streamed result"]}
          code={`<ProTextarea
  value={v}
  onChange={(e) => setV(e.target.value)}
  // enableCleanup is true by default — open the … menu → Clean up.
  // cleanupAgentId={"…"}            // optional override
  // cleanupContextItems={[…]}       // optional extra context
  minHeight={120}
/>`}
        >
          <ProTextarea
            value={cleanupDemo}
            onChange={(e) => setCleanupDemo(e.target.value)}
            placeholder="Type something messy, then … menu → Clean up."
            className="min-h-[120px]"
          />
        </Variant>

        {/* 12. JSON wrapper — ProTextarea plus non-blocking validation */}
        <Variant
          title="12. ProJsonTextarea (schema + custom validation)"
          features={[
            "JSON syntax",
            "AJV schema",
            "custom validators",
            "agent scope",
            "non-blocking",
          ]}
          code={`<ProJsonTextarea
  value={json}
  onChange={(e) => setJson(e.target.value)}
  schema={jsonSchema}
  rootType="object"
  allowedTopLevelKeys={["name", "version", "enabled", "rules"]}
  validators={jsonValidators}
  onValidationChange={setJsonValidation}
  surfaceName="matrx-user/demo-json"
  getApplicationScope={(state) => ({
    content: state.text,
    json_valid: state.isValid,
    json_issues: state.issues,
    demo_state: { route: "official-components", component: "ProTextarea" },
  })}
  autoGrow
  minHeight={260}
  maxHeight={460}
/>`}
        >
          <div className="space-y-3">
            <ProJsonTextarea
              value={jsonValue}
              onChange={(e) => setJsonValue(e.target.value)}
              schema={jsonSchema}
              rootType="object"
              allowedTopLevelKeys={["name", "version", "enabled", "rules"]}
              validators={jsonValidators}
              onValidationChange={setJsonValidation}
              surfaceName="matrx-user/demo-json"
              getApplicationScope={(state) => ({
                content: state.text,
                json_valid: state.isValid,
                json_issues: state.issues,
                demo_state: {
                  route: "official-components",
                  component: "ProTextarea",
                  validationBadge: state.isValid ? "valid" : "has issues",
                  currentLength: state.text.length,
                },
              })}
              autoGrow
              minHeight={260}
              maxHeight={460}
              placeholder={`{\n  "name": "Example",\n  "version": 1,\n  "rules": []\n}`}
            />
            <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <span className="font-semibold text-foreground">Parsed:</span>{" "}
                {jsonValidation?.isJson ? "yes" : "no"}
              </div>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <span className="font-semibold text-foreground">Errors:</span>{" "}
                {jsonValidation?.errors.length ?? 0}
              </div>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <span className="font-semibold text-foreground">
                  Warnings:
                </span>{" "}
                {jsonValidation?.warnings.length ?? 0}
              </div>
            </div>
          </div>
        </Variant>

        {/* Programmatic protection — the requestClose() expando pattern */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Programmatic protection (modal & popover unmount)
            </h3>
            <FeatureTag>ref.requestClose()</FeatureTag>
            <FeatureTag>onRequestClose</FeatureTag>
            <FeatureTag>protectTranscription</FeatureTag>
          </div>
          <pre className="text-[11px] leading-snug text-muted-foreground bg-muted rounded-md p-3 overflow-x-auto">{`const ref = useRef<ProTextareaElement>(null);

// Caller asks the textarea to close. If a recording or transcription is in
// flight, ProTextarea pops its own AlertDialog. When the user confirms (or
// the in-flight work finishes), onRequestClose fires and you actually close.
function handleClose() {
  ref.current?.requestClose?.();
}

<ProTextarea
  ref={ref}
  value={v}
  onChange={(e) => setV(e.target.value)}
  protectTranscription   // default true; set false to skip the modal
  onRequestClose={() => closeModal()}
/>`}</pre>
          <p className="text-xs text-muted-foreground">
            The element is a real{" "}
            <code className="font-mono">HTMLTextAreaElement</code>;{" "}
            <code className="font-mono">requestClose</code> and{" "}
            <code className="font-mono">isTranscribing</code> live on it as
            expando methods. Focus, blur, and select still work normally.
          </p>
        </div>

        {/* Keyboard shortcut cheat-sheet */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Keyboard shortcuts (when{" "}
            <code className="font-mono text-xs">onSubmit</code> is set)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2 border-b border-border/50 pb-1">
              <span>Submit (default)</span>
              <kbd className="font-mono">⌘/Ctrl + Enter</kbd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/50 pb-1">
              <span>
                Submit with <code className="font-mono">submitOnEnter</code>
              </span>
              <kbd className="font-mono">Enter</kbd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/50 pb-1">
              <span>Newline (when submitOnEnter)</span>
              <kbd className="font-mono">Shift + Enter</kbd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/50 pb-1">
              <span>Disable Cmd+Enter explicitly</span>
              <code className="font-mono">submitOnCmdEnter={`{false}`}</code>
            </div>
          </div>
        </div>

        {/* Migration / aliasing reminder */}
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-semibold">Legacy alias</p>
          <p>
            <code className="font-mono">
              @/components/official/VoiceTextarea
            </code>{" "}
            still works — it&apos;s a deprecated re-export shim around{" "}
            <code className="font-mono">ProTextarea</code>. New code should
            import <code className="font-mono">ProTextarea</code> directly.
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(
                  `import { ProTextarea } from "@/components/official/ProTextarea";`,
                );
                toast.success("Import copied");
              }}
            >
              Copy import
            </Button>
          </div>
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
}
