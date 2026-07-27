"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOpenSmartCodeEditorWindow } from "@/features/window-panels/windows/smart-code-editor/useOpenSmartCodeEditorWindow";
import type {
  CodeEditorAgentConfig,
  CodeFile,
} from "@/features/code-editor/agent-code-editor/types";
import { TYPESCRIPT_SNIPPET, ADDITIONAL_CONTEXT_SNIPPET } from "./snippets";

// ── Agent registry ───────────────────────────────────────────────────────────

const AGENTS: CodeEditorAgentConfig[] = [
  {
    id: "55cc4ad1-bafd-4b82-af0b-4b4f40406ca3",
    name: "Code Editor",
    codeVariableKey: "current_code",
  },
  {
    id: "eede051c-d450-4f01-a6de-b282a7ebb581",
    name: "Code Editor (Dynamic Context)",
    codeVariableKey: "dynamic_context",
  },
  {
    id: "f6649577-aa9e-4b81-afef-47f11a6bef1b",
    name: "Prompt App Code Editor",
    codeVariableKey: "current_code",
  },
];

const LANGUAGES = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "python",
  "go",
  "rust",
  "html",
  "css",
  "sql",
];

// Mock IDE context defaults — realistic enough that the agent isn't confused.
const DEFAULT_FILE_PATH =
  "/Users/armanisadeghi/code/matrx-admin/features/agents/components/builder/AgentBuilderRightPanel.tsx";
const DEFAULT_WORKSPACE_NAME = "matrx-admin";
const DEFAULT_WORKSPACE_FOLDERS = [
  "/Users/armanisadeghi/code/matrx-admin",
  "/Users/armanisadeghi/code/matrx-admin/features/agents",
  "/Users/armanisadeghi/code/matrx-admin/features/code-editor",
].join("\n");
const DEFAULT_GIT_BRANCH = "main";
const DEFAULT_GIT_STATUS =
  "On branch main\nnothing to commit, working tree clean";
const DEFAULT_DIAGNOSTICS = "No errors or warnings";
const DEFAULT_AGENT_SKILLS =
  "file_read, file_write, shell_exec, code_search, web_search";

// Multi-file demo — a minimal file set exercising the Files column.
const DEFAULT_FILES: CodeFile[] = [
  {
    name: "AgentBuilderRightPanel.tsx",
    path: "features/agents/components/builder/AgentBuilderRightPanel.tsx",
    language: "tsx",
    content: TYPESCRIPT_SNIPPET,
  },
  {
    name: "AgentBuilderDesktop.tsx",
    path: "features/agents/components/builder/AgentBuilderDesktop.tsx",
    language: "tsx",
    content: ADDITIONAL_CONTEXT_SNIPPET,
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SmartCodeEditorDemoPage() {
  const open = useOpenSmartCodeEditorWindow();

  // Inputs
  const [code, setCode] = useState(TYPESCRIPT_SNIPPET);
  const [language, setLanguage] = useState("typescript");
  const [filePath, setFilePath] = useState(DEFAULT_FILE_PATH);
  const [selection, setSelection] = useState("");
  const [diagnostics, setDiagnostics] = useState(DEFAULT_DIAGNOSTICS);
  const [workspaceName, setWorkspaceName] = useState(DEFAULT_WORKSPACE_NAME);
  const [workspaceFolders, setWorkspaceFolders] = useState(
    DEFAULT_WORKSPACE_FOLDERS,
  );
  const [gitBranch, setGitBranch] = useState(DEFAULT_GIT_BRANCH);
  const [gitStatus, setGitStatus] = useState(DEFAULT_GIT_STATUS);
  const [agentSkills, setAgentSkills] = useState(DEFAULT_AGENT_SKILLS);

  const commonOpts = {
    agents: AGENTS,
    language,
    filePath: filePath || undefined,
    selection: selection || undefined,
    diagnostics: diagnostics || undefined,
    workspaceName: workspaceName || undefined,
    workspaceFolders: workspaceFolders || undefined,
    gitBranch: gitBranch || undefined,
    gitStatus: gitStatus || undefined,
    agentSkills: agentSkills || undefined,
    onCodeChange: (e: { code: string }) => setCode(e.code),
  };

  const openSingleFile = () => {
    open({
      ...commonOpts,
      initialCode: code,
      title: "Smart Code Editor",
    });
  };

  const openMultiFile = () => {
    open({
      ...commonOpts,
      files: DEFAULT_FILES,
      initialActiveFilePath: DEFAULT_FILES[0].path,
      title: "Smart Code Editor — multi-file",
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={openSingleFile}>Open single-file window</Button>
        <Button onClick={openMultiFile} variant="outline">
          Open multi-file window
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Code</span>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[140px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l} className="text-xs">
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono text-xs h-[320px] resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {code.length} chars · {code.split("\n").length} lines
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Context slots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SlotInput
              label="vsc_active_file_path"
              value={filePath}
              onChange={setFilePath}
            />
            <SlotInput
              label="vsc_workspace_name"
              value={workspaceName}
              onChange={setWorkspaceName}
            />
            <SlotInput
              label="vsc_git_branch"
              value={gitBranch}
              onChange={setGitBranch}
            />
            <SlotTextarea
              label="vsc_selected_text"
              value={selection}
              onChange={setSelection}
              rows={2}
            />
            <SlotTextarea
              label="vsc_diagnostics"
              value={diagnostics}
              onChange={setDiagnostics}
              rows={2}
            />
            <SlotTextarea
              label="vsc_workspace_folders"
              value={workspaceFolders}
              onChange={setWorkspaceFolders}
              rows={2}
            />
            <SlotTextarea
              label="vsc_git_status"
              value={gitStatus}
              onChange={setGitStatus}
              rows={2}
            />
            <SlotTextarea
              label="agent_skills"
              value={agentSkills}
              onChange={setAgentSkills}
              rows={2}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Small input helpers ──────────────────────────────────────────────────────

function SlotInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-mono text-muted-foreground">
        {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs font-mono"
      />
    </div>
  );
}

function SlotTextarea({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-mono text-muted-foreground">
        {label}
      </Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows ?? 2}
        className="text-xs font-mono resize-none"
      />
    </div>
  );
}
