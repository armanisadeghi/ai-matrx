"use client";

/**
 * SeoPackageBlock — THE renderer for the `seo_package` kind. There is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * A registered shape gets exactly ONE component. Need one section elsewhere?
 * Import the PART — `SeoPackageMeta`, `SeoPackageKeywords`, `SeoPackageFaq`,
 * `SeoPackageMarkup`. **Do not build a second SEO-package renderer.** This one
 * replaced `SeoView` in `OutputsStudio.tsx` (2026-08-11), which was a bespoke
 * card that could only ever render a finished payload.
 *
 * Streaming-first by construction: every field is optional at render time
 * because mid-stream it genuinely is. The component mounts the instant the
 * discriminator parses, the title appears with its character budget already
 * measured, and each FAQ question lands as its object closes.
 *
 * THE BUDGET UX, carried forward from `SeoView` and upgraded: the title and
 * meta description are measured against `TITLE_LIMITS` / `DESCRIPTION_LIMITS`
 * (`features/marketing/seo/serp/metrics.ts` — the ONE source of truth for SEO
 * limits, mirrored in the Python scraper). Over budget reads destructive,
 * under the minimum reads amber, inside the window reads muted. A number with
 * no verdict is a number the user has to know the rule for — and our user
 * does not.
 *
 * Consumes the bridge serverData from `features/content-ir/kinds/seo-package.ts`.
 */

import { useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  HelpCircle,
  Link2,
  Loader2,
  Search,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import type {
  SeoFaqItemData,
  SeoPackageData,
} from "@/features/content-ir/kinds/seo-package";
import {
  countSeoCharacters,
  DESCRIPTION_LIMITS,
  TITLE_LIMITS,
} from "@/features/marketing/seo/serp/metrics";
import { cn } from "@/lib/utils";

export interface SeoPackageBlockProps {
  serverData?: unknown;
  /**
   * Verbs that act on THIS package ("Save to outputs", "Publish"), rendered in
   * the component's own header. The action belongs on the component, never on
   * a bespoke card beside it.
   */
  actions?: ReactNode;
  className?: string;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function faqItems(value: unknown): SeoFaqItemData[] {
  if (!Array.isArray(value)) return [];
  const items: SeoFaqItemData[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Partial<SeoFaqItemData>;
    if (typeof candidate.question !== "string" || candidate.question === "")
      continue;
    items.push({
      question: candidate.question,
      answer: typeof candidate.answer === "string" ? candidate.answer : null,
    });
  }
  return items;
}

/**
 * The bridge already produced this shape; this re-read is the same defensive
 * boundary every kind block keeps, so a stale/foreign `serverData` renders
 * nothing rather than throwing inside the stream.
 */
export function readSeoPackageData(serverData: unknown): SeoPackageData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<SeoPackageData>;
  // The title is the one field the package is meaningless without — but it
  // may legitimately be null for the first few tokens, so a plain object with
  // any of the mapped keys is enough to mount on.
  if (!("title" in candidate)) return null;
  return {
    title: typeof candidate.title === "string" ? candidate.title : null,
    metaDescription:
      typeof candidate.metaDescription === "string"
        ? candidate.metaDescription
        : null,
    slug: typeof candidate.slug === "string" ? candidate.slug : null,
    primaryKeyword:
      typeof candidate.primaryKeyword === "string"
        ? candidate.primaryKeyword
        : null,
    keywords: strings(candidate.keywords),
    faq: faqItems(candidate.faq),
    schemaOrg: candidate.schemaOrg ?? null,
    openGraph: candidate.openGraph ?? null,
    isComplete: candidate.isComplete === true,
  };
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy");
  }
}

// ---------------------------------------------------------------------------
// PARTS — importable on their own so a surface can render one section without
// re-implementing it. This is the ONLY sanctioned way to render part of a shape.
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
  trailing,
}: {
  label: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="animate-in fade-in space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {trailing}
      </div>
      <div className="text-xs text-foreground/90">{children}</div>
    </div>
  );
}

/**
 * The character budget, WITH its verdict. `countSeoCharacters` is the shared
 * counter (grapheme-aware, mirrored in Python) — never `text.length`.
 */
export function SeoBudget({
  text,
  limits,
}: {
  text: string;
  limits: { maxChars: number; minChars: number };
}) {
  const count = countSeoCharacters(text);
  const over = count > limits.maxChars;
  const short = count < limits.minChars;
  return (
    <span
      className={cn(
        "text-[10px] tabular-nums",
        over
          ? "font-medium text-destructive"
          : short
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground",
      )}
      title={
        over
          ? `${count - limits.maxChars} characters over the ${limits.maxChars}-character budget — search engines will truncate it.`
          : short
            ? `Under the ${limits.minChars}-character minimum — there is room to say more.`
            : `Inside the ${limits.minChars}–${limits.maxChars} character window.`
      }
    >
      {count}/{limits.maxChars}
      {over ? " · too long" : short ? " · too short" : ""}
    </span>
  );
}

export function SeoPackageMeta({
  title,
  metaDescription,
  slug,
}: {
  title: string | null;
  metaDescription: string | null;
  slug: string | null;
}) {
  return (
    <>
      {title !== null && (
        <Field
          label="Title"
          trailing={<SeoBudget text={title} limits={TITLE_LIMITS} />}
        >
          <span className="font-medium">{title}</span>
        </Field>
      )}
      {metaDescription !== null && (
        <Field
          label="Meta description"
          trailing={
            <SeoBudget text={metaDescription} limits={DESCRIPTION_LIMITS} />
          }
        >
          {metaDescription}
        </Field>
      )}
      {slug !== null && (
        <Field label="Slug">
          <button
            type="button"
            onClick={() => copyText(slug, "Slug")}
            className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:bg-muted"
          >
            <Link2 className="h-3 w-3" />
            {slug}
          </button>
        </Field>
      )}
    </>
  );
}

export function SeoPackageKeywords({
  keywords,
  primaryKeyword,
}: {
  keywords: string[];
  primaryKeyword: string | null;
}) {
  if (keywords.length === 0) return null;
  return (
    <Field label="Keywords">
      <div className="mt-0.5 flex flex-wrap gap-1">
        {keywords.map((keyword, index) => (
          <span
            key={`${index}-${keyword}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
              keyword === primaryKeyword
                ? "bg-primary/10 font-medium text-primary"
                : "bg-muted/60 text-muted-foreground",
            )}
          >
            <Tag className="h-2.5 w-2.5" />
            {keyword}
          </span>
        ))}
      </div>
    </Field>
  );
}

export function SeoPackageFaq({ items }: { items: SeoFaqItemData[] }) {
  if (items.length === 0) return null;
  return (
    <Field label={`FAQ (${items.length})`}>
      <div className="mt-0.5 space-y-1.5">
        {items.map((item, index) => (
          <div
            key={`${index}-${item.question.slice(0, 24)}`}
            className="animate-in fade-in rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5"
          >
            <div className="flex items-start gap-1.5">
              <HelpCircle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="text-[11px] font-medium">{item.question}</span>
            </div>
            {item.answer ? (
              <p className="mt-0.5 pl-4.5 text-[11px] text-muted-foreground">
                {item.answer}
              </p>
            ) : (
              <p className="mt-0.5 pl-4.5 text-[11px] italic text-muted-foreground/70">
                Answering…
              </p>
            )}
          </div>
        ))}
      </div>
    </Field>
  );
}

/** schema.org + Open Graph — the copyable JSON-LD payload. */
export function SeoPackageMarkup({
  schemaOrg,
  openGraph,
}: {
  schemaOrg: unknown;
  openGraph: unknown;
}) {
  const [showRaw, setShowRaw] = useState(false);
  if (schemaOrg === null && openGraph === null) return null;
  const jsonLd = JSON.stringify(
    { schema_org: schemaOrg ?? {}, open_graph: openGraph ?? {} },
    null,
    2,
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setShowRaw((value) => !value)}
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {showRaw ? "Hide" : "Show"} schema.org + OpenGraph
        </button>
        <button
          type="button"
          onClick={() => copyText(jsonLd, "JSON-LD")}
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <Copy className="h-3 w-3" />
          Copy JSON-LD
        </button>
      </div>
      {showRaw && (
        <pre className="max-h-60 overflow-x-auto overflow-y-auto rounded-lg bg-muted/50 p-2.5 text-[10px] leading-relaxed">
          {jsonLd}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The parent — composes the parts. Nothing here that a part could own.
// ---------------------------------------------------------------------------

export default function SeoPackageBlock({
  serverData,
  actions,
  className,
}: SeoPackageBlockProps) {
  const data = readSeoPackageData(serverData);
  if (!data) return null;

  return (
    <div className={cn("my-2 space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Search className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          SEO package
        </span>
        {data.isComplete ? (
          <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Optimizing
          </span>
        )}
        {actions ? <div className="ml-auto">{actions}</div> : null}
      </div>

      <SeoPackageMeta
        title={data.title}
        metaDescription={data.metaDescription}
        slug={data.slug}
      />
      <SeoPackageKeywords
        keywords={data.keywords}
        primaryKeyword={data.primaryKeyword}
      />
      <SeoPackageFaq items={data.faq} />
      <SeoPackageMarkup
        schemaOrg={data.schemaOrg}
        openGraph={data.openGraph}
      />
    </div>
  );
}
