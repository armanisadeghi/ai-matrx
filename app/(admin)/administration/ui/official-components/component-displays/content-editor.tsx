"use client";

import React, { useState } from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { ContentEditor } from "@/components/official/content-editor/ContentEditor";
import { ContentEditorStack } from "@/components/official/content-editor/ContentEditorStack";
import {
  ContentEditorTabs,
  type ContentEditorTab,
} from "@/components/official/content-editor/ContentEditorTabs";
import { ContentEditorList } from "@/components/official/content-editor/ContentEditorList";
import {
  ContentEditorTree,
  type ContentEditorTreeNode,
} from "@/components/official/content-editor/ContentEditorTree";
import {
  ContentEditorBrowser,
  type ContentEditorFilter,
} from "@/components/official/content-editor/ContentEditorBrowser";
import {
  ContentEditorTabsWithList,
  type ContentEditorDocument,
} from "@/components/official/content-editor/ContentEditorTabsWithList";
import type { HeaderAction } from "@/components/official/content-editor/types";
import {
  Download,
  FileText,
  BookOpen,
  CircleDot,
  Flag,
  Code,
  Settings,
  Image as ImageIcon,
} from "lucide-react";
import HtmlPreviewModal from "@/features/html-pages/components/HtmlPreviewModal";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function ContentEditorDisplay({
  component,
}: ComponentDisplayProps) {
  if (!component) return null;

  // Demo state
  const [content, setContent] = useState(
    "# Welcome\n\nThis is a **powerful** content editor!",
  );
  const [stackContents, setStackContents] = useState([
    "# Section 1\n\nFirst section content...",
    "# Section 2\n\nSecond section content...",
    "# Section 3\n\nThird section content...",
  ]);
  const [htmlModal, setHtmlModal] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");
  const [htmlTitle, setHtmlTitle] = useState("");

  // Tabs-only demo state
  const [tabs, setTabs] = useState<ContentEditorTab[]>([
    {
      id: "t1",
      title: "Introduction",
      value: "# Introduction\n\nWelcome to the tabs demo.",
    },
    { id: "t2", title: "Body", value: "# Body\n\nThe middle section." },
    { id: "t3", title: "Conclusion", value: "# Conclusion\n\nWrap it up." },
  ]);

  // Standalone list demo state
  const listDemoItems = [
    {
      id: "doc-intro",
      title: "Introduction",
      description: "Opening section",
      icon: BookOpen,
    },
    {
      id: "doc-body",
      title: "Main Content",
      description: "The meat of the document",
      icon: FileText,
    },
    {
      id: "doc-extra",
      title: "Appendix",
      description: "Reference material",
      icon: CircleDot,
    },
    {
      id: "doc-end",
      title: "Conclusion",
      description: "Closing thoughts",
      icon: Flag,
    },
  ];
  const [listActiveId, setListActiveId] = useState<string>("doc-intro");
  const [listOpenIds, setListOpenIds] = useState<string[]>([
    "doc-intro",
    "doc-body",
  ]);

  // Combined List + Tabs demo state
  const [documents, setDocuments] = useState<ContentEditorDocument[]>([
    {
      id: "d1",
      title: "Welcome",
      description: "Landing page",
      icon: BookOpen,
      value: "# Welcome\n\nStart here.",
    },
    {
      id: "d2",
      title: "Getting Started",
      description: "Quick setup",
      icon: CircleDot,
      value: "# Getting Started\n\nInstall and run.",
    },
    {
      id: "d3",
      title: "API Reference",
      description: "Full API docs",
      icon: FileText,
      value: "# API Reference\n\nAll endpoints.",
    },
    {
      id: "d4",
      title: "Troubleshooting",
      description: "Common issues",
      icon: Flag,
      value: "# Troubleshooting\n\nWhen things go wrong.",
    },
    {
      id: "d5",
      title: "Changelog",
      description: "Release notes",
      icon: FileText,
      value: "# Changelog\n\nv1.0 — first release.",
    },
  ]);
  const [combinedOpenIds, setCombinedOpenIds] = useState<string[]>([
    "d1",
    "d2",
  ]);
  const [combinedActiveId, setCombinedActiveId] = useState<string | undefined>(
    "d1",
  );

  // Fade-collapse demo state
  const [fadeContent, setFadeContent] = useState(
    "# Fade Collapse Demo\n\nWhen collapsed, this editor shrinks to a preview strip with a soft bottom fade. Click the round chevron that appears at the bottom of the preview to expand — or use the chevron in the header to toggle.\n\n## Lots of content\n\n" +
      Array.from({ length: 10 }, (_, i) => `- Bullet item ${i + 1}`).join("\n"),
  );

  // Tree demo state
  const treeNodes: ContentEditorTreeNode[] = [
    {
      id: "src",
      title: "src",
      icon: BookOpen,
      children: [
        {
          id: "src/components",
          title: "components",
          icon: BookOpen,
          children: [
            {
              id: "src/components/Button.tsx",
              title: "Button.tsx",
              description: "Primary button component",
              icon: Code,
            },
            {
              id: "src/components/Input.tsx",
              title: "Input.tsx",
              description: "Form input",
              icon: Code,
            },
          ],
        },
        {
          id: "src/hooks",
          title: "hooks",
          icon: BookOpen,
          children: [
            {
              id: "src/hooks/useAuth.ts",
              title: "useAuth.ts",
              description: "Authentication hook",
              icon: Code,
            },
          ],
        },
        {
          id: "src/index.ts",
          title: "index.ts",
          description: "Package entry",
          icon: Code,
        },
      ],
    },
    {
      id: "docs",
      title: "docs",
      icon: BookOpen,
      children: [
        {
          id: "docs/README.md",
          title: "README.md",
          description: "Project overview",
          icon: FileText,
        },
        {
          id: "docs/CHANGELOG.md",
          title: "CHANGELOG.md",
          description: "Release notes",
          icon: FileText,
        },
      ],
    },
    {
      id: "package.json",
      title: "package.json",
      description: "Manifest",
      icon: Settings,
    },
  ];
  const [treeActiveId, setTreeActiveId] = useState<string>(
    "src/components/Button.tsx",
  );
  const [treeOpenIds, setTreeOpenIds] = useState<string[]>([
    "src/components/Button.tsx",
    "src/hooks/useAuth.ts",
  ]);

  // VSCode-style workspace demo — tree + tabs with shared mode + fade collapse
  const workspaceDocuments: ContentEditorDocument[] = [
    {
      id: "w/welcome",
      title: "Welcome.md",
      description: "Landing page",
      icon: BookOpen,
      value:
        "# Welcome\n\nStart by opening a file from the explorer on the left.",
    },
    {
      id: "w/button",
      title: "Button.tsx",
      description: "Primary button",
      icon: Code,
      value:
        "```tsx\nexport function Button(props) {\n  return <button {...props} />\n}\n```",
    },
    {
      id: "w/input",
      title: "Input.tsx",
      description: "Form input",
      icon: Code,
      value:
        "```tsx\nexport function Input(props) {\n  return <input {...props} />\n}\n```",
    },
    {
      id: "w/auth",
      title: "useAuth.ts",
      description: "Auth hook",
      icon: Code,
      value:
        "```ts\nexport function useAuth() {\n  return { user: null, loading: false }\n}\n```",
    },
    {
      id: "w/readme",
      title: "README.md",
      description: "Project overview",
      icon: FileText,
      value: "# README\n\nA modern content editor workspace.",
    },
    {
      id: "w/changelog",
      title: "CHANGELOG.md",
      description: "Release notes",
      icon: FileText,
      value: "# Changelog\n\n- **v1.0** First release",
    },
    {
      id: "w/package",
      title: "package.json",
      description: "Manifest",
      icon: Settings,
      value: '```json\n{\n  "name": "workspace",\n  "version": "1.0.0"\n}\n```',
    },
    {
      id: "w/assets/logo",
      title: "logo.svg",
      description: "Brand asset",
      icon: ImageIcon,
      value: "<!-- svg preview not rendered -->",
    },
  ];
  const workspaceTree: ContentEditorTreeNode[] = [
    {
      id: "folder:src",
      title: "src",
      children: [
        {
          id: "folder:src/components",
          title: "components",
          children: [
            { id: "w/button", title: "Button.tsx", icon: Code },
            { id: "w/input", title: "Input.tsx", icon: Code },
          ],
        },
        {
          id: "folder:src/hooks",
          title: "hooks",
          children: [{ id: "w/auth", title: "useAuth.ts", icon: Code }],
        },
      ],
    },
    {
      id: "folder:docs",
      title: "docs",
      children: [
        { id: "w/readme", title: "README.md", icon: FileText },
        { id: "w/changelog", title: "CHANGELOG.md", icon: FileText },
      ],
    },
    {
      id: "folder:assets",
      title: "assets",
      children: [{ id: "w/assets/logo", title: "logo.svg", icon: ImageIcon }],
    },
    { id: "w/welcome", title: "Welcome.md", icon: BookOpen },
    { id: "w/package", title: "package.json", icon: Settings },
  ];
  const [workspaceDocs, setWorkspaceDocs] = useState(workspaceDocuments);
  const [workspaceOpenIds, setWorkspaceOpenIds] = useState<string[]>([
    "w/welcome",
    "w/button",
  ]);
  const [workspaceActiveId, setWorkspaceActiveId] = useState<
    string | undefined
  >("w/welcome");

  const workspaceFilters: ContentEditorFilter[] = [
    { id: "code", label: "Code", tone: "blue" },
    { id: "docs", label: "Docs", tone: "emerald" },
    { id: "config", label: "Config", tone: "amber" },
    { id: "assets", label: "Assets", tone: "violet" },
  ];

  // Filter predicate for the workspace browser — matches by icon or id prefix.
  const workspaceFilterPredicate = (
    item: { id: string; icon?: React.ComponentType<{ className?: string }> },
    activeFilterIds: string[],
  ) => {
    if (activeFilterIds.length === 0) return true;
    // Folder nodes (children defined) aren't passed here — filter predicate is
    // only invoked for leaves in the tree, and for every item in lists.
    if (activeFilterIds.includes("code") && item.icon === Code) return true;
    if (activeFilterIds.includes("docs") && item.icon === FileText) return true;
    if (activeFilterIds.includes("config") && item.icon === Settings)
      return true;
    if (activeFilterIds.includes("assets") && item.icon === ImageIcon)
      return true;
    return false;
  };

  // Single Editor Example
  const singleEditorCode = `import { ContentEditor } from '@/components/content-editor';

const [content, setContent] = useState('# Your content here');

<ContentEditor
  value={content}
  onChange={setContent}
  availableModes={['plain', 'wysiwyg', 'markdown', 'preview']}  // All modes available
  initialMode="plain"                    // Starting mode
  autoSave={false}                       // Enable auto-save
  autoSaveDelay={1000}                   // Delay in ms
  onSave={(content) => {                 // Save callback
    console.log('Saving:', content);
  }}
  collapsible={false}                    // Make collapsible
  defaultCollapsed={false}               // Start collapsed
  title="Content Editor"                 // Header title
  headerActions={[]}                     // Custom header actions
  showCopyButton={true}                  // Show copy dropdown (default: true)
  showContentManager={true}              // Show content manager (default: true)
  onShowHtmlPreview={(html, title) => {  // HTML preview handler
    console.log('HTML:', html);
  }}
  placeholder="Start typing..."         // Placeholder text
  showModeSelector={true}                // Show mode selector
  className=""                           // Additional classes
/>`;

  // Stack Example
  const stackCode = `import { ContentEditorStack } from '@/components/content-editor';

const [contents, setContents] = useState([
  '# Section 1\\n\\nContent...',
  '# Section 2\\n\\nMore content...'
]);

<ContentEditorStack
  contents={contents}                    // Array of content strings
  onContentsChange={setContents}         // Callback when any content changes
  availableModes={['plain', 'preview']}  // Modes available to all editors
  initialMode="preview"                  // Starting mode for all
  autoSave={false}                       // Apply to all
  onSave={(content, index) => {          // Save callback with index
    console.log(\`Saving editor \${index}:\`, content);
  }}
  collapsible={true}                     // Make all collapsible
  defaultCollapsed={true}                // Collapse all but first
  generateTitle={(index) =>              // Generate titles from index
    ['Intro', 'Body', 'Conclusion'][index]
  }
  headerActions={[]}                     // Same actions for all
  showCopyButton={true}                  // Show on all
  showContentManager={true}              // Show on all
  onShowHtmlPreview={handlePreview}      // HTML preview handler
  placeholder="Type here..."             // Placeholder for all
  showModeSelector={true}                // Show on all
  spacing="md"                           // 'sm' | 'md' | 'lg'
  className=""                           // Additional classes
/>`;

  // Custom Actions Example
  const customActionsCode = `import { Download } from 'lucide-react';
import type { HeaderAction } from '@/components/content-editor';

const customActions: HeaderAction[] = [
  {
    id: 'download',
    icon: Download,
    label: 'Download as markdown',
    onClick: (content) => {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'content.md';
      a.click();
      URL.revokeObjectURL(url);
    }
  }
];

<ContentEditor
  value={content}
  onChange={setContent}
  headerActions={customActions}
/>`;

  const handleShowHtmlPreview = (html: string, title?: string) => {
    setHtmlContent(html);
    setHtmlTitle(title || "HTML Preview");
    setHtmlModal(true);
  };

  const customActions: HeaderAction[] = [
    {
      id: "download",
      icon: Download,
      label: "Download as markdown",
      onClick: (content) => {
        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "content.md";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
    },
  ];

  return (
    <>
      <ComponentDisplayWrapper component={component} code={singleEditorCode}>
        <div className="space-y-8">
          {/* Single Editor Demo */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
              Single Editor
            </h3>
            <div className="border border-zinc-300 dark:border-zinc-700 rounded-lg overflow-hidden">
              <ContentEditor
                value={content}
                onChange={setContent}
                // availableModes={['plain', 'wysiwyg', 'markdown', 'preview']}
                initialMode="plain"
                collapsible={false}
                title="Content Editor Demo"
                headerActions={customActions}
                showCopyButton={true}
                showContentManager={true}
                onShowHtmlPreview={handleShowHtmlPreview}
                placeholder="Start typing your content..."
                showModeSelector={true}
              />
            </div>
          </div>

          {/* Stack Demo */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
              ContentEditorStack - Multiple Editors
            </h3>
            <div className="space-y-3">
              <ContentEditorStack
                contents={stackContents}
                onContentsChange={setStackContents}
                availableModes={["plain", "preview"]}
                initialMode="preview"
                collapsible={true}
                defaultCollapsed={true}
                generateTitle={(index) => {
                  const titles = ["Introduction", "Main Content", "Conclusion"];
                  return titles[index] || `Section ${index + 1}`;
                }}
                showCopyButton={true}
                showContentManager={true}
                onShowHtmlPreview={handleShowHtmlPreview}
                placeholder="Edit this section..."
                showModeSelector={true}
                spacing="sm"
              />
            </div>
          </div>

          {/* Tabs Demo */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
              ContentEditorTabs — Browser-style tabs with shared mode selector
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              The mode selector sits in the tab bar (far right) and applies to
              every tab — per-tab selectors are hidden automatically.
            </p>
            <ContentEditorTabs
              tabs={tabs}
              onTabsChange={setTabs}
              collapsible
              allowAddTab
              allowCloseTab
              onAddTab={() => ({
                id: crypto.randomUUID(),
                title: "Untitled",
                value: "",
              })}
              availableModes={["plain", "matrx-split", "preview"]}
              initialMode="matrx-split"
              sharedModeSelector
              showCopyButton
              showContentManager
              onShowHtmlPreview={handleShowHtmlPreview}
              placeholder="Write something..."
            />
          </div>

          {/* Fade Collapse Demo */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
              Fade Collapse — shrink to a preview instead of hiding
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Set{" "}
              <code className="text-[11px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                collapseMode="fade"
              </code>{" "}
              to keep a small preview strip with a bottom fade and a round
              expand chevron.
            </p>
            <ContentEditor
              value={fadeContent}
              onChange={setFadeContent}
              collapsible
              collapseMode="fade"
              defaultCollapsed
              collapsedPreviewHeight={140}
              availableModes={["plain", "preview", "matrx-split"]}
              initialMode="preview"
              title="Fade Collapse Editor"
              showCopyButton
              onShowHtmlPreview={handleShowHtmlPreview}
            />
          </div>

          {/* Tree Demo */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
              ContentEditorTree — VSCode-style hierarchical view
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Folders expand/collapse; leaves use the same three-state system as{" "}
              <code>ContentEditorList</code>.
            </p>
            <div className="flex gap-4 items-start">
              <div className="w-72">
                <ContentEditorTree
                  nodes={treeNodes}
                  activeId={treeActiveId}
                  openIds={treeOpenIds}
                  defaultExpandedIds={["src", "src/components"]}
                  title="Explorer"
                  onItemClick={(id) => {
                    if (!treeOpenIds.includes(id)) {
                      setTreeOpenIds([...treeOpenIds, id]);
                    }
                    setTreeActiveId(id);
                  }}
                />
              </div>
              <div className="flex-1 text-xs text-zinc-600 dark:text-zinc-400 space-y-2 bg-zinc-50 dark:bg-zinc-900/40 border border-border rounded-lg p-3">
                <div>
                  <span className="font-semibold">Active:</span> {treeActiveId}
                </div>
                <div>
                  <span className="font-semibold">Open:</span>{" "}
                  {treeOpenIds.join(", ") || "(none)"}
                </div>
              </div>
            </div>
          </div>

          {/* Browser (searchable list) Demo */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
              ContentEditorBrowser — searchable & filterable
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Wraps any list or tree with search + filter chips. Filters are
              declarative — pass a{" "}
              <code className="text-[11px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                filterPredicate
              </code>{" "}
              and chip tones.
            </p>
            <div className="flex gap-4 items-start">
              <div className="w-72">
                <ContentEditorBrowser
                  variant="list"
                  items={listDemoItems}
                  activeId={listActiveId}
                  openIds={listOpenIds}
                  title="Sections"
                  searchPlaceholder="Search sections…"
                  filters={[
                    { id: "open", label: "Open only", tone: "emerald" },
                  ]}
                  filterPredicate={(item, ids) =>
                    !ids.includes("open") || listOpenIds.includes(item.id)
                  }
                  onItemClick={(id) => {
                    if (!listOpenIds.includes(id))
                      setListOpenIds([...listOpenIds, id]);
                    setListActiveId(id);
                  }}
                  contentClassName="max-h-72"
                />
              </div>
              <div className="flex-1 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/40 border border-border rounded-lg p-3">
                Type to search. Toggle{" "}
                <span className="font-medium">Open only</span> to hide items you
                haven't opened yet.
              </div>
            </div>
          </div>

          {/* VSCode-style workspace Demo */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
              Workspace — tree explorer + tabs + shared mode + fade collapse
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              All the new pieces composed together: a searchable tree sidebar, a
              single shared mode selector in the tab bar, fade-style collapse on
              the editor area, and filter chips for file kinds.
            </p>
            <ContentEditorTabsWithList
              documents={workspaceDocs}
              onDocumentsChange={setWorkspaceDocs}
              openIds={workspaceOpenIds}
              onOpenIdsChange={setWorkspaceOpenIds}
              activeId={workspaceActiveId}
              onActiveIdChange={setWorkspaceActiveId}
              sidebarMode="tree-browser"
              treeNodes={workspaceTree}
              filters={workspaceFilters}
              filterPredicate={workspaceFilterPredicate}
              listTitle="Explorer"
              listWidth="w-72"
              collapsible
              collapseMode="fade"
              collapsedPreviewHeight={160}
              allowCloseTab
              sharedModeSelector
              defaultSharedMode="preview"
              availableModes={["plain", "matrx-split", "preview"]}
              initialMode="preview"
              showCopyButton
              showContentManager
              onShowHtmlPreview={handleShowHtmlPreview}
            />
          </div>

          {/* Standalone List Demo */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
              ContentEditorList — Standalone sidebar list
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Three item states:{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                active
              </span>
              ,{" "}
              <span className="font-medium text-blue-600 dark:text-blue-400">
                open
              </span>
              , and{" "}
              <span className="font-medium text-zinc-600 dark:text-zinc-400">
                closed
              </span>
              . Click a closed item to open it; click an open item to activate
              it.
            </p>
            <div className="flex gap-4 items-start">
              <div className="w-64">
                <ContentEditorList
                  items={listDemoItems}
                  activeId={listActiveId}
                  openIds={listOpenIds}
                  title="Sections"
                  onItemClick={(id) => {
                    if (!listOpenIds.includes(id)) {
                      setListOpenIds([...listOpenIds, id]);
                    }
                    setListActiveId(id);
                  }}
                />
              </div>
              <div className="flex-1 text-xs text-zinc-600 dark:text-zinc-400 space-y-2 bg-zinc-50 dark:bg-zinc-900/40 border border-border rounded-lg p-3">
                <div>
                  <span className="font-semibold">Active:</span> {listActiveId}
                </div>
                <div>
                  <span className="font-semibold">Open:</span>{" "}
                  {listOpenIds.join(", ") || "(none)"}
                </div>
                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setListOpenIds(["doc-intro"])}
                    className="px-2 py-1 text-xs bg-white dark:bg-zinc-800 border border-border rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    Reset open
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setListOpenIds(listDemoItems.map((i) => i.id))
                    }
                    className="px-2 py-1 text-xs bg-white dark:bg-zinc-800 border border-border rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    Open all
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Combined List + Tabs Demo */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
              ContentEditorTabsWithList — Sidebar list + tabs
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Click an item in the sidebar to open it as a tab and activate it.
              Close a tab to take it back to the "closed" state in the list.
            </p>
            <ContentEditorTabsWithList
              documents={documents}
              onDocumentsChange={setDocuments}
              openIds={combinedOpenIds}
              onOpenIdsChange={setCombinedOpenIds}
              activeId={combinedActiveId}
              onActiveIdChange={setCombinedActiveId}
              listTitle="Documents"
              listWidth="w-56"
              collapsible
              allowCloseTab
              availableModes={["plain", "matrx-split", "preview"]}
              initialMode="matrx-split"
              showCopyButton
              showContentManager
              onShowHtmlPreview={handleShowHtmlPreview}
            />
          </div>

          {/* Code Examples Section */}
          <div className="mt-8 space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-2 text-zinc-700 dark:text-zinc-300">
                ContentEditorStack Usage
              </h3>
              <pre className="text-xs bg-zinc-900 dark:bg-black text-zinc-100 p-4 rounded-lg overflow-x-auto">
                <code>{stackCode}</code>
              </pre>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-zinc-700 dark:text-zinc-300">
                Custom Header Actions
              </h3>
              <pre className="text-xs bg-zinc-900 dark:bg-black text-zinc-100 p-4 rounded-lg overflow-x-auto">
                <code>{customActionsCode}</code>
              </pre>
            </div>
          </div>
        </div>
      </ComponentDisplayWrapper>

      <HtmlPreviewModal
        isOpen={htmlModal}
        onClose={() => setHtmlModal(false)}
        htmlContent={htmlContent}
        title={htmlTitle}
      />
    </>
  );
}
