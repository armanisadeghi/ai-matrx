"use client";

import AdvancedTranscriptViewer from "@/components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer";
import TaskChecklist from "@/components/mardown-display/blocks/tasks/TaskChecklist";
import CandidateProfileView from "@/components/mardown-display/markdown-classification/custom-views/view-components/CandidateProfileView";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";
import ProcessorExtractor from "@/components/official/processor-extractor/ProcessorExtractor";

const TRANSCRIPT_FIXTURE = `# Context Menu Review Transcript
## Consolidation fixture

**00:00 - 00:12**
**Arman:** Every review target should open without manufacturing state.

**00:12 - 00:26**
**Agent:** This deterministic page mounts the same production block components used in chat.`;

const TASK_FIXTURE = `## Context-menu verification
- [ ] Open the universal menu on this task
  - [ ] Confirm Edit, Delete, Add Above, Add Below, and Add Subtask
- [x] Confirm Copy and Agents remain available`;

const JSON_FIXTURE = {
  candidate: {
    name: "Jordan Lee",
    role: "Operations Director",
    location: "Sacramento, CA",
  },
  review: {
    status: "deterministic",
    variants: ["transcript", "task", "candidate", "json", "processor"],
  },
};

const CANDIDATE_FIXTURE = {
  extracted: {
    name: "Jordan Lee",
    intro: "Operations leader focused on reliable, measurable systems.",
    key_experiences: [
      {
        company: "Northstar Logistics",
        details: [
          "Led a 40-person operations team across three facilities.",
          "Reduced order exceptions by 31 percent through workflow redesign.",
        ],
      },
    ],
    additional_accomplishments: [
      "Built a cross-functional incident review program.",
      "Mentored six first-time managers.",
    ],
    location: ["Sacramento, California", "Open to hybrid work"],
    compensation: ["Target range: $160k-$180k"],
    availability: ["Available with four weeks notice"],
  },
};

export default function ContextMenuConsolidationPage() {
  return (
    <main className="h-full overflow-auto p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Context-menu consolidation fixture
          </h1>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Right-click the named row or item in each panel. Every panel mounts
            the real production component, so this one stable route proves the
            transcript, task, candidate-profile, JSON Explorer, and Processor
            Extractor variants without requiring a prepared chat.
          </p>
        </header>

        <section
          aria-labelledby="transcript-fixture-title"
          className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <div>
            <h2 id="transcript-fixture-title" className="text-lg font-semibold">
              Transcript segment
            </h2>
            <p className="text-sm text-muted-foreground">
              Right-click either segment for Edit, Split, Merge, Copy, Timestamp
              Link, Delete, and the shared menu actions.
            </p>
          </div>
          <AdvancedTranscriptViewer
            content={TRANSCRIPT_FIXTURE}
            showInlineActions
          />
        </section>

        <section
          aria-labelledby="task-fixture-title"
          className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <div>
            <h2 id="task-fixture-title" className="text-lg font-semibold">
              Task-checklist row
            </h2>
            <p className="text-sm text-muted-foreground">
              Right-click the first task row for Edit, Delete, Add Above, Add
              Below, Add Subtask, and the shared menu actions.
            </p>
          </div>
          <TaskChecklist content={TASK_FIXTURE} hideActions />
        </section>

        <section
          aria-labelledby="candidate-fixture-title"
          className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <div>
            <h2 id="candidate-fixture-title" className="text-lg font-semibold">
              Candidate-profile item
            </h2>
            <p className="text-sm text-muted-foreground">
              Right-click the experience card, an accomplishment, or a summary
              card for item-scoped Copy and Agents.
            </p>
          </div>
          <CandidateProfileView data={CANDIDATE_FIXTURE} />
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section
            aria-labelledby="json-fixture-title"
            className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4"
          >
            <div>
              <h2 id="json-fixture-title" className="text-lg font-semibold">
                JSON Explorer navigation
              </h2>
              <p className="text-sm text-muted-foreground">
                Right-click a navigation key for Hide content or Show content
                inside the shared menu.
              </p>
            </div>
            <RawJsonExplorer pageData={JSON_FIXTURE} withSelect={false} />
          </section>

          <section
            aria-labelledby="processor-fixture-title"
            className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4"
          >
            <div>
              <h2
                id="processor-fixture-title"
                className="text-lg font-semibold"
              >
                Processor Extractor navigation
              </h2>
              <p className="text-sm text-muted-foreground">
                Right-click a navigation key for Hide content or Show content
                inside the shared menu.
              </p>
            </div>
            <ProcessorExtractor
              jsonData={JSON_FIXTURE}
              configKey="context-menu-consolidation"
            />
          </section>
        </div>
      </div>
    </main>
  );
}
