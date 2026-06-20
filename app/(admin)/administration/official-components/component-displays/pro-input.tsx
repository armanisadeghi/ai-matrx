"use client";

import React, { useState } from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { ProInput } from "@/components/official/ProInput";
import { Field } from "@/components/official/Field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

function FeatureTag({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="text-[10px] font-mono font-normal">
      {children}
    </Badge>
  );
}

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

export default function ProInputDisplay({ component }: ComponentDisplayProps) {
  const [bare, setBare] = useState("");
  const [floating, setFloating] = useState("");
  const [fieldVal, setFieldVal] = useState("");
  const [search, setSearch] = useState("");
  const [cmdEnter, setCmdEnter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replaceMode, setReplaceMode] = useState("");
  const [minimal, setMinimal] = useState("");
  const [errVal, setErrVal] = useState("");
  const [navFirst, setNavFirst] = useState("");
  const [navSecond, setNavSecond] = useState("");

  if (!component) return null;

  const code = `import { ProInput } from '@/components/official/ProInput';
import { Field } from '@/components/official/Field';

<ProInput
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="…"                // ignored when floatingLabel is set
  disabled={false}
  aria-invalid={false}

  onTranscriptionComplete={(text) => {}}
  onTranscriptionError={(err) => {}}
  appendTranscript={true}                  // false = replace existing text
  protectTranscription={true}
  onRequestClose={() => {}}

  showCopyButton={true}                     // Copy item in the "…" menu

  onSubmit={() => {}}
  submitDisabled={false}
  isSubmitting={false}
  submitLabel="Send"
  submitOnCmdEnter={true}
  submitOnEnter={false}
  onEnterKey={(e) => {}}                    // field-nav: Enter advances instead of submitting

  floatingLabel="Title"

  className=""
  wrapperClassName=""
/>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Tier-2 canonical single-line input. Streaming voice, a hover-revealed '…' menu (Copy, extensible), submit, floating label, and protection modal. Hover-only controls float over the text and auto-hide while typing."
    >
      <div className="w-full max-w-3xl space-y-8">
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-semibold text-foreground">
              Hover controls float over the text and auto-hide on keystroke.
            </span>{" "}
            The mic + &ldquo;…&rdquo; menu reserve no gutter and reappear on
            mouse motion (never from focus). Recording/transcribing always keeps
            the mic visible.
          </p>
          <p>
            <span className="font-semibold text-foreground">
              Submit sits inline at the right edge.
            </span>{" "}
            Unlike ProTextarea (bottom-right), the Send button is vertically
            centered in the input row.
          </p>
          <p>
            <span className="font-semibold text-foreground">
              Voice status renders below the field.
            </span>{" "}
            Listening / finalizing chips sit under the input so they never
            overlap typed text.
          </p>
        </div>

        <Variant
          title="1. Bare input"
          features={["placeholder", "voice", "… menu", "no label"]}
          code={`<ProInput
  value={v}
  onChange={(e) => setV(e.target.value)}
  placeholder="Type or hit the mic…"
/>`}
        >
          <ProInput
            value={bare}
            onChange={(e) => setBare(e.target.value)}
            placeholder="Type or hit the mic… (hover to reveal controls)"
            onTranscriptionComplete={(t) =>
              toast.success("Voice input added", {
                description: t.slice(0, 80),
              })
            }
          />
        </Variant>

        <Variant
          title="2. Floating label (dense forms)"
          features={["floatingLabel", "bg-card only"]}
          code={`<ProInput
  floatingLabel="Project name"
  value={v}
  onChange={(e) => setV(e.target.value)}
/>`}
        >
          <ProInput
            floatingLabel="Project name"
            value={floating}
            onChange={(e) => setFloating(e.target.value)}
          />
        </Variant>

        <Variant
          title="3. <Field> wrapper (above-label)"
          features={["help", "description", "counter", "error"]}
          code={`<Field label="Display name" htmlFor="name" required count={value.length} maxCount={40}>
  <ProInput id="name" value={value} onChange={…} />
</Field>`}
        >
          <Field
            label="Display name"
            htmlFor="pro-input-demo-name"
            required
            help="Shown on your profile."
            description="Keep it short and recognizable."
            count={fieldVal.length}
            maxCount={40}
            error={fieldVal.length > 40 ? "Too long" : undefined}
          >
            <ProInput
              id="pro-input-demo-name"
              value={fieldVal}
              onChange={(e) => setFieldVal(e.target.value)}
              placeholder="Your name…"
              aria-invalid={fieldVal.length > 40}
            />
          </Field>
        </Variant>

        <Variant
          title="4. Search / quick send — Enter to submit"
          features={["onSubmit", "submitOnEnter", "Send button"]}
          code={`<ProInput
  value={q}
  onChange={(e) => setQ(e.target.value)}
  onSubmit={() => { search(q); setQ(""); }}
  submitOnEnter
  placeholder="Search…"
/>`}
        >
          <ProInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSubmit={() => {
              toast.success("Search sent", { description: search });
              setSearch("");
            }}
            submitOnEnter
            placeholder="Search… (Enter sends)"
          />
        </Variant>

        <Variant
          title="5. Field navigation — Enter jumps to the next field"
          features={["onEnterKey", "sequential forms"]}
          code={`<ProInput
  value={first}
  onChange={(e) => setFirst(e.target.value)}
  onEnterKey={() => secondRef.current?.focus()}
  placeholder="First… (Enter → next)"
/>
<ProInput
  ref={secondRef}
  value={second}
  onChange={(e) => setSecond(e.target.value)}
  placeholder="Second…"
/>`}
        >
          <div className="space-y-2" data-pro-input-nav>
            <ProInput
              value={navFirst}
              onChange={(e) => setNavFirst(e.target.value)}
              onEnterKey={(e) => {
                e.currentTarget
                  .closest("[data-pro-input-nav]")
                  ?.querySelector<HTMLInputElement>("[data-nav-second]")
                  ?.focus();
              }}
              placeholder="First field — type, then press Enter"
            />
            <ProInput
              value={navSecond}
              onChange={(e) => setNavSecond(e.target.value)}
              data-nav-second
              placeholder="Second field — Enter landed you here"
            />
          </div>
        </Variant>

        <Variant
          title="6. Cmd/Ctrl+Enter submit with loading state"
          features={["onSubmit", "isSubmitting", "submitLabel"]}
          code={`<ProInput
  value={v}
  onChange={(e) => setV(e.target.value)}
  onSubmit={async () => { … }}
  isSubmitting={submitting}
  submitLabel="Save"
  placeholder="Cmd/Ctrl+Enter to save…"
/>`}
        >
          <ProInput
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
            submitLabel="Save"
            placeholder="Cmd/Ctrl+Enter to save…"
          />
        </Variant>

        <Variant
          title="7. Voice in replace mode"
          features={["appendTranscript={false}"]}
          code={`<ProInput
  value={v}
  onChange={(e) => setV(e.target.value)}
  appendTranscript={false}
  placeholder="Speak to replace…"
/>`}
        >
          <ProInput
            value={replaceMode}
            onChange={(e) => setReplaceMode(e.target.value)}
            appendTranscript={false}
            placeholder="Type something, then hit the mic — recording replaces it."
          />
        </Variant>

        <Variant
          title="8. Minimal (no menu — voice only)"
          features={["showCopyButton={false}"]}
          code={`<ProInput
  value={v}
  onChange={(e) => setV(e.target.value)}
  showCopyButton={false}    // empties the menu → "…" is hidden
  placeholder="Mic only."
/>`}
        >
          <ProInput
            value={minimal}
            onChange={(e) => setMinimal(e.target.value)}
            showCopyButton={false}
            placeholder="Mic only — the … menu is hidden."
          />
        </Variant>

        <Variant
          title="9. Error state (aria-invalid)"
          features={["aria-invalid", "Field error"]}
          code={`<Field label="Reason" htmlFor="reason" error="Required">
  <ProInput id="reason" value={v} onChange={…} aria-invalid />
</Field>`}
        >
          <Field
            label="Reason"
            htmlFor="pro-input-demo-reason"
            error={errVal.trim() ? undefined : "Reason is required"}
          >
            <ProInput
              id="pro-input-demo-reason"
              value={errVal}
              onChange={(e) => setErrVal(e.target.value)}
              aria-invalid={!errVal.trim()}
              placeholder="Start typing to clear the error…"
            />
          </Field>
        </Variant>

        <Variant
          title="10. Disabled"
          features={["disabled"]}
          code={`<ProInput value="Locked" disabled />`}
        >
          <ProInput
            value="Locked — controls don't appear on hover."
            onChange={() => {}}
            disabled
          />
        </Variant>

        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-semibold">Legacy alias</p>
          <p>
            <code className="font-mono">@/components/official/VoiceInput</code>{" "}
            is a deprecated re-export shim around{" "}
            <code className="font-mono">ProInput</code>. New code should import{" "}
            <code className="font-mono">ProInput</code> directly.
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(
                  `import { ProInput } from "@/components/official/ProInput";`,
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
