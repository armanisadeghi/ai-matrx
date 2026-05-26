"use client";

import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UnifiedContextMenu } from "@/features/context-menu";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useUnifiedContextMenu } from "@/features/prompt-builtins/hooks/useUnifiedContextMenu";
import { PLACEMENT_TYPES } from "@/features/prompt-builtins/constants";

// JSON Display Component
function JsonDisplay({
  title,
  data,
  defaultExpanded = false,
}: {
  title: string;
  data: any;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors text-sm font-medium"
      >
        <span>{title}</span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-border">
          <pre className="p-3 text-xs overflow-x-auto max-h-[400px] overflow-y-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Test Scenario Component
function TestScenario({
  title,
  description,
  children,
  fetchedData,
  config,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  fetchedData?: any;
  config?: any;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Left: Test Area */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Test Area
          </div>
          {children}
        </div>

        {/* Right: Data Display */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Live Data
          </div>
          <div className="space-y-2">
            {config && <JsonDisplay title="Configuration" data={config} />}
            {fetchedData && (
              <JsonDisplay title="Fetched Data" data={fetchedData} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnifiedContextMenuTestPage() {
  // Test content
  const [textarea1, setTextarea1] = useState(
    "Select this text and right-click to test AI Actions.",
  );
  const [textarea2, setTextarea2] = useState(
    "This textarea tests Content Block insertion. Right-click to insert templates.",
  );
  const [textarea3, setTextarea3] = useState(
    "This tests ALL placement types together.",
  );
  const [textarea4, setTextarea4] = useState(
    "This tests ONLY AI Actions (filtered).",
  );
  const [textarea5, setTextarea5] = useState(
    "Multi-line text editor:\n\nParagraph 1 with some content.\n\nParagraph 2 with more text.\n\nSelect any part and test inline replacement.",
  );

  const textarea1Ref = useRef<HTMLTextAreaElement>(null);
  const textarea2Ref = useRef<HTMLTextAreaElement>(null);
  const textarea3Ref = useRef<HTMLTextAreaElement>(null);
  const textarea4Ref = useRef<HTMLTextAreaElement>(null);
  const textarea5Ref = useRef<HTMLTextAreaElement>(null);

  // Fetch data for each test scenario to display
  const aiActionsData = useUnifiedContextMenu(
    [PLACEMENT_TYPES.AI_ACTION],
    undefined,
    true,
  );
  const contentBlocksData = useUnifiedContextMenu(
    [PLACEMENT_TYPES.CONTENT_BLOCK],
    undefined,
    true,
  );
  const allTypesData = useUnifiedContextMenu(
    [
      PLACEMENT_TYPES.AI_ACTION,
      PLACEMENT_TYPES.CONTENT_BLOCK,
      PLACEMENT_TYPES.ORGANIZATION_TOOL,
      PLACEMENT_TYPES.USER_TOOL,
    ],
    undefined,
    true,
  );
  const orgToolsData = useUnifiedContextMenu(
    [PLACEMENT_TYPES.ORGANIZATION_TOOL],
    undefined,
    true,
  );
  const userToolsData = useUnifiedContextMenu(
    [PLACEMENT_TYPES.USER_TOOL],
    undefined,
    true,
  );

  // Helper to replace text in textarea
  const replaceTextInTextarea = (
    textareaRef: React.RefObject<HTMLTextAreaElement>,
    content: string,
    setContent: (val: string) => void,
    newText: string,
  ) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = content.substring(0, start);
      const after = content.substring(end);
      const updated = before + newText + after;
      setContent(updated);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + newText.length);
      }, 0);
    }
  };

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      {/* Compact Header */}
      <div className="flex-none border-b border-border bg-card px-4 py-3">
        <h1 className="text-lg font-bold">UnifiedContextMenu Test Lab</h1>
        <p className="text-xs text-muted-foreground">
          Full-screen testing with live data visibility
        </p>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-[1800px] mx-auto space-y-6">
          {/* Test 1: AI Actions Only */}
          <TestScenario
            title="Test 1: AI Actions Only"
            description="Right-click to see only AI Actions. Tests basic shortcut execution."
            fetchedData={{
              loading: aiActionsData.loading,
              categoryGroups: aiActionsData.categoryGroups,
              error: aiActionsData.error,
            }}
            config={{
              enabledPlacements: [PLACEMENT_TYPES.AI_ACTION],
              isEditable: false,
              contextData: { content: textarea1 },
            }}
          >
            <UnifiedContextMenu
              enabledPlacements={[PLACEMENT_TYPES.AI_ACTION]}
              contextData={{ content: textarea1 }}
              isEditable={false}
            >
              <Card className="p-4">
                <textarea
                  ref={textarea1Ref}
                  className="w-full h-24 bg-transparent resize-none focus:outline-none text-sm"
                  value={textarea1}
                  onChange={(e) => setTextarea1(e.target.value)}
                />
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 2: Content Blocks Only */}
          <TestScenario
            title="Test 2: Content Blocks Only"
            description="Right-click to insert content blocks. Tests template insertion with getTextarea prop."
            fetchedData={{
              loading: contentBlocksData.loading,
              categoryGroups: contentBlocksData.categoryGroups,
              error: contentBlocksData.error,
            }}
            config={{
              enabledPlacements: [PLACEMENT_TYPES.CONTENT_BLOCK],
              isEditable: true,
              getTextarea: "() => textarea2Ref.current",
              onContentInserted: "Callback triggered after insertion",
            }}
          >
            <UnifiedContextMenu
              enabledPlacements={[PLACEMENT_TYPES.CONTENT_BLOCK]}
              getTextarea={() => textarea2Ref.current}
              onContentInserted={() => console.log("Content inserted!")}
              isEditable={true}
            >
              <Card className="p-4">
                <textarea
                  ref={textarea2Ref}
                  className="w-full h-24 bg-transparent resize-none focus:outline-none text-sm"
                  value={textarea2}
                  onChange={(e) => setTextarea2(e.target.value)}
                />
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 3: Enhanced Scope System Demo */}
          <TestScenario
            title="Test 3: Enhanced Scope System (selection/content/context/custom)"
            description="Demonstrates the full scope system. Select text to see how selection, content, context, and custom variables work together."
            fetchedData={{
              loading: allTypesData.loading,
              categoryGroups: allTypesData.categoryGroups,
              error: allTypesData.error,
            }}
            config={{
              contextData: {
                content: textarea3,
                context:
                  "All available information: User profile, recent activity, preferences",
                custom_field_1: "TypeScript errors from compiler",
                custom_field_2: "Recent terminal output",
              },
            }}
          >
            <UnifiedContextMenu
              enabledPlacements={[
                PLACEMENT_TYPES.AI_ACTION,
                PLACEMENT_TYPES.CONTENT_BLOCK,
                PLACEMENT_TYPES.ORGANIZATION_TOOL,
                PLACEMENT_TYPES.USER_TOOL,
                "quick-action",
              ]}
              contextData={{
                content: textarea3, // Primary content
                context:
                  "Broader context: User is working on a React component", // Surrounding info
                // Custom variables for special shortcuts
                ts_errors: "Type 'string' is not assignable to type 'number'",
                terminal_output: "Build successful in 2.3s",
                file_path: "/src/components/Example.tsx",
              }}
              getTextarea={() => textarea3Ref.current}
              isEditable={true}
            >
              <Card className="p-4">
                <div className="mb-2 text-xs text-muted-foreground">
                  <strong>Scope Demo:</strong> selection (auto), content (full
                  text), context (user info), custom (ts_errors,
                  terminal_output, file_path)
                </div>
                <textarea
                  ref={textarea3Ref}
                  className="w-full h-24 bg-transparent resize-none focus:outline-none text-sm"
                  value={textarea3}
                  onChange={(e) => setTextarea3(e.target.value)}
                  placeholder="Type here and try right-click actions..."
                />
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 4: With Context Filter */}
          <TestScenario
            title="Test 4: Context Filtering"
            description="Tests the contextFilter parameter. Only shows items enabled for 'code-editor' context."
            fetchedData={{
              loading: aiActionsData.loading,
              categoryGroups: aiActionsData.categoryGroups,
              note: "Filtered by contextFilter='code-editor'",
            }}
            config={{
              enabledPlacements: [PLACEMENT_TYPES.AI_ACTION],
              contextData: { contextFilter: "code-editor", content: textarea4 },
            }}
          >
            <UnifiedContextMenu
              enabledPlacements={[PLACEMENT_TYPES.AI_ACTION]}
              contextData={{ contextFilter: "code-editor", content: textarea4 }}
              isEditable={false}
            >
              <Card className="p-4">
                <textarea
                  ref={textarea4Ref}
                  className="w-full h-24 bg-transparent resize-none focus:outline-none text-sm font-mono"
                  value={textarea4}
                  onChange={(e) => setTextarea4(e.target.value)}
                  placeholder="const x = 42;"
                />
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 5: Inline Text Replacement */}
          <TestScenario
            title="Test 5: Inline Text Replacement"
            description="Select text and use an AI action with result_display='inline' to replace it directly."
            fetchedData={{
              loading: aiActionsData.loading,
              categoryGroups: aiActionsData.categoryGroups,
            }}
            config={{
              enabledPlacements: [PLACEMENT_TYPES.AI_ACTION],
              isEditable: true,
              onTextReplace: "Function to replace selected text",
              contextData: { content: textarea5 },
            }}
          >
            <UnifiedContextMenu
              enabledPlacements={[PLACEMENT_TYPES.AI_ACTION]}
              isEditable={true}
              onTextReplace={(newText) =>
                replaceTextInTextarea(
                  textarea5Ref,
                  textarea5,
                  setTextarea5,
                  newText,
                )
              }
              contextData={{ content: textarea5 }}
            >
              <Card className="p-4">
                <textarea
                  ref={textarea5Ref}
                  className="w-full h-32 bg-transparent resize-none focus:outline-none text-sm"
                  value={textarea5}
                  onChange={(e) => setTextarea5(e.target.value)}
                />
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 6: Organization Tools Only */}
          <TestScenario
            title="Test 6: Organization Tools"
            description="Right-click to see organization-specific tools."
            fetchedData={{
              loading: orgToolsData.loading,
              categoryGroups: orgToolsData.categoryGroups,
              error: orgToolsData.error,
            }}
            config={{
              enabledPlacements: [PLACEMENT_TYPES.ORGANIZATION_TOOL],
            }}
          >
            <UnifiedContextMenu
              enabledPlacements={[PLACEMENT_TYPES.ORGANIZATION_TOOL]}
            >
              <Card className="p-4 min-h-[100px] flex items-center justify-center text-sm text-muted-foreground">
                Right-click anywhere in this card
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 7: User Tools Only */}
          <TestScenario
            title="Test 7: User Tools"
            description="Right-click to see user-specific tools."
            fetchedData={{
              loading: userToolsData.loading,
              categoryGroups: userToolsData.categoryGroups,
              error: userToolsData.error,
            }}
            config={{
              enabledPlacements: [PLACEMENT_TYPES.USER_TOOL],
            }}
          >
            <UnifiedContextMenu enabledPlacements={[PLACEMENT_TYPES.USER_TOOL]}>
              <Card className="p-4 min-h-[100px] flex items-center justify-center text-sm text-muted-foreground">
                Right-click anywhere in this card
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 8: Plain Text Selection (No Edit) */}
          <TestScenario
            title="Test 8: Read-Only Selection"
            description="Select text in this read-only card. Tests selection tracking without edit capabilities."
            fetchedData={{
              loading: aiActionsData.loading,
              categoryGroups: aiActionsData.categoryGroups,
            }}
            config={{
              enabledPlacements: [PLACEMENT_TYPES.AI_ACTION],
              isEditable: false,
              contextData: {
                content: "The Persian Empire was one of the largest empires...",
                context: "Historical text about ancient civilizations",
              },
            }}
          >
            <UnifiedContextMenu
              enabledPlacements={[PLACEMENT_TYPES.AI_ACTION]}
              isEditable={false}
              contextData={{
                content:
                  "The Persian Empire was one of the largest empires in the ancient world, demonstrating early examples of imperial governance over diverse peoples.",
                context: "Historical text about ancient civilizations",
              }}
            >
              <Card className="p-4 select-text cursor-text">
                <div className="text-sm leading-relaxed">
                  The Persian Empire was one of the largest empires in the
                  ancient world, demonstrating early examples of imperial
                  governance over diverse peoples. Founded by Cyrus the Great,
                  it became known for its sophisticated administration and
                  cultural tolerance.
                </div>
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 9: Quick Actions Only */}
          <TestScenario
            title="Test 9: Quick Actions Only"
            description="Right-click to see only the hard-coded Quick Actions (Notes, Tasks, Chat, Data, Files)."
            fetchedData={{
              note: "Quick Actions are hard-coded, not fetched from DB",
            }}
            config={{
              enabledPlacements: ["quick-action"],
            }}
          >
            <UnifiedContextMenu enabledPlacements={["quick-action"]}>
              <Card className="p-4 min-h-[100px] flex items-center justify-center text-sm text-muted-foreground">
                Right-click to open Quick Actions
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 10: Code Editor Scenario */}
          <TestScenario
            title="Test 10: Code Editor Scenario (Real-World Example)"
            description="Simulates a code editor with selection/content/context/custom variables"
            fetchedData={{
              loading: aiActionsData.loading,
              categoryGroups: aiActionsData.categoryGroups,
            }}
            config={{
              contextData: {
                content: "Full file content",
                context: "Imported files + open tabs",
                ts_errors: "3 type errors",
                terminal_output: "npm run dev running...",
                file_path: "/src/App.tsx",
              },
            }}
          >
            <UnifiedContextMenu
              enabledPlacements={[
                PLACEMENT_TYPES.AI_ACTION,
                PLACEMENT_TYPES.CONTENT_BLOCK,
              ]}
              contextData={{
                content: `import React from 'react';\nimport { Button } from './ui/button';\n\nfunction App() {\n  return <Button>Click me</Button>;\n}`,
                context: `Open files: [App.tsx, button.tsx, index.tsx]\nImports: react, lucide-react`,
                contextFilter: "code-editor", // Filter for code-editor context
                ts_errors:
                  "Line 5: Type 'string' is not assignable to type 'ReactNode'",
                terminal_output: "✓ Compiled successfully in 450ms",
                file_path: "/src/App.tsx",
                language: "typescript",
              }}
              isEditable={true}
            >
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-2">
                  <strong>Realistic Code Editor:</strong> Select code and
                  right-click
                </div>
                <pre className="p-3 bg-muted rounded text-xs font-mono">
                  {`import React from 'react';
import { Button } from './ui/button';

function App() {
  return <Button>Click me</Button>;
}

export default App;`}
                </pre>
              </Card>
            </UnifiedContextMenu>
          </TestScenario>

          {/* Test 11: Native Browser Actions */}
          <TestScenario
            title="Test 11: Browser Actions (Cut/Copy/Paste/Find)"
            description="Right-click to see native browser actions (copy, cut, paste, select all, find)"
            fetchedData={{
              note: "Browser actions automatically added when text is selected or editable",
            }}
            config={{
              isEditable: true,
              enabledPlacements: [PLACEMENT_TYPES.AI_ACTION],
            }}
          >
            <UnifiedContextMenu
              enabledPlacements={[PLACEMENT_TYPES.AI_ACTION]}
              isEditable={true}
            >
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-2">
                  Select text to see Copy/Cut, or right-click anywhere for all
                  browser actions
                </div>
                <input
                  type="text"
                  className="w-full p-2 bg-transparent border border-border rounded text-sm"
                  defaultValue="Try selecting this text and right-clicking"
                />
              </Card>
            </UnifiedContextMenu>
          </TestScenario>
        </div>
      </div>
    </div>
  );
}
