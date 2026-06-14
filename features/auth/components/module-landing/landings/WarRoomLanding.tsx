import {
  LayoutGrid,
  ListChecks,
  NotebookPen,
  Mic,
  Pin,
  Building2,
  Save,
  Layers,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: LayoutGrid,
    title: "Every thread, on one screen",
    description:
      "A dynamic gallery of tiles that arranges and resizes itself to fill the space — beautiful at three, dense at twelve, no hard cap. Stop alt-tabbing.",
  },
  {
    icon: Layers,
    title: "Task, notes, and audio in one tile",
    description:
      "Each tile carries a task, a free-form notepad, and a live transcript behind four tabs. Capture the thought, the action, and the recording without leaving the room.",
  },
  {
    icon: Pin,
    title: "Pin what matters, hide the rest",
    description:
      "Pin the one or two threads you're driving right now and they grow; hide the noise to a tray and pull it back in a click. Focus without losing context.",
  },
  {
    icon: Building2,
    title: "Context-aware, top to bottom",
    description:
      "Set the org, client, case, or matter once for the whole room — every tile inherits it. Override any single tile when one thread needs a tighter scope.",
  },
  {
    icon: Save,
    title: "Rooms you return to",
    description:
      "Every War Room is a saved session. Close the laptop mid-thought, reopen tomorrow, and find every tile, note, and transcript exactly where you left it.",
  },
  {
    icon: Mic,
    title: "Transcription, built in",
    description:
      "Record a call or a hallway conversation straight into a tile. Save the raw transcript instantly, or expand for the full cleanup studio when you have a minute.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Open a War Room",
    description:
      "Start a fresh room or reopen a saved one. Set the working context — org, client, case — for everything inside it.",
  },
  {
    number: "02",
    title: "Drop in a tile per thread",
    description:
      "There's always an empty tile ready. Start typing a note, attach a task, or hit record — the tile fills itself in as you go.",
  },
  {
    number: "03",
    title: "Work the room",
    description:
      "Switch a tile between Task, Notes, Audio, or All. Pin the active ones, hide the dormant ones. The grid keeps itself tight.",
  },
  {
    number: "04",
    title: "Come back to it",
    description:
      "It's all saved. Tomorrow's you opens the room and is instantly back in context — nothing dropped, nothing forgotten.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "My War Rooms",
    status: "Live",
    href: "/war-room/all",
    items: [
      "Browse every saved room",
      "Create, open, delete",
      "Sorted by most recent",
      "Per-room context shown",
    ],
  },
  {
    title: "Tiles",
    status: "Live",
    items: [
      "Task + Notes + Audio + All",
      "Minimal view, expand for full",
      "Pin and hide",
      "Per-tile context override",
    ],
  },
  {
    title: "Tasks & Notes",
    status: "Live",
    href: "/tasks",
    items: [
      "Backed by your real tasks",
      "Subtasks, attachments, comments",
      "Free-form notes per tile",
      "Nothing siloed in the room",
    ],
  },
  {
    title: "Transcription",
    status: "Live",
    href: "/transcripts",
    items: [
      "Record into any tile",
      "Save raw, or clean it up",
      "Multiple sessions per room",
      "Dictionary follows your scope",
    ],
  },
];

export default function WarRoomLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:war-room"
      eyebrow="AI Matrx War Room"
      eyebrowIcon={LayoutGrid}
      headline="Run your whole day from"
      headlineGradient="one command center."
      description="A session-based workspace for people who never stop context-switching. Every open thread becomes a tile — task, notes, and live transcript together — in a grid that arranges itself. Pin what's hot, hide what's not, and pick up exactly where you left off."
      primaryCtaHref="/sign-up?source=war-room-landing"
      primaryCtaLabel="Start Free"
      workspaceHref="/war-room/all"
      workspaceLabel="War Room"
      capabilitiesHeading="Built for the constant multitasker"
      capabilitiesDescription="Developers, executives, and salespeople lose the thread every time they switch tabs, take a call, or step into a meeting. The War Room is the answer to that."
      capabilities={CAPABILITIES}
      stepsDescription="From scattered tabs to one tight, saved workspace in four steps."
      steps={STEPS}
      subAreasHeading="What's inside a room"
      subAreasDescription="Tiles tie together the tools you already use — tasks, notes, transcription — under one context-aware roof."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop losing your place"
      finalCtaDescription="Give every open thread a home. Capture the thought before it's gone, and walk back into context whenever you return. Free to start."
      relatedModules={["/tasks", "/notes", "/transcripts"]}
    />
  );
}
