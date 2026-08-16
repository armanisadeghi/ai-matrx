import {
  ExternalLink,
  Eye,
  FilePenLine,
  Gauge,
  Hammer,
  Map,
  Pencil,
  Rocket,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import type { ItemMenuConfig } from "@/components/official/item/types";
import type { ClientPageSummary } from "@/features/cms/types";
import { cmsPageHasContent } from "@/features/cms/utils/cmsPageAi";

export interface CmsPageMenuContext {
  page: ClientPageSummary;
  editorHref: string;
  previewHref: string;
  liveHref: string | null;
  planHref: string | null;
  /** The page's AFTER — the editor's Measure tab; null until `web_page_id` joins. */
  measureHref: string | null;
  onAi: () => void;
  onReview: () => void;
  onPublish: () => void | Promise<void>;
  onDelete: () => void;
}

/** The one page-action registry used by every CMS page-list presentation. */
export function buildCmsPageMenu(ctx: CmsPageMenuContext): ItemMenuConfig {
  const hasContent = cmsPageHasContent(ctx.page);
  return {
    header: { title: ctx.page.title, description: ctx.page.route },
    sections: [
      {
        id: "ai",
        label: "AI",
        items: [
          {
            id: "build-edit-ai",
            label: hasContent ? "Edit with AI" : "Build with AI",
            icon: hasContent ? FilePenLine : Hammer,
            onSelect: ctx.onAi,
          },
          {
            id: "review-ai",
            label: "Review before publish",
            icon: ShieldCheck,
            onSelect: ctx.onReview,
          },
        ],
      },
      {
        id: "open",
        items: [
          {
            id: "edit",
            kind: "link",
            label: "Open editor",
            icon: Pencil,
            href: ctx.editorHref,
          },
          {
            id: "edit-new-tab",
            kind: "link",
            label: "Open editor in new tab",
            icon: ExternalLink,
            href: ctx.editorHref,
            target: "_blank",
          },
          {
            id: "preview",
            kind: "link",
            label: "Preview page",
            icon: Eye,
            href: ctx.previewHref,
            target: "_blank",
          },
          {
            id: "live",
            kind: "link",
            label: "Open live page",
            icon: ExternalLink,
            href: ctx.liveHref ?? ctx.previewHref,
            target: "_blank",
            hidden: !ctx.liveHref,
          },
          {
            id: "plan",
            kind: "link",
            label: "Open content plan",
            icon: Map,
            href: ctx.planHref ?? ctx.editorHref,
            target: "_blank",
            hidden: !ctx.planHref,
          },
          {
            id: "measure",
            kind: "link",
            label: "Open measurement",
            icon: Gauge,
            href: ctx.measureHref ?? ctx.editorHref,
            target: "_blank",
            hidden: !ctx.measureHref,
          },
        ],
      },
      {
        id: "publish",
        label: "Publish",
        items: [
          {
            id: "publish-draft",
            label: "Publish pending draft",
            icon: Rocket,
            onSelect: ctx.onPublish,
            disabled: !ctx.page.has_draft,
            disabledReason: ctx.page.has_draft
              ? undefined
              : "This page has no saved draft to publish",
          },
        ],
      },
      {
        id: "danger",
        items: [
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            tone: "destructive",
            onSelect: ctx.onDelete,
          },
        ],
      },
    ],
  };
}
