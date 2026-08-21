import type { FilesystemAdapter } from "./FilesystemAdapter";
import type { FilesystemNode } from "../types";

interface MockNode {
  kind: "file" | "directory";
  content?: string;
}

/**
 * Empty placeholder filesystem rendered when no sandbox is connected.
 *
 * We intentionally ship NO sample files here — the prior demo project was
 * confusing for users who expected the Explorer to either reflect their
 * real saved code (Library) or a connected sandbox. The single README
 * just tells them how to get a real workspace.
 */
const MOCK_PROJECT: Record<string, MockNode> = {
  "/": { kind: "directory" },
  "/README.md": {
    kind: "file",
    content:
      `# No workspace connected\n\n` +
      `This Explorer view is a placeholder filesystem.\n\n` +
      `To get a real workspace:\n\n` +
      `1. Open the **Sandboxes** view in the activity bar (left side) and\n` +
      `   create or attach to a sandbox container — the Explorer will then\n` +
      `   show that sandbox's filesystem and the editor will edit real\n` +
      `   files inside it.\n\n` +
      `2. Or open the **Code Library** view (default) to browse code you\n` +
      `   already saved (your saved files, prompt apps, agent apps, and\n` +
      `   tool UI components).\n`,
  },
};

function basename(path: string): string {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function parentOf(path: string): string {
  if (path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export class MockFilesystemAdapter implements FilesystemAdapter {
  readonly id = "mock";
  readonly label = "Mock Project";
  readonly rootPath = "/";
  readonly writable = true;

  private readonly data: Record<string, MockNode>;

  constructor(overrides?: Record<string, MockNode>) {
    this.data = { ...MOCK_PROJECT, ...(overrides ?? {}) };
  }

  async listChildren(path: string): Promise<FilesystemNode[]> {
    const normalized = path === "" ? "/" : path;
    const nodes: FilesystemNode[] = [];
    for (const [p, node] of Object.entries(this.data)) {
      if (p === normalized) continue;
      if (parentOf(p) !== normalized) continue;
      nodes.push({
        path: p,
        name: basename(p),
        kind: node.kind,
        size: node.content ? node.content.length : undefined,
      });
    }
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  async readFile(path: string): Promise<string> {
    const node = this.data[path];
    // access-errors: ok — in-memory mock fixture for demos/tests, no real record read
    if (!node) throw new Error(`File not found: ${path}`);
    if (node.kind !== "file") throw new Error(`Not a file: ${path}`);
    return node.content ?? "";
  }

  async writeFile(path: string, content: string): Promise<void> {
    const node = this.data[path];
    if (node && node.kind === "directory") {
      throw new Error(`Cannot write to a directory: ${path}`);
    }
    this.data[path] = { kind: "file", content };
  }
}
