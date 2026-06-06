import {
  FolderOpen,
  Search,
  Share2,
  RefreshCw,
  Lock,
  History,
  Eye,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: RefreshCw,
    title: "Real-time synced",
    description:
      "Upload from any device, see it everywhere instantly. Changes propagate to teammates, agents, and chats without a refresh.",
  },
  {
    icon: Search,
    title: "Searchable by content, not just name",
    description:
      "Every PDF, doc, transcript, image is indexed. Ask in plain English; results pin back to the page, paragraph, or frame.",
  },
  {
    icon: Share2,
    title: "Share links with granular permissions",
    description:
      "View, comment, edit — per link, per recipient, per expiry. Revoke instantly. Auditable on every share.",
  },
  {
    icon: Lock,
    title: "Zero Data Retention by default",
    description:
      "Your files never train models. Organization-scoped storage, SOC 2 Type II, ISO 27001 — the baseline, not the upgrade.",
  },
  {
    icon: History,
    title: "Version history, ready to roll back",
    description:
      "Every save kept. Compare versions side-by-side, restore any previous state, see who changed what and when.",
  },
  {
    icon: Eye,
    title: "Drop into chat or agents instantly",
    description:
      "Files are first-class context. Drop a doc into a chat, attach to an agent, hand off to a workflow — same file, every surface.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Upload anything",
    description:
      "Drag and drop, paste from clipboard, pull from a URL, or sync from external sources. Folders, files, photos, audio, video — all welcome.",
  },
  {
    number: "02",
    title: "Indexed and searchable",
    description:
      "Files are auto-indexed for content search the moment they land. Ask, don't browse — answers pin back to the source.",
  },
  {
    number: "03",
    title: "Use them anywhere",
    description:
      "Drop into chat, attach to agents, feed into knowledge bases, share via link. The same file, with the same permissions, everywhere.",
  },
  {
    number: "04",
    title: "Audit and roll back",
    description:
      "Every action recorded. Version history, share history, access history. Roll back, revoke, or replay anything you need to.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "All Files",
    status: "Live",
    href: "/files/all",
    items: [
      "Browse, preview, organize",
      "Folder tree + tags",
      "Bulk operations",
      "Drag-and-drop everywhere",
    ],
  },
  {
    title: "Shared with me",
    status: "Live",
    href: "/files/shared",
    items: [
      "Files others gave you access to",
      "Granular permissions",
      "Comment + view + edit",
      "Filter by sender",
    ],
  },
  {
    title: "Starred",
    status: "Live",
    href: "/files/starred",
    items: [
      "Pin your favorites",
      "Quick access from anywhere",
      "Sync across devices",
      "Folder-wide stars",
    ],
  },
  {
    title: "Activity",
    status: "Live",
    href: "/files/activity",
    items: [
      "Recent uploads + edits",
      "Share history",
      "Team activity feed",
      "Filter by user or file",
    ],
  },
  {
    title: "Photos",
    status: "Live",
    href: "/files/photos",
    items: [
      "Gallery view",
      "Date-bucketed timeline",
      "EXIF metadata",
      "AI-assisted search",
    ],
  },
  {
    title: "File requests",
    status: "Coming soon",
    items: [
      "Collect files from outside",
      "Branded request links",
      "Auto-tag on arrival",
      "Notify on upload",
    ],
  },
];

export default function FilesLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:files"
      eyebrow="AI Matrx Files"
      eyebrowIcon={FolderOpen}
      headline="Files that are"
      headlineGradient="actually searchable."
      description="Real-time synced file system with content-level search, fine-grained share permissions, version history, and first-class integration with chat and agents. The repository your AI workforce actually understands."
      primaryCtaHref="/sign-up?source=files-landing"
      primaryCtaLabel="Start Storing Free"
      workspaceHref="/files/all"
      workspaceLabel="Files"
      capabilitiesHeading="A file system built for an AI-first team"
      capabilitiesDescription="Six capabilities under every upload — searchable, shareable, versioned, auditable, AI-native."
      capabilities={CAPABILITIES}
      stepsDescription="From a folder of records to a defensible, searchable, shareable archive in four steps."
      steps={STEPS}
      subAreasHeading="Where Files lives"
      subAreasDescription="One file system, many views. Browse, search, share, audit — from any surface."
      subAreas={SUB_AREAS}
      finalCtaHeading="The file system your AI agents already understand"
      finalCtaDescription="Real-time sync, content search, fine-grained sharing, version history. Free to start, no credit card required."
      relatedModules={["/rag/data-stores", "/notes", "/tools/pdf-extractor"]}
    />
  );
}
