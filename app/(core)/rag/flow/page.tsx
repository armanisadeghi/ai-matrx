"use client";
/**
 * /rag/flow — Watch the RAG pipeline in motion.
 *
 * A guided, looping animation showing the two paths (READ on the left,
 * WRITE on the right) converging on the vector data store, then top-K
 * chunks emerging into the agent's response. Aimed at users who want
 * to understand "what is actually happening" without reading docs.
 */
import Link from "next/link";
import { ArrowLeft, Database, FileText, Search } from "lucide-react";
import { RagFlowVisualization } from "@/features/rag/components/visualization/RagFlowVisualization";

export default function Page() {
  return (
    <div className="flex-1 bg-background overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        <header className="space-y-2">
          <Link
            href="/rag"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Knowledge
          </Link>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">
                How Matrx vector data stores work
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Two paths run in parallel. On the right, your documents are
                turned into searchable vectors. On the left, your agents'
                questions are turned into searchable vectors too. They meet in
                the data store, and the closest matches come back as grounding
                context.
              </p>
            </div>
          </div>
        </header>
        <RagFlowVisualization />
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PathCard
            tone="cyan"
            icon={<FileText className="h-4 w-4" />}
            title="Write path"
            steps={[
              "Upload a file (PDF, DOCX, MD)",
              "Extract raw text from each page",
              "Clean it into structured markdown",
              "Chunk into semantic windows",
              "Embed each chunk into a vector",
              "Index into the data store",
            ]}
          />
          <PathCard
            tone="violet"
            icon={<Search className="h-4 w-4" />}
            title="Read path"
            steps={[
              "User asks a question",
              "Classifier decides if RAG is helpful",
              "Agent calls the search tool",
              "Query is turned into a vector",
              "Closest chunks come back",
              "Agent answers grounded in them",
            ]}
          />
          <PathCard
            tone="emerald"
            icon={<Database className="h-4 w-4" />}
            title="The data store"
            steps={[
              "A scoped, named vector index",
              "Multiple documents per store",
              "Multiple stores per agent",
              "Hybrid (vector + lexical) ranking",
              "Optional reranker for precision",
              "Filtered by metadata at query time",
            ]}
          />
        </section>
      </div>
    </div>
  );
}

function PathCard({
  tone,
  icon,
  title,
  steps,
}: {
  tone: "violet" | "cyan" | "emerald";
  icon: React.ReactNode;
  title: string;
  steps: string[];
}) {
  const toneClass =
    tone === "violet"
      ? "border-violet-500/25 bg-violet-500/[0.03]"
      : tone === "cyan"
        ? "border-cyan-500/25 bg-cyan-500/[0.03]"
        : "border-emerald-500/25 bg-emerald-500/[0.03]";
  const iconToneClass =
    tone === "violet"
      ? "bg-violet-500/10 text-violet-500 dark:text-violet-300"
      : tone === "cyan"
        ? "bg-cyan-500/10 text-cyan-500 dark:text-cyan-300"
        : "bg-emerald-500/10 text-emerald-500 dark:text-emerald-300";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${iconToneClass}`}
        >
          {icon}
        </span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-[13px] text-muted-foreground"
          >
            <span className="mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-[10px] font-medium text-foreground/70 tabular-nums">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
