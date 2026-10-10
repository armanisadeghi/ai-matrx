"use client";

/**
 * Interactive render blocks (dev demo): quiz, progress tracker, troubleshooting guide, timeline and
 * decision tree rendered directly from realistic markdown/JSON — no chat turn. The place to look at
 * the Tile rows and the IconButton toolbars at 1440 and 375, light and dark.
 */

import MultipleChoiceQuiz from "@/components/mardown-display/blocks/quiz/MultipleChoiceQuiz";
import { normalizeRawQuizJSON } from "@/components/mardown-display/blocks/quiz/quiz-parser";
import exampleQuiz from "@/components/mardown-display/blocks/quiz/example-quiz.json";
import ProgressTrackerBlock from "@/components/mardown-display/blocks/progress/ProgressTrackerBlock";
import { parseProgressMarkdown } from "@/components/mardown-display/blocks/progress/parseProgressMarkdown";
import TroubleshootingBlock from "@/components/mardown-display/blocks/troubleshooting/TroubleshootingBlock";
import { parseTroubleshootingMarkdown } from "@/components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown";
import TimelineBlock from "@/components/mardown-display/blocks/timeline/TimelineBlock";
import { parseTimelineMarkdown } from "@/components/mardown-display/blocks/timeline/parseTimelineMarkdown";
import DecisionTreeBlock from "@/components/mardown-display/blocks/decision-tree/DecisionTreeBlock";
import { parseDecisionTreeJSON } from "@/components/mardown-display/blocks/decision-tree/parseDecisionTreeJSON";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const PROGRESS = `### Launch checklist
Everything needed before the first customer sees the product.

**Foundations** (40% complete)
- [x] Domain and email set up
- [ ] Write the pricing page copy so a first-time visitor can tell in under ten seconds what they get at each tier {high} (3h)
- [ ] Add analytics [optional]

**Go to market**
- [ ] Draft the announcement
- [ ] Line up five design partners {medium} (6h)
`;

const TROUBLESHOOTING = `### Sync is slow
Files take minutes to show up on a second device.

**Symptom:** New files do not appear on the other device for several minutes

**Possible Causes:**
1. The device went to sleep and paused syncing
2. A very large file is blocking the queue

**Solutions:**
1. **Wake the device and retry**: Make sure the app is open on both devices
   - Open the app on the second device
   - Pull down to refresh the file list
2. **Pause and resume sync**: Clears a stuck queue
   - Open settings, then Sync
   - Turn sync off, wait ten seconds, turn it on
`;

const TIMELINE = `### Rollout plan

**Phase 1: Foundation (Weeks 1-4)**
- **Kickoff** (Week 1) [Planning]
- **Hire the first designer** (Week 3) [Team]

**Phase 2: Build (Weeks 5-12)**
- **Alpha to ten users** (Week 8) [Release]
`;

const TREE = JSON.stringify({
  decision_tree: {
    title: "Is the error reproducible?",
    root: {
      question: "Can you make the error happen on demand?",
      yes: { question: "Does it happen in production?", yes: { action: "Create a hotfix immediately" }, no: { action: "Log it as a development issue" } },
      no: { action: "Monitor and collect more data" },
    },
  },
});

const QUIZ = normalizeRawQuizJSON(exampleQuiz);
const TIMELINE_DATA = parseTimelineMarkdown(TIMELINE);

export default function InteractiveBlocksDemo() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-3 pb-safe">
      <section data-testid="demo-quiz">{QUIZ ? <MultipleChoiceQuiz quizData={QUIZ} enableAutoSave={false} /> : <p role="alert">The quiz sample did not parse.<ErrorAlchemyMenu /></p>}</section>
      <section data-testid="demo-progress"><ProgressTrackerBlock tracker={parseProgressMarkdown(PROGRESS)} /></section>
      <section data-testid="demo-troubleshooting"><TroubleshootingBlock troubleshooting={parseTroubleshootingMarkdown(TROUBLESHOOTING)} /></section>
      <section data-testid="demo-timeline">{TIMELINE_DATA ? <TimelineBlock timeline={TIMELINE_DATA} /> : <p role="alert">The timeline sample did not parse.<ErrorAlchemyMenu /></p>}</section>
      <section data-testid="demo-decision-tree"><DecisionTreeBlock decisionTree={parseDecisionTreeJSON(TREE)} /></section>
    </div>
  );
}
