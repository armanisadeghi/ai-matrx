// The /medical front door for guests (module-landing-pages skill). Copy is
// about what the platform does today — agents, knowledge, transcripts, forms —
// applied to a practice. No clinical-outcome or compliance claims: nothing in
// the codebase backs one, so none is made here.
import {
  BookOpen,
  ClipboardList,
  FileText,
  Mic,
  Stethoscope,
  Users,
  Webhook,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";
import { COMING_SOON } from "@/lib/coming-soon/registry";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Webhook,
    title: "Your way of practicing, written once",
    description:
      "Turn how you take a history, write a letter or follow up into an agent. Everyone on your team runs it the same way, every time.",
  },
  {
    icon: BookOpen,
    title: "Answers from your own references",
    description:
      "Load your guidelines, handouts and office policies into Knowledge. Answers come from your material and cite where they came from.",
  },
  {
    icon: FileText,
    title: "Drafts for a clinician to review",
    description:
      "Agents draft referral letters, visit summaries and patient handouts. You read, edit and decide — nothing goes out on its own.",
  },
  {
    icon: Mic,
    title: "Conversations into notes",
    description:
      "Record a conversation and get a transcript with speakers, a summary and action items you can hand to an agent.",
  },
  {
    icon: ClipboardList,
    title: "Intake forms and booking pages",
    description:
      "Send a form link before a visit. Answers land as records in your own tables, and you are told when one comes in.",
  },
  {
    icon: Users,
    title: "Shared across the practice",
    description:
      "Share agents, knowledge and forms with your team inside your organization, with control over who can see and edit what.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Bring what you already know",
    description:
      "Upload the protocols, templates and handouts your practice already uses. No technical setup.",
  },
  {
    number: "02",
    title: "Turn it into a system",
    description:
      "Describe a task the way you would explain it to a new colleague. AI Matrx turns it into an agent that follows it.",
  },
  {
    number: "03",
    title: "Your team runs it",
    description:
      "Colleagues use the agent from chat or a simple form. You keep improving it, and everyone gets the update.",
  },
];

const workspacePromise = COMING_SOON["medical.workspace"];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Agents and chat",
    status: "Live",
    href: "/agents",
    items: ["Agents built from your protocols", "Chat with cited answers"],
  },
  {
    title: "Knowledge",
    status: "Live",
    href: "/knowledge",
    items: ["Guidelines and office policies", "Search with sources"],
  },
  {
    title: "Transcripts",
    status: "Live",
    href: "/transcripts",
    items: ["Speaker-labeled transcripts", "Summaries and action items"],
  },
  {
    // Derived from the registry — this page cannot call the workspace live
    // while its promise is still registered.
    title: workspacePromise.label,
    status: "Coming soon",
    items: [
      "Clinical calculators",
      "Practice templates",
      "Agents set up for clinicians",
    ],
  },
];

export default function MedicalLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:medical"
      eyebrow="AI Matrx for Medical"
      eyebrowIcon={Stethoscope}
      headline="Your clinical know-how,"
      headlineGradient="working for the whole practice."
      description="AI Matrx turns how you and your practice work into AI systems your team can rely on — agents that follow your protocols, answer from your own references and draft the paperwork for you to review."
      primaryCtaHref="/sign-up?source=medical-landing"
      primaryCtaLabel="Start Free"
      workspaceHref="/medical"
      workspaceLabel="Medical"
      capabilitiesHeading="Built around how you already practice"
      capabilitiesDescription="You know the work. AI Matrx handles the AI, so your expertise becomes something the whole practice can use."
      capabilities={CAPABILITIES}
      stepsDescription="From your existing documents to a working system in three steps."
      steps={STEPS}
      subAreasHeading="What's available"
      subAreasDescription="What works today, and what is on the way."
      subAreas={SUB_AREAS}
      finalCtaHeading="Put your expertise to work"
      finalCtaDescription="Start with one task your practice repeats every day. Free to start, no credit card."
      relatedModules={["/agents", "/knowledge", "/transcripts"]}
    />
  );
}
