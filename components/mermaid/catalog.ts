/**
 * The per-diagram-type catalog — single source of truth for how each mermaid
 * diagram type is PRESENTED to users as a distinct feature ("Flowchart",
 * "Mind Map", "Sequence Diagram", …) while one backbone renders them all.
 *
 * Drives: block/canvas labels and icons, starter templates, the new-diagram
 * picker, and which types support structural (visual/outline) editing.
 */

import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  BarChart3,
  Blocks,
  Boxes,
  CalendarRange,
  ChartPie,
  Columns3,
  Database,
  Footprints,
  GitBranch,
  Grid2x2,
  Hexagon,
  History,
  Landmark,
  ListChecks,
  Network,
  Radar,
  Workflow,
} from "lucide-react";

import type { MermaidDiagramType } from "./diagram-type";

export type MermaidSupportLevel = "full" | "code-only";

export interface MermaidCatalogEntry {
  /** User-facing feature name — never says "mermaid". */
  label: string;
  icon: LucideIcon;
  description: string;
  /** Complete, valid starter source for "create new". */
  starterTemplate: string;
  /**
   * "full"  → structural editing planned/available (visual + outline modes
   *           gate further on an adapter passing the round-trip fidelity check)
   * "code-only" → render + code + AI editing only
   */
  support: MermaidSupportLevel;
  /** Featured types appear in the create-new picker. */
  featured?: boolean;
}

export const MERMAID_CATALOG: Record<MermaidDiagramType, MermaidCatalogEntry> = {
  flowchart: {
    label: "Flowchart",
    icon: Workflow,
    description: "Steps, decisions, and arrows — processes and logic flows.",
    starterTemplate: "flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Do the thing]\n  B -->|No| D[Do something else]\n  C --> E[Done]\n  D --> E",
    support: "full",
    featured: true,
  },
  mindmap: {
    label: "Mind Map",
    icon: Network,
    description: "A central idea branching into topics and subtopics.",
    starterTemplate: "mindmap\n  root((Main Idea))\n    Topic One\n      Detail A\n      Detail B\n    Topic Two\n      Detail C",
    support: "full",
    featured: true,
  },
  sequence: {
    label: "Sequence Diagram",
    icon: ArrowRightLeft,
    description: "Who talks to whom, in what order — interactions over time.",
    starterTemplate: "sequenceDiagram\n  participant U as User\n  participant S as System\n  U->>S: Request\n  S-->>U: Response",
    support: "full",
    featured: true,
  },
  pie: {
    label: "Pie Chart",
    icon: ChartPie,
    description: "Proportions of a whole, as labeled slices.",
    starterTemplate: 'pie title Breakdown\n  "Category A" : 45\n  "Category B" : 30\n  "Category C" : 25',
    support: "full",
    featured: true,
  },
  timeline: {
    label: "Timeline",
    icon: History,
    description: "Events laid out chronologically by period.",
    starterTemplate: "timeline\n  title Project Timeline\n  2024 : Kickoff\n  2025 : Launch : Growth\n  2026 : Expansion",
    support: "full",
    featured: true,
  },
  state: {
    label: "State Diagram",
    icon: Boxes,
    description: "States and the transitions between them.",
    starterTemplate: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running : start\n  Running --> Idle : stop\n  Running --> [*] : finish",
    support: "code-only",
    featured: true,
  },
  er: {
    label: "Entity Relationship",
    icon: Database,
    description: "Data entities and how they relate.",
    starterTemplate: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains",
    support: "code-only",
    featured: true,
  },
  gantt: {
    label: "Gantt Chart",
    icon: CalendarRange,
    description: "Tasks scheduled across time, with sections and dependencies.",
    starterTemplate: "gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Phase 1\n  Research :a1, 2026-06-01, 7d\n  Build :after a1, 14d",
    support: "code-only",
    featured: true,
  },
  journey: {
    label: "User Journey",
    icon: Footprints,
    description: "A user's experience through a process, step by step.",
    starterTemplate: "journey\n  title My Day\n  section Morning\n    Wake up: 5: Me\n    Coffee: 5: Me\n  section Work\n    Meetings: 2: Me, Team",
    support: "code-only",
  },
  class: {
    label: "Class Diagram",
    icon: Blocks,
    description: "Classes, fields, methods, and relationships.",
    starterTemplate: "classDiagram\n  class Animal {\n    +String name\n    +makeSound()\n  }\n  Animal <|-- Dog",
    support: "code-only",
  },
  quadrant: {
    label: "Quadrant Chart",
    icon: Grid2x2,
    description: "Items plotted across four quadrants.",
    starterTemplate: "quadrantChart\n  title Reach vs Effort\n  x-axis Low Effort --> High Effort\n  y-axis Low Reach --> High Reach\n  Item A: [0.3, 0.8]\n  Item B: [0.7, 0.4]",
    support: "code-only",
  },
  git: {
    label: "Git Graph",
    icon: GitBranch,
    description: "Branches, commits, and merges.",
    starterTemplate: 'gitGraph\n  commit\n  branch develop\n  commit\n  checkout main\n  merge develop',
    support: "code-only",
  },
  c4: {
    label: "C4 Architecture",
    icon: Landmark,
    description: "System context and container architecture views.",
    starterTemplate: 'C4Context\n  title System Context\n  Person(user, "User")\n  System(app, "Application")\n  Rel(user, app, "Uses")',
    support: "code-only",
  },
  sankey: {
    label: "Sankey Diagram",
    icon: Columns3,
    description: "Flows and their magnitudes between stages.",
    starterTemplate: "sankey-beta\nSource,Target,10\nSource,Other,5",
    support: "code-only",
  },
  xychart: {
    label: "XY Chart",
    icon: BarChart3,
    description: "Bar and line charts on X/Y axes.",
    starterTemplate: 'xychart-beta\n  title "Revenue"\n  x-axis [Q1, Q2, Q3, Q4]\n  y-axis "USD" 0 --> 100\n  bar [20, 45, 60, 80]',
    support: "code-only",
  },
  block: {
    label: "Block Diagram",
    icon: Boxes,
    description: "Free-form block layouts.",
    starterTemplate: "block-beta\n  columns 3\n  a b c",
    support: "code-only",
  },
  packet: {
    label: "Packet Diagram",
    icon: Hexagon,
    description: "Network packet structure by bit ranges.",
    starterTemplate: 'packet-beta\n  0-15: "Source Port"\n  16-31: "Destination Port"',
    support: "code-only",
  },
  kanban: {
    label: "Kanban Board",
    icon: ListChecks,
    description: "Work items organized in status columns.",
    starterTemplate: "kanban\n  Todo\n    Task one\n  In Progress\n    Task two\n  Done\n    Task three",
    support: "code-only",
  },
  architecture: {
    label: "Architecture Diagram",
    icon: Landmark,
    description: "Services, groups, and connections in a system.",
    starterTemplate: "architecture-beta\n  group api(cloud)[API]\n  service db(database)[Database] in api\n  service server(server)[Server] in api\n  db:L -- R:server",
    support: "code-only",
  },
  radar: {
    label: "Radar Chart",
    icon: Radar,
    description: "Multi-axis comparison on a radial grid.",
    starterTemplate: 'radar-beta\n  title Skills\n  axis a["Speed"], b["Quality"], c["Cost"]\n  curve mycurve["Team"]{4, 5, 3}',
    support: "code-only",
  },
  requirement: {
    label: "Requirement Diagram",
    icon: ListChecks,
    description: "Requirements and the elements that satisfy them.",
    starterTemplate: 'requirementDiagram\n  requirement r1 {\n    id: 1\n    text: must be fast\n  }\n  element app {\n    type: system\n  }\n  app - satisfies -> r1',
    support: "code-only",
  },
  zenuml: {
    label: "ZenUML Diagram",
    icon: ArrowRightLeft,
    description: "Sequence diagrams in ZenUML syntax.",
    starterTemplate: "zenuml\n  A.method() {\n    B.call()\n  }",
    support: "code-only",
  },
  unknown: {
    label: "Diagram",
    icon: Workflow,
    description: "A mermaid diagram.",
    starterTemplate: "flowchart TD\n  A[Start] --> B[End]",
    support: "code-only",
  },
};

export function getCatalogEntry(type: MermaidDiagramType): MermaidCatalogEntry {
  return MERMAID_CATALOG[type] ?? MERMAID_CATALOG.unknown;
}

/** Entries shown in the create-new picker, in catalog order. */
export function getFeaturedCatalogEntries(): Array<
  MermaidCatalogEntry & { type: MermaidDiagramType }
> {
  return (Object.keys(MERMAID_CATALOG) as MermaidDiagramType[])
    .filter((t) => MERMAID_CATALOG[t].featured)
    .map((t) => ({ type: t, ...MERMAID_CATALOG[t] }));
}
