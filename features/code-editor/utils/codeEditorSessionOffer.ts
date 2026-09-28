/**
 * Declared offer values of provision `code_editor.session`.
 *
 * Every code-editor launch goes through the MANDATE door (`launchMandate`),
 * where the server drops these mapped-only names unless a binding's
 * consumption map names one — so the current Holders receive exactly what they
 * received before. Each value is a fact the editor already holds; an absent
 * fact omits its key (never "" or null).
 */

import type { CodeEditorSessionOffer } from "@/types/python-generated/provision-offers";

export type CodeEditorSessionOfferValues = Pick<
  Partial<CodeEditorSessionOffer>,
  | "language"
  | "file_path"
  | "diagnostics"
  | "workspace_name"
  | "git_branch"
  | "git_status"
  | "other_files"
  | "editor_title"
  | "context_version"
>;

export interface OtherOpenFile {
  name: string;
  language?: string | null;
  content: string;
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** The other open files, rendered the way the editor's context entries render them. */
export function renderOtherFiles(files: readonly OtherOpenFile[]): string | undefined {
  if (files.length === 0) return undefined;
  return files
    .map(
      (f) =>
        `File: ${f.name}${f.language ? ` (${f.language})` : ""}\n\n${f.content}`,
    )
    .join("\n\n---\n\n");
}

export function buildCodeEditorSessionOffer(input: {
  language?: string | null;
  filePath?: string | null;
  diagnostics?: string | null;
  workspaceName?: string | null;
  gitBranch?: string | null;
  gitStatus?: string | null;
  otherFiles?: readonly OtherOpenFile[];
  editorTitle?: string | null;
  contextVersion?: number | null;
}): CodeEditorSessionOfferValues {
  const out: CodeEditorSessionOfferValues = {};
  const set = <K extends keyof CodeEditorSessionOfferValues>(
    key: K,
    value: CodeEditorSessionOfferValues[K] | undefined,
  ) => {
    if (value !== undefined) out[key] = value;
  };
  set("language", nonEmpty(input.language));
  set("file_path", nonEmpty(input.filePath));
  set("diagnostics", nonEmpty(input.diagnostics));
  set("workspace_name", nonEmpty(input.workspaceName));
  set("git_branch", nonEmpty(input.gitBranch));
  set("git_status", nonEmpty(input.gitStatus));
  set("other_files", input.otherFiles ? renderOtherFiles(input.otherFiles) : undefined);
  set("editor_title", nonEmpty(input.editorTitle));
  set(
    "context_version",
    typeof input.contextVersion === "number" && Number.isFinite(input.contextVersion)
      ? input.contextVersion
      : undefined,
  );
  return out;
}
