"use client";

import React from "react";
import MarkdownStream from "@/components/MarkdownStream";
import MultipleChoiceQuiz from "@/components/mardown-display/blocks/quiz/MultipleChoiceQuiz";
import FlashcardsBlock from "@/components/mardown-display/blocks/flashcards/FlashcardsBlock";
import ComparisonTableBlock from "@/components/mardown-display/blocks/comparison/ComparisonTableBlock";
import { createSampleComparisonTable } from "@/components/mardown-display/blocks/comparison/parseComparisonJSON";
import TimelineBlock from "@/components/mardown-display/blocks/timeline/TimelineBlock";
import TroubleshootingBlock from "@/components/mardown-display/blocks/troubleshooting/TroubleshootingBlock";
import { createSampleTroubleshootingGuide } from "@/components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown";
import ProgressTrackerBlock from "@/components/mardown-display/blocks/progress/ProgressTrackerBlock";
import { createSampleProgressTracker } from "@/components/mardown-display/blocks/progress/parseProgressMarkdown";
import ResourceCollectionBlock from "@/components/mardown-display/blocks/resources/ResourceCollectionBlock";
import { createSampleResourceCollection } from "@/components/mardown-display/blocks/resources/parseResourcesMarkdown";
import DecisionTreeBlock from "@/components/mardown-display/blocks/decision-tree/DecisionTreeBlock";
import MapBlock from "@/components/mardown-display/blocks/map/MapBlock";
import ImageBlock from "@/components/mardown-display/blocks/images/ImageBlock";
import IngestedSourcesBlock from "@/components/mardown-display/blocks/ingested-sources/IngestedSourcesBlock";
import { ScraperBatchResultBlock } from "@/components/mardown-display/blocks/scraper-kinds/collection-blocks";
import { DataTableBlock } from "@/components/mardown-display/blocks/table-kinds/DataTableBlock";
import FlatSectionViewer from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/FlatSectionViewer";
import IntelligentViewer from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/IntelligentViewer";
import SectionViewerWithSidebar from "@/components/mardown-display/chat-markdown/analyzer/analyzer-options/SectionViewerWithSidebar";

const QUIZ = {
  quiz_title: "Yard safety",
  multiple_choice: [
    { id: 1, question: "What do you wear on the scale deck?", options: ["Steel-toe boots", "Sandals", "Slippers", "Nothing special"], correctAnswer: 0, explanation: "Steel-toe boots protect against dropped loads." },
    { id: 2, question: "Who signs the weight ticket?", options: ["The driver", "The scale operator", "Nobody", "The buyer"], correctAnswer: 1, explanation: "The operator certifies the reading." },
  ],
};

const TIMELINE = {
  title: "Project rollout",
  description: "Phases of the launch",
  periods: [
    { period: "Q1 2026", events: [
      { id: "e1", title: "Kickoff", date: "Jan 5", description: "Team assembled", status: "completed" as const, category: "Planning" },
      { id: "e2", title: "Prototype", date: "Feb 20", description: "First working build", status: "in-progress" as const, category: "Build" },
    ] },
    { period: "Q2 2026", events: [
      { id: "e3", title: "Beta", date: "Apr 1", description: "Closed beta with 50 users", status: "pending" as const, category: "Launch" },
    ] },
  ],
};

const DECISION = {
  title: "Should I refinance?",
  description: "A quick check",
  root: {
    id: "n1", question: "Is the new rate at least 1% lower?", type: "question" as const,
    yes: { id: "n2", question: "Will you stay 3+ years?", type: "question" as const,
      yes: { id: "n3", action: "Refinance now", type: "action" as const, priority: "high" as const },
      no: { id: "n4", action: "Skip it", type: "action" as const, priority: "low" as const } },
    no: { id: "n5", action: "Wait for rates to fall", type: "info" as const, priority: "medium" as const },
  },
};

const MAP = JSON.stringify({
  title: "Trip itinerary",
  markers: [
    { lat: 48.8584, lng: 2.2945, label: "Eiffel Tower", description: "Day 1 — morning" },
    { lat: 48.8606, lng: 2.3376, label: "Louvre", description: "Day 1 — afternoon" },
    { lat: 48.853, lng: 2.3499, label: "Notre-Dame", description: "Day 2" },
  ],
});

const INGESTED = {
  __kind: "ingested_sources",
  chunks: [
    { __kind: "ingested_chunk", chunk_id: "c1", content: "Photosynthesis converts light energy into chemical energy...", content_hash: "h1", chunk_index: 0, kind: "plain_text", source_label: "Pasted material" },
    { __kind: "ingested_chunk", chunk_id: "c2", content: "Chapter 2. The Calvin cycle...", content_hash: "h2", chunk_index: 0, kind: "pdf", source_label: "biology-ch2.pdf" },
  ],
  total_chars: 4210, source_count: 2, sources_requested: 3, sources_ingested: 2, sources_failed: 1,
  errors: ["notes.heic: unsupported image format"],
};

const SCRAPER = {
  __kind: "scraper_batch_result",
  successful: 2, failed: 1,
  pages: [
    { __kind: "scraped_page", url: "https://example.com/pricing", title: "Pricing — Example", success: true, text: "Plans start at $9/month.", outline: [{ text: "Pricing", level: 1 }, { text: "Plans", level: 2 }], links: [{ url: "https://example.com/signup", text: "Sign up" }] },
    { __kind: "scraped_page", url: "https://example.com/about", title: "About us", success: true, text: "We build tools.", outline: [{ text: "About", level: 1 }] },
    { __kind: "scraped_page", url: "https://example.com/blocked", title: null, success: false, error: "403 Forbidden" },
  ],
};

const DATA_TABLE = {
  __kind: "data_table",
  title: "Top keywords",
  columns: [{ name: "keyword", type: "string" }, { name: "volume", type: "number" }, { name: "difficulty", type: "number" }],
  rows: [["ai app builder", 2400, 42], ["no code ai", 5400, 61], ["custom gpt", 9900, 70]],
  row_count: 3,
};

const SECTIONS = {
  Overview: "A short overview of the plan, written in plain words.",
  Goals: { Primary: "Ship the beta by April", Secondary: "Reach 50 active users" },
  Risks: ["Hiring delay", "Vendor lock-in"],
};

const FLAT: Record<string, string> = {
  Overview: "A short overview of the plan, written in plain words.",
  Goals: "Ship the beta by April and reach 50 active users.",
  Risks: "Hiring delay; vendor lock-in.",
};

const MARKDOWN = [
  "Here is a code sample:",
  "",
  "```python",
  "def greet(name: str) -> str:",
  "    return f\"Hello, {name}!\"",
  "",
  "print(greet(\"world\"))",
  "```",
  "",
  "And a table:",
  "",
  "| Plan | Price | Seats |",
  "| --- | --- | --- |",
  "| Starter | $9 | 1 |",
  "| Team | $29 | 5 |",
  "| Business | $99 | 25 |",
  "",
].join("\n");

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section data-shot={id} className="rounded-lg border border-border bg-background p-3">
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function MdButtonsGallery() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-3 sm:p-6">
      <Section id="quiz" title="quiz"><MultipleChoiceQuiz quizData={QUIZ} /></Section>
      <Section id="flashcards" title="flashcards"><FlashcardsBlock serverData={{ title: "Cell biology", cards: [{ front: "What is ATP?", back: "The cell's energy currency." }, { front: "Where does photosynthesis happen?", back: "In the chloroplast." }, { front: "What is mitosis?", back: "Cell division." }] }} /></Section>
      <Section id="comparison" title="comparison table"><ComparisonTableBlock comparison={createSampleComparisonTable()} /></Section>
      <Section id="timeline" title="timeline"><TimelineBlock timeline={TIMELINE} /></Section>
      <Section id="troubleshooting" title="troubleshooting"><TroubleshootingBlock troubleshooting={createSampleTroubleshootingGuide()} /></Section>
      <Section id="decision" title="decision tree"><DecisionTreeBlock decisionTree={DECISION} /></Section>
      <Section id="progress" title="progress tracker"><ProgressTrackerBlock tracker={createSampleProgressTracker()} /></Section>
      <Section id="resources" title="resources"><ResourceCollectionBlock collection={createSampleResourceCollection()} /></Section>
      <Section id="map" title="map / places"><MapBlock content={MAP} /></Section>
      <Section id="image" title="image block"><ImageBlock src="/happy-robot.jpg" alt="Robot" /></Section>
      <Section id="ingested" title="ingested sources"><IngestedSourcesBlock serverData={INGESTED} /></Section>
      <Section id="scraper" title="scraper pages"><ScraperBatchResultBlock serverData={SCRAPER} /></Section>
      <Section id="datatable" title="data table kind"><DataTableBlock serverData={DATA_TABLE} /></Section>
      <Section id="markdown" title="code block + table toolbar"><MarkdownStream content={MARKDOWN} /></Section>
      <Section id="flatsection" title="flat section viewer"><FlatSectionViewer data={FLAT} /></Section>
      <Section id="intelligent" title="intelligent viewer"><IntelligentViewer data={SECTIONS} /></Section>
      <Section id="sidebar" title="section viewer with sidebar"><SectionViewerWithSidebar data={SECTIONS} /></Section>
    </main>
  );
}
