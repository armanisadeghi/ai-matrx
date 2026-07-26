"use client";

import { ComponentEntry } from "../parts/component-list";
import {
  ComponentDisplayWrapper,
  ComponentDisplayGroup,
} from "../component-usage";
import {
  ResponsiveIconButtonGroup,
  IconButtonConfig,
} from "@/components/official/ResponsiveIconButtonGroup";
import {
  Copy,
  Edit,
  Trash2,
  Download,
  Share2,
  Star,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function ResponsiveIconButtonGroupDisplay({
  component,
}: ComponentDisplayProps) {
  if (!component) return null;

  const buttons: IconButtonConfig[] = [
    {
      id: "copy",
      icon: Copy,
      tooltip: "Copy",
      mobileLabel: "Copy",
      onClick: () => console.log("copy"),
    },
    {
      id: "edit",
      icon: Edit,
      tooltip: "Edit",
      mobileLabel: "Edit",
      onClick: () => console.log("edit"),
    },
    {
      id: "download",
      icon: Download,
      tooltip: "Download",
      mobileLabel: "Download",
      onClick: () => console.log("download"),
      disabled: true,
    },
    {
      id: "share",
      icon: Share2,
      tooltip: "Share",
      mobileLabel: "Share",
      onClick: () => console.log("share"),
    },
    {
      id: "delete",
      icon: Trash2,
      tooltip: "Delete",
      mobileLabel: "Delete",
      onClick: () => console.log("delete"),
      iconClassName: "text-destructive",
    },
  ];

  const code1 = `<ResponsiveIconButtonGroup
  buttons={buttons}
  sheetTitle="Actions"
/>`;

  const code2 = `<ResponsiveIconButtonGroup
  buttons={buttons}
  sheetTitle="Actions"
  className="rounded-xl py-1 px-3 border border-border"
/>`;

  const codeForceMobile = `// forceMobile collapses all buttons into a bottom sheet —
// useful for testing mobile UX on desktop, or for tight layouts
<ResponsiveIconButtonGroup
  buttons={buttons}
  sheetTitle="My Actions"
  forceMobile={true}
/>`;

  const codeCustomTrigger = `// mobileTrigger replaces the default "..." icon with any node
<ResponsiveIconButtonGroup
  buttons={buttons}
  sheetTitle="Actions"
  forceMobile={true}
  mobileTrigger={
    <Button variant="outline" size="sm" className="gap-1">
      <MoreHorizontal className="w-4 h-4" />
      Actions
    </Button>
  }
/>`;

  const codeComponent = `// The component slot lets you embed any React node inline
// — a badge, a popover trigger, a dropdown — alongside icon buttons
const buttons: IconButtonConfig[] = [
  { id: "copy", icon: Copy, tooltip: "Copy", onClick: () => {} },
  {
    id: "status",
    component: <Badge variant="secondary">3 pending</Badge>,
  },
  { id: "delete", icon: Trash2, tooltip: "Delete", iconClassName: "text-destructive", onClick: () => {} },
];`;

  const codeRender = `// render() gives full per-button control and receives isMobile,
// so you can show completely different UI on desktop vs. the sheet
const buttons: IconButtonConfig[] = [
  { id: "copy", icon: Copy, tooltip: "Copy", onClick: () => {} },
  {
    id: "star",
    render: (isMobile) =>
      isMobile ? (
        <Button variant="ghost" className="w-full h-14 justify-start gap-4 text-base rounded-xl">
          <Star className="w-5 h-5 text-yellow-500" />
          <span>Favourite</span>
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="gap-1 text-yellow-500">
          <Star className="w-4 h-4" /> Favourite
        </Button>
      ),
  },
  { id: "delete", icon: Trash2, tooltip: "Delete", iconClassName: "text-destructive", onClick: () => {} },
];`;

  const componentButtons: IconButtonConfig[] = [
    {
      id: "copy",
      icon: Copy,
      tooltip: "Copy",
      mobileLabel: "Copy",
      onClick: () => console.log("copy"),
    },
    {
      id: "status",
      component: (
        <Badge
          variant="secondary"
          className="cursor-pointer select-none"
          onClick={() => console.log("badge")}
        >
          3 pending
        </Badge>
      ),
    },
    {
      id: "delete",
      icon: Trash2,
      tooltip: "Delete",
      mobileLabel: "Delete",
      onClick: () => console.log("delete"),
      iconClassName: "text-destructive",
    },
  ];

  const renderButtons: IconButtonConfig[] = [
    {
      id: "copy",
      icon: Copy,
      tooltip: "Copy",
      mobileLabel: "Copy",
      onClick: () => console.log("copy"),
    },
    {
      id: "star",
      render: (isMobile) =>
        isMobile ? (
          <Button
            variant="ghost"
            className="w-full h-14 flex items-center justify-start gap-4 text-base rounded-xl"
          >
            <Star className="w-5 h-5 text-yellow-500" />
            <span className="flex-1 text-left">Favourite</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-yellow-500 h-8 px-2"
          >
            <Star className="w-4 h-4" /> Favourite
          </Button>
        ),
    },
    {
      id: "delete",
      icon: Trash2,
      tooltip: "Delete",
      mobileLabel: "Delete",
      onClick: () => console.log("delete"),
      iconClassName: "text-destructive",
    },
  ];

  return (
    <ComponentDisplayGroup
      items={[
        <ComponentDisplayWrapper
          component={component}
          code={code1}
          description="Default — bare buttons, no container styling. Download is disabled."
        >
          <div className="inline-flex">
            <ResponsiveIconButtonGroup buttons={buttons} sheetTitle="Actions" />
          </div>
        </ComponentDisplayWrapper>,

        <ComponentDisplayWrapper
          component={component}
          code={code2}
          description="className — border, rounded corners, and padding applied to the container via className."
        >
          <div className="inline-flex">
            <ResponsiveIconButtonGroup
              buttons={buttons}
              sheetTitle="Actions"
              className="rounded-xl py-1 px-3 border border-border"
            />
          </div>
        </ComponentDisplayWrapper>,

        <ComponentDisplayWrapper
          component={component}
          code={codeForceMobile}
          description="forceMobile — collapses all buttons into a bottom sheet. On real mobile this happens automatically; this prop forces it for testing or tight layouts. Tap '...' to open."
        >
          <div className="inline-flex">
            <ResponsiveIconButtonGroup
              buttons={buttons}
              sheetTitle="My Actions"
              forceMobile={true}
            />
          </div>
        </ComponentDisplayWrapper>,

        <ComponentDisplayWrapper
          component={component}
          code={codeCustomTrigger}
          description="mobileTrigger — swap the default '...' icon for any node. Useful when the group sits inside a toolbar that needs a labelled button."
        >
          <div className="inline-flex">
            <ResponsiveIconButtonGroup
              buttons={buttons}
              sheetTitle="Actions"
              forceMobile={true}
              mobileTrigger={
                <Button variant="outline" size="sm" className="gap-1">
                  <MoreHorizontal className="w-4 h-4" />
                  Actions
                </Button>
              }
            />
          </div>
        </ComponentDisplayWrapper>,

        <ComponentDisplayWrapper
          component={component}
          code={codeComponent}
          description="component slot — any React node (badge, popover, dropdown) slots in alongside the icon buttons without breaking the group."
        >
          <div className="inline-flex">
            <ResponsiveIconButtonGroup
              buttons={componentButtons}
              sheetTitle="Actions"
              className="rounded-xl py-1 px-3 border border-border"
            />
          </div>
        </ComponentDisplayWrapper>,

        <ComponentDisplayWrapper
          component={component}
          code={codeRender}
          description="render() — receives isMobile so you can provide entirely different desktop vs. sheet UI for the same logical button. The Favourite button here is a full labelled button on desktop and a full-width sheet row on mobile."
        >
          <div className="inline-flex">
            <ResponsiveIconButtonGroup
              buttons={renderButtons}
              sheetTitle="Actions"
              className="rounded-xl py-1 px-3 border border-border"
            />
          </div>
        </ComponentDisplayWrapper>,
      ]}
    />
  );
}
