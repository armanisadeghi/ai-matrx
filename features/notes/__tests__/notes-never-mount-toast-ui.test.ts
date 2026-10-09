/**
 * NOTES NEVER MOUNT TOAST UI AGAIN — and every stored mode opens in the one editor.
 *
 * The break this guards (Arman, 2026-09-27): "Our notes system … still uses the
 * horrible plugin we said we'd get rid of but it has somehow now become the
 * default." Toast UI (`@toast-ui/*`, mounted through `TuiEditorContent`) was the
 * notes Write and Markdown-split editor, and `defaultEditorMode: "wysiwyg"` made it
 * the default for everyone. Notes now write in THE ONE EDITOR
 * (components/rich-editor): Write = its visual view; Split = the plain textarea
 * beside the formatted note, live.
 *
 * Three halves, each able to go red on its own:
 *   1. No notes source file (features/notes/**, the Notes window) imports Toast UI
 *      or `TuiEditorContent` — a static scan of import specifiers.
 *   2. The read path maps every value stored before the switch onto a live mode
 *      (wysiwyg → write; markdown-split / markdown / matrx-split / split / source
 *      → split), so no stored preference or legacy note metadata can reach a
 *      Toast UI mode.
 *   3. The knobs' defaults (Arman, 2026-09-27): Split on a desktop, Plain on a
 *      phone, in BOTH preference sources (the slice's in-memory defaults and the
 *      persisted defaults file).
 *
 * `NOTES_TUI_GUARD_ROOT` points the scan at another tree (used to prove the guard
 * red against a scratch copy of the pre-switch files — never the shared checkout).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { canonicalNoteEditorMode } from "../redux/notes.types";
import { defaultUserPreferences } from "@/lib/redux/preferences/defaultUserPreferences";
import { initializeUserPreferencesState } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  NOTE_MODE_MEMORY_LIMIT,
  defaultDesktopMode,
  phoneNoteMode,
  rememberNoteMode,
  resolveNoteEditorMode,
} from "../hooks/usePreferredDefaultEditorMode";

const ROOT = process.env.NOTES_TUI_GUARD_ROOT ?? join(__dirname, "..", "..", "..");
const SCANNED_DIRS = ["features/notes", "features/window-panels/windows/notes"];
const TOAST_UI = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'][^"']*(?:@toast-ui\/|chat-markdown\/tui\/|TuiEditorContent)[^"']*["']/;

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("notes never mount Toast UI", () => {
  it("no notes source file imports @toast-ui or TuiEditorContent", () => {
    const scanned = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));
    expect(scanned.length).toBeGreaterThan(10); // the scan really read the notes tree
    const offenders = scanned
      .filter((file) => readFileSync(file, "utf8").split("\n").some((line) => TOAST_UI.test(line)))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("every stored mode value opens in a live notes mode (never a Toast UI mode)", () => {
    expect(canonicalNoteEditorMode("wysiwyg")).toBe("write");
    expect(canonicalNoteEditorMode("markdown-split")).toBe("split");
    expect(canonicalNoteEditorMode("markdown")).toBe("split");
    expect(canonicalNoteEditorMode("matrx-split")).toBe("split");
    expect(canonicalNoteEditorMode("source")).toBe("split");
    for (const live of ["split", "plain", "write", "preview"] as const) {
      expect(canonicalNoteEditorMode(live)).toBe(live);
    }
    expect(canonicalNoteEditorMode("rich")).toBeNull();
    // A default is a writing mode: a stored Read default opens the platform default, Write.
    expect(defaultDesktopMode("preview")).toBe("write");
    expect(defaultDesktopMode("wysiwyg")).toBe("write");
    expect(defaultDesktopMode("split")).toBe("split");
    expect(defaultDesktopMode(undefined)).toBe("write");
    // The phone has Plain and Write only.
    expect(phoneNoteMode("wysiwyg")).toBe("write");
    expect(phoneNoteMode("split")).toBe("plain");
    expect(phoneNoteMode("preview")).toBe("plain");
  });

  it("the default mode knobs are Write on desktop and phone in both preference sources (Arman, 2026-10-07)", () => {
    expect(defaultUserPreferences.notes.defaultEditorMode).toBe("write");
    expect(initializeUserPreferencesState().notes.defaultEditorMode).toBe("write");
    expect(defaultUserPreferences.notes.defaultPhoneEditorMode).toBe("write");
    expect(initializeUserPreferencesState().notes.defaultPhoneEditorMode).toBe("write");
  });
});

describe("the mode a note opens in", () => {
  const desktop = { device: "desktop" as const, preferredDefault: "write" as const };
  const phone = { device: "phone" as const, preferredDefault: "write" as const };
  const fresh = { sessionMode: null, sessionModeSource: "uninitialized" as const, rememberedMode: undefined };

  it("with nothing remembered: Write on every device", () => {
    expect(resolveNoteEditorMode({ ...desktop, ...fresh })).toBe("write");
    expect(resolveNoteEditorMode({ ...phone, ...fresh })).toBe("write");
    // A person who chose another default on the settings page keeps it.
    expect(resolveNoteEditorMode({ ...desktop, ...fresh, preferredDefault: "split" })).toBe("split");
    expect(resolveNoteEditorMode({ ...phone, ...fresh, preferredDefault: "plain" })).toBe("plain");
  });

  it("a note last edited in Write reopens in Write on every device", () => {
    expect(resolveNoteEditorMode({ ...desktop, ...fresh, rememberedMode: "write" })).toBe("write");
    expect(resolveNoteEditorMode({ ...phone, ...fresh, rememberedMode: "write" })).toBe("write");
  });

  it("a note last typed as text reopens as text — never in Write", () => {
    expect(resolveNoteEditorMode({ ...desktop, ...fresh, rememberedMode: "plain" })).toBe("split");
    expect(resolveNoteEditorMode({ ...desktop, ...fresh, preferredDefault: "plain", rememberedMode: "plain" })).toBe("plain");
    expect(resolveNoteEditorMode({ ...desktop, ...fresh, preferredDefault: "write", rememberedMode: "plain" })).toBe("split");
    expect(resolveNoteEditorMode({ ...phone, ...fresh, preferredDefault: "write", rememberedMode: "plain" })).toBe("plain");
  });

  it("the person's pick in this session wins; legacy metadata comes after the memory", () => {
    expect(resolveNoteEditorMode({ ...desktop, sessionMode: "preview", sessionModeSource: "local", rememberedMode: "write" })).toBe("preview");
    expect(resolveNoteEditorMode({ ...phone, sessionMode: "preview", sessionModeSource: "local", rememberedMode: "write" })).toBe("plain");
    expect(resolveNoteEditorMode({ ...desktop, sessionMode: "wysiwyg", sessionModeSource: "persisted", rememberedMode: "plain" })).toBe("split");
    expect(resolveNoteEditorMode({ ...desktop, sessionMode: "wysiwyg", sessionModeSource: "persisted", rememberedMode: undefined })).toBe("write");
  });

  it("the per-note memory stays bounded and keeps the newest", () => {
    let memory: Record<string, string> | undefined;
    for (let i = 0; i < NOTE_MODE_MEMORY_LIMIT + 25; i += 1) {
      memory = rememberNoteMode(memory, `note-${i}`, i % 2 ? "plain" : "write");
    }
    const ids = Object.keys(memory ?? {});
    expect(ids).toHaveLength(NOTE_MODE_MEMORY_LIMIT);
    expect(ids[ids.length - 1]).toBe(`note-${NOTE_MODE_MEMORY_LIMIT + 24}`);
    expect(ids).not.toContain("note-0");
    // Re-recording an old note moves it to the newest end.
    memory = rememberNoteMode(memory, "note-100", "write");
    expect(Object.keys(memory).at(-1)).toBe("note-100");
    expect(memory["note-100"]).toBe("write");
  });
});
