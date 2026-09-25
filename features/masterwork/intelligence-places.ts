// features/masterwork/intelligence-places.ts
//
// WHERE EACH MASTERWORK JOB RUNS — drawn on /intelligence/masterwork.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
// Jobs that run only inside the server's pipelines (judges, oracles, template
// makers) have no screen that names them and read "Not recorded yet".

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const MASTERWORK_PLACES: FeaturePlaces = {
  feature: "masterwork",
  label: "Masterwork",
  roots: ["features/masterwork", "app/(core)/masterwork"],
  places: [
    {
      id: "rulebook",
      label: "Rulebook page",
      trigger: "Rulebook checkup, corpus cleanup",
      urlPattern: "/masterwork/[rulebookId]",
      mandateKeys: [K.masterwork__checkup_auditor, K.masterwork__corpus_cleaner],
      sources: ["features/surfaces/manifests/masterwork-rulebook.manifest.ts"],
    },
    {
      id: "next-move",
      label: "Rulebook page",
      trigger: "What to try next",
      urlPattern: "/masterwork/[rulebookId]",
      mandateKeys: [K.masterwork__approach_selector],
      sources: [
        "features/masterwork/components/detail/RulebookDetailPage.tsx",
        "features/masterwork/assists.ts",
      ],
    },
    {
      id: "improve-rule",
      label: "A rule on the rulebook",
      trigger: "Improve, edit, or decide on a rule",
      urlPattern: "/masterwork/[rulebookId]",
      mandateKeys: [K.masterwork__rule_improver],
      sources: [
        "features/masterwork/components/detail/ImproveRuleDialog.tsx",
        "features/masterwork/components/detail/RuleEditorDialog.tsx",
        "features/masterwork/review/RuleDecisionActions.tsx",
        "features/masterwork/review/useRuleImproveRun.ts",
        "features/masterwork/agent-context/ruleImprove.ts",
      ],
    },
    {
      id: "add-rule",
      label: "Add a rule window",
      trigger: "Draft the rule",
      mandateKeys: [K.masterwork__rule_improver],
      sources: ["features/masterwork/components/add-rule/AddRulePanel.tsx"],
    },
    {
      id: "checkup",
      label: "Checkup window",
      trigger: "Apply a checkup suggestion",
      mandateKeys: [K.masterwork__rule_improver],
      sources: [
        "features/masterwork/checkup/CheckupWindow.tsx",
        "features/masterwork/checkup/CheckupSuggestionDialog.tsx",
      ],
    },
    {
      id: "understudy",
      label: "Rulebook page",
      trigger: "Understudy card",
      urlPattern: "/masterwork/[rulebookId]",
      mandateKeys: [K.masterwork__understudy],
      sources: ["features/masterwork/understudy/UnderstudyCard.tsx"],
    },
    {
      id: "interview",
      label: "Interview",
      trigger: "The interviewer asks and drafts rules",
      urlPattern: "/masterwork/[rulebookId]/interview",
      mandateKeys: [K.masterwork__scout],
      sources: [
        "features/masterwork/components/detail/ScoutInterviewPanel.tsx",
        "features/masterwork/record/interviewModes.ts",
      ],
    },
    {
      id: "conduct",
      label: "Conductor",
      trigger: "Conduct the session",
      urlPattern: "/masterwork/[rulebookId]/conduct",
      mandateKeys: [K.masterwork__conductor],
      sources: ["features/masterwork/conduct/ConductorPanel.tsx"],
    },
    {
      id: "add-source",
      label: "Capture plan",
      trigger: "Add a document, just talk, or a timeline",
      urlPattern: "/masterwork/[rulebookId]/plan",
      mandateKeys: [
        K.masterwork__source_distiller,
        K.masterwork__monologue_distiller,
        K.masterwork__timeline_distiller,
      ],
      sources: [
        "features/masterwork/components/detail/IngestSourceDialog.tsx",
        "features/masterwork/record/MonologueRecorder.tsx",
        "features/masterwork/browse/approachLane.ts",
      ],
    },
    {
      id: "meeting",
      label: "Capture plan",
      trigger: "Mine a meeting",
      urlPattern: "/masterwork/[rulebookId]/plan",
      mandateKeys: [K.masterwork__meeting_scavenger],
      sources: ["features/masterwork/components/detail/MeetingScavengerDialog.tsx"],
    },
    {
      id: "red-pen",
      label: "Capture plan",
      trigger: "Red pen a draft",
      urlPattern: "/masterwork/[rulebookId]/plan",
      mandateKeys: [K.masterwork__markup_distiller],
      sources: ["features/masterwork/components/detail/RedPenDialog.tsx"],
    },
    {
      id: "body-of-work",
      label: "Body of work",
      trigger: "Study your best finished work",
      urlPattern: "/masterwork/[rulebookId]/body-of-work",
      mandateKeys: [K.masterwork__exemplar_distiller],
      sources: ["features/masterwork/components/detail/BodyOfWorkDialog.tsx"],
    },
    {
      id: "import",
      label: "Import a chat",
      trigger: "Distill the conversation",
      urlPattern: "/masterwork/[rulebookId]/import",
      mandateKeys: [K.masterwork__transcript_distiller],
      sources: ["features/masterwork/components/detail/ChatImportDialog.tsx"],
    },
    {
      id: "inbox",
      label: "Shadow inbox",
      trigger: "Distill forwarded conversations",
      urlPattern: "/masterwork/[rulebookId]/inbox",
      mandateKeys: [K.masterwork__transcript_distiller],
      sources: ["features/masterwork/components/detail/ShadowInboxDialog.tsx"],
    },
    {
      id: "drip",
      label: "Daily drip",
      trigger: "Today's question, and distilling your answer",
      urlPattern: "/masterwork/[rulebookId]/drip",
      mandateKeys: [K.masterwork__drip_question, K.masterwork__drip_distiller],
      sources: ["features/masterwork/drip/service.ts"],
    },
    {
      id: "probe",
      label: "Bad example probe",
      trigger: "Each probe round",
      urlPattern: "/masterwork/[rulebookId]/probe",
      mandateKeys: [K.masterwork__bad_example_probe],
      sources: ["features/masterwork/probe/service.ts"],
    },
    {
      id: "sort",
      label: "Sorting table",
      trigger: "Write cases, distill the sort",
      urlPattern: "/masterwork/[rulebookId]/sort",
      mandateKeys: [K.masterwork__sort_case_writer, K.masterwork__sort_distiller],
      sources: ["features/masterwork/sorting/service.ts"],
    },
    {
      id: "triad",
      label: "Triad game",
      trigger: "Deal a triad, distill the answer",
      urlPattern: "/masterwork/[rulebookId]/triad",
      mandateKeys: [K.masterwork__triad_generator, K.masterwork__triad_distiller],
      sources: ["features/masterwork/triad/service.ts"],
    },
  ],
};
