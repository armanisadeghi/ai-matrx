"use client";

import * as React from "react";
import { Mail, Zap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Field } from "@/components/official/Field";

// ─────────────────────────────────────────────────────────────────────────────
// Demo card primitive
// ─────────────────────────────────────────────────────────────────────────────

function DemoCard({
  title,
  subtitle,
  code,
  children,
}: {
  title: string;
  subtitle: string;
  code: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="p-4">{children}</div>
      <details className="border-t border-border bg-muted/30 group">
        <summary className="px-4 py-2 text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors flex items-center justify-between">
          <span>Show usage</span>
          <span className="opacity-50 group-open:rotate-180 transition-transform">
            ▾
          </span>
        </summary>
        <pre className="px-4 pb-3 text-[11px] leading-relaxed font-mono text-foreground/80 overflow-x-auto whitespace-pre">
          {code}
        </pre>
      </details>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main demo
// ─────────────────────────────────────────────────────────────────────────────

export default function TextareaTiersDemo() {
  // Tier 1
  const [t1, setT1] = React.useState("");

  // Tier 2 examples
  const [bare, setBare] = React.useState("");
  const [labeled, setLabeled] = React.useState("");
  const [optional, setOptional] = React.useState("");
  const [helped, setHelped] = React.useState("");
  const [described, setDescribed] = React.useState(
    "We support **markdown** in this field.",
  );
  const [errored, setErrored] = React.useState("ab");
  const [counted, setCounted] = React.useState(
    "This is a bio with a soft character limit.",
  );
  const [floating, setFloating] = React.useState("");
  const [prefixed, setPrefixed] = React.useState("");
  const [kitchen, setKitchen] = React.useState(
    "Hi team — leaving Friday early for a doctor's appointment, will be back online Monday morning.",
  );

  return (
    <div className="space-y-10">
      {/* ───────── Architecture ───────── */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground mb-3">
          Two textareas, one wrapper
        </h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="rounded-md border border-border bg-background/40 p-3">
            <div className="font-mono text-xs text-primary mb-1">
              Tier 1 · Textarea
            </div>
            <div className="text-foreground font-medium mb-1">
              The shadcn primitive
            </div>
            <p className="text-xs text-muted-foreground">
              Plain textarea. Use when you need a raw text field with no extras
              — admin diff inputs, debug consoles, hidden fields.
            </p>
          </div>
          <div className="rounded-md border border-border bg-background/40 p-3">
            <div className="font-mono text-xs text-primary mb-1">
              Tier 2 · ProTextarea
            </div>
            <div className="text-foreground font-medium mb-1">
              The user-content workhorse
            </div>
            <p className="text-xs text-muted-foreground">
              Voice input, copy, optional submit (⌘+Enter), auto-grow, optional
              floating label. Default for comments, descriptions, notes, bios,
              prompts, status updates.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">
            One canonical wrapper covers everything else. No prop bloat, no
            choosing between five variants.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 ml-1">
            <li>
              <span className="font-mono text-foreground">{"<Field>"}</span> —
              above-label form chrome (label, required/optional, help icon,
              description, error, char count). Wraps any input.
            </li>
            <li>
              <span className="font-mono text-foreground">
                {'floatingLabel="…"'}
              </span>{" "}
              — built-in dense-form label baked into ProTextarea. No wrapper
              needed.
            </li>
          </ul>
        </div>
      </section>

      {/* ───────── Tier 1 ───────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Tier 1 — bare primitive
        </h2>
        <DemoCard
          title="Plain Textarea"
          subtitle="No decoration, no features. Use only for primitive cases."
          code={`<Textarea
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Plain text…"
/>`}
        >
          <Textarea
            value={t1}
            onChange={(e) => setT1(e.target.value)}
            placeholder="Plain text…"
            rows={3}
          />
        </DemoCard>
      </section>

      {/* ───────── Tier 2 ───────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Tier 2 — ProTextarea (default for user content)
        </h2>
        <div className="grid lg:grid-cols-2 gap-4">
          <DemoCard
            title="Bare ProTextarea"
            subtitle="Voice + copy out of the box. Submit only when you opt in."
            code={`<ProTextarea
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Type or use the mic…"
/>`}
          >
            <ProTextarea
              value={bare}
              onChange={(e) => setBare(e.target.value)}
              placeholder="Type or use the mic…"
              rows={3}
            />
          </DemoCard>

          <DemoCard
            title="With label + required"
            subtitle="Field wraps any input. Red asterisk for required. htmlFor + id wires accessibility."
            code={`<Field label="Title" htmlFor="title" required>
  <ProTextarea
    id="title"
    value={value}
    onChange={…}
  />
</Field>`}
          >
            <Field label="Title" required htmlFor="ex-labeled">
              <ProTextarea
                id="ex-labeled"
                value={labeled}
                onChange={(e) => setLabeled(e.target.value)}
                placeholder="Give your task a name…"
                rows={2}
              />
            </Field>
          </DemoCard>

          <DemoCard
            title="With (optional) tag"
            subtitle="Greyed inline marker — non-required fields read clearly."
            code={`<Field label="Subtitle" htmlFor="subtitle" optional>
  <ProTextarea id="subtitle" … />
</Field>`}
          >
            <Field label="Subtitle" optional htmlFor="ex-optional">
              <ProTextarea
                id="ex-optional"
                value={optional}
                onChange={(e) => setOptional(e.target.value)}
                placeholder="Optional context…"
                rows={2}
              />
            </Field>
          </DemoCard>

          <DemoCard
            title="With help icon"
            subtitle="Hover the ? — uses shadcn Tooltip. For richer help with copy + AI assistance, use the standalone HelpIcon component instead."
            code={`<Field
  label="Slug"
  htmlFor="slug"
  help="A short URL-safe identifier. Lowercase, no spaces."
>
  <ProTextarea id="slug" … />
</Field>`}
          >
            <Field
              label="Slug"
              htmlFor="ex-helped"
              help="A short URL-safe identifier. Lowercase, no spaces. Used in the public URL."
            >
              <ProTextarea
                id="ex-helped"
                value={helped}
                onChange={(e) => setHelped(e.target.value)}
                placeholder="my-cool-page"
                rows={2}
              />
            </Field>
          </DemoCard>

          <DemoCard
            title="With description"
            subtitle="Description renders between label and input — perfect for Markdown hints, format rules."
            code={`<Field
  label="Bio"
  htmlFor="bio"
  description="Markdown supported. Visible on your public profile."
>
  <ProTextarea id="bio" … />
</Field>`}
          >
            <Field
              label="Bio"
              htmlFor="ex-described"
              description="Markdown supported. Visible on your public profile."
            >
              <ProTextarea
                id="ex-described"
                value={described}
                onChange={(e) => setDescribed(e.target.value)}
                placeholder="Tell us about yourself…"
                rows={3}
              />
            </Field>
          </DemoCard>

          <DemoCard
            title="With error state"
            subtitle="Error replaces description and recolors the label. Pair with aria-invalid on the input."
            code={`<Field
  label="Description"
  htmlFor="desc"
  error={value.length < 10 ? "At least 10 chars." : undefined}
>
  <ProTextarea
    id="desc"
    aria-invalid={value.length < 10}
    …
  />
</Field>`}
          >
            <Field
              label="Description"
              htmlFor="ex-errored"
              error={
                errored.length < 10
                  ? "Description must be at least 10 characters."
                  : undefined
              }
            >
              <ProTextarea
                id="ex-errored"
                value={errored}
                onChange={(e) => setErrored(e.target.value)}
                placeholder="At least 10 characters please…"
                rows={3}
                aria-invalid={errored.length < 10}
                className={
                  errored.length < 10
                    ? "border-destructive focus-visible:ring-destructive/40"
                    : undefined
                }
              />
            </Field>
          </DemoCard>

          <DemoCard
            title="With character count + soft limit"
            subtitle="Counter colors warn at 90%, error past 100%. Doesn't block typing — soft enforcement is friendlier."
            code={`<Field
  label="Headline"
  htmlFor="headline"
  count={value.length}
  maxCount={120}
>
  <ProTextarea id="headline" … />
</Field>`}
          >
            <Field
              label="Headline"
              htmlFor="ex-counted"
              count={counted.length}
              maxCount={120}
            >
              <ProTextarea
                id="ex-counted"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="One-line headline for your post…"
                rows={2}
              />
            </Field>
          </DemoCard>

          <DemoCard
            title="Floating label (built-in)"
            subtitle="Single string prop — no Field wrapper, no render-prop. Label animates into the border on focus or value. Use only inside a bg-card surface."
            code={`<ProTextarea
  floatingLabel="Notes"
  value={value}
  onChange={…}
/>`}
          >
            <ProTextarea
              floatingLabel="Notes"
              value={floating}
              onChange={(e) => setFloating(e.target.value)}
              rows={3}
            />
          </DemoCard>

          <DemoCard
            title="With prefix icon"
            subtitle="Prefix sits at top-left for multi-line. Wrap inline; ProTextarea stays focused on its job."
            code={`<Field label="Reply" htmlFor="reply">
  <div className="relative">
    <Mail className="absolute left-3 top-3 …" />
    <ProTextarea
      id="reply"
      className="pl-10"
      …
    />
  </div>
</Field>`}
          >
            <Field label="Reply" htmlFor="ex-prefix">
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                <ProTextarea
                  id="ex-prefix"
                  value={prefixed}
                  onChange={(e) => setPrefixed(e.target.value)}
                  placeholder="Quick reply…"
                  rows={3}
                  className="pl-10"
                />
              </div>
            </Field>
          </DemoCard>

          <DemoCard
            title="The kitchen sink"
            subtitle="Label + required + help + description + voice + submit + char count. Field owns the chrome, ProTextarea owns the input."
            code={`<Field
  label="Status update"
  htmlFor="status"
  required
  help="Posted to your team channel."
  description="Markdown ok. ⌘+Enter to send."
  count={value.length}
  maxCount={500}
>
  <ProTextarea
    id="status"
    value={value}
    onChange={…}
    onSubmit={handleSend}
    submitDisabled={!value.trim()}
    submitLabel="Post update"
  />
</Field>`}
          >
            <Field
              label="Status update"
              htmlFor="ex-kitchen"
              required
              help={
                <span className="flex items-start gap-1.5">
                  <Zap className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  Posted to #team-updates. Visible to your whole org.
                </span>
              }
              description="Markdown ok. ⌘+Enter to send."
              count={kitchen.length}
              maxCount={500}
            >
              <ProTextarea
                id="ex-kitchen"
                value={kitchen}
                onChange={(e) => setKitchen(e.target.value)}
                placeholder="What's the latest?"
                rows={4}
                onSubmit={() => {
                  setKitchen("");
                }}
                submitDisabled={!kitchen.trim()}
                submitLabel="Post update"
              />
            </Field>
          </DemoCard>
        </div>
      </section>

      {/* ───────── Migration map ───────── */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          What this replaces
        </h2>
        <p className="text-sm text-muted-foreground">
          The official surface is now:{" "}
          <span className="font-mono text-xs">Textarea</span> +{" "}
          <span className="font-mono text-xs">ProTextarea</span> +{" "}
          <span className="font-mono text-xs">Field</span>. The existing zoo
          collapses cleanly:
        </p>
        <div className="rounded-md border border-border bg-background/40 p-3 text-xs font-mono space-y-1 text-muted-foreground">
          <div>
            <span className="text-foreground">BasicTextarea</span> ·{" "}
            <span className="text-foreground">CopyTextarea</span> ·{" "}
            <span className="text-foreground">FancyTextarea</span> ·{" "}
            <span className="text-foreground">TextareaWithPrefix</span>
            <span className="text-success ml-2">
              → delete (compose via Field + ProTextarea)
            </span>
          </div>
          <div>
            <span className="text-foreground">FloatingLabelTextArea</span>
            <span className="text-success ml-2">
              → delete (use ProTextarea floatingLabel prop)
            </span>
          </div>
          <div>
            <span className="text-foreground">AnimatedTextarea</span> ·{" "}
            <span className="text-foreground">MatrxTextarea</span>
            <span className="text-success ml-2">
              → delete (formatting toolbar moves to a dedicated rich-text
              component if needed)
            </span>
          </div>
          <div>
            <span className="text-foreground">SettingsTextarea</span>
            <span className="text-warning ml-2">
              → keep as Settings-system primitive (special: commit-on-blur redux
              binding). Refactor to wrap ProTextarea internally.
            </span>
          </div>
          <div>
            <span className="text-foreground">EntityTextarea(FullWidth)</span> ·
            <span className="text-foreground"> SocketTaskTextarea</span> ·{" "}
            <span className="text-foreground">TaskFieldTextArea</span> ·{" "}
            <span className="text-foreground">TextareaField (applet)</span>
            <span className="text-warning ml-2">
              → migrate to ProTextarea + Field; keep schema-binding logic in
              dedicated wrappers per system (Entity, Socket, Applet)
            </span>
          </div>
          <div>
            <span className="text-foreground">AgentTextarea</span> ·{" "}
            <span className="text-foreground">AgentVariablesGuided</span> ·{" "}
            <span className="text-foreground">PromptInputContainer</span> ·{" "}
            <span className="text-foreground">ChatInputWithControls</span>
            <span className="text-info ml-2">
              → keep as composers; refactor internals to wrap ProTextarea
              instead of duplicating textarea logic
            </span>
          </div>
        </div>
      </section>

      {/* ───────── Constraints (the rules agents are stuck with) ───────── */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          The rules agents have to follow
        </h2>
        <p className="text-sm text-muted-foreground">
          Both components limit options on purpose. If you find yourself
          fighting them, you're outside the official surface — build a one-off
          consciously, don't fork the official component.
        </p>
        <ul className="text-sm text-muted-foreground space-y-2 ml-1 list-disc list-inside">
          <li>
            <span className="text-foreground">Field</span> requires both{" "}
            <span className="font-mono text-xs">label</span> and{" "}
            <span className="font-mono text-xs">htmlFor</span>. The child input
            must use <span className="font-mono text-xs">id={`{htmlFor}`}</span>
            . There is no "no a11y" mode.
          </li>
          <li>
            <span className="text-foreground">Field</span> has a fixed visual
            order: label → description → input → error / counter. No
            re-ordering, no per-element class overrides.
          </li>
          <li>
            <span className="text-foreground">Field</span>'s counter is always
            soft (warns past max, doesn't block). For hard DB-bound limits, also
            pass <span className="font-mono text-xs">maxLength</span> to the
            input.
          </li>
          <li>
            <span className="text-foreground">ProTextarea</span>'s{" "}
            <span className="font-mono text-xs">floatingLabel</span> assumes a{" "}
            <span className="font-mono text-xs">bg-card</span> surface. For
            other surfaces, use Field's above-label style instead.
          </li>
          <li>
            <span className="text-foreground">ProTextarea</span> suppresses{" "}
            <span className="font-mono text-xs">placeholder</span> when{" "}
            <span className="font-mono text-xs">floatingLabel</span> is set —
            the two would visually conflict.
          </li>
          <li>
            <span className="text-foreground">ProTextarea</span> icon positions
            and recording-state styles are not customizable via{" "}
            <span className="font-mono text-xs">className</span>. The layout is
            fixed.
          </li>
        </ul>
      </section>
    </div>
  );
}
