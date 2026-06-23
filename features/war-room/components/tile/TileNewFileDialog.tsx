"use client";

// features/war-room/components/tile/TileNewFileDialog.tsx
//
// "New file" creator for a War Room tile's Files section. Lets the user author a
// lightweight code / config / raw-text file (JSON, YAML, plain text, etc.) right
// in the tile — distinct from a structured `document` (udt_documents). The body
// is the REAL compact code editor (SmallCodeEditor, full Monaco) so the user gets
// syntax highlighting + formatting, not a stripped textarea.
//
// On save it produces a REAL cloud file with NO new storage path:
//   1) the editor text → a `File` (Blob) with the chosen name + mime
//   2) requestUpload(...) — the one canonical upload primitive (dedup pre-flight,
//      durable cld_files row), into the tile's conventional folder
//   3) attachFileToTile(tileId, fileId, name) — the existing association thunk
//
// Heavy (Monaco) — the host loads THIS dialog via next/dynamic({ ssr:false }), so
// nothing here enters the War Room bundle until the user opens it.

import { useMemo, useState } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import SmallCodeEditor from "@/features/code-editor/components/code-block/SmallCodeEditor";
import { getFileExtension } from "@/features/code-editor/config/languages";
import {
  requestUpload,
  folderForWarRoomTile,
} from "@/features/files";
import { useAppDispatch } from "@/lib/redux/hooks";
import { attachFileToTile } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";

/**
 * Curated, lightweight authoring languages — the text/code/config formats a user
 * creates inline (NOT a full IDE language list). Each carries the Monaco language
 * id + the MIME we stamp on the cloud file. The file extension auto-derives from
 * the language via the editor's own `getFileExtension`.
 */
const FILE_LANGUAGES = [
  { id: "plaintext", label: "Plain text", mime: "text/plain" },
  { id: "json", label: "JSON", mime: "application/json" },
  { id: "yaml", label: "YAML", mime: "text/yaml" },
  { id: "markdown", label: "Markdown", mime: "text/markdown" },
  { id: "javascript", label: "JavaScript", mime: "text/javascript" },
  { id: "typescript", label: "TypeScript", mime: "text/typescript" },
  { id: "python", label: "Python", mime: "text/x-python" },
  { id: "html", label: "HTML", mime: "text/html" },
  { id: "css", label: "CSS", mime: "text/css" },
  { id: "xml", label: "XML", mime: "application/xml" },
  { id: "sql", label: "SQL", mime: "application/sql" },
  { id: "shell", label: "Shell", mime: "text/x-sh" },
] as const;

type FileLanguageId = (typeof FILE_LANGUAGES)[number]["id"];

/** Ensure the filename carries the language's extension (append if missing). */
function withExtension(name: string, language: string): string {
  const ext = getFileExtension(language); // includes the leading dot
  const trimmed = name.trim();
  if (!trimmed) return `untitled${ext}`;
  return trimmed.toLowerCase().endsWith(ext.toLowerCase())
    ? trimmed
    : `${trimmed}${ext}`;
}

export function TileNewFileDialog({
  tileId,
  open,
  onOpenChange,
}: {
  tileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<FileLanguageId>("plaintext");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const lang = useMemo(
    () => FILE_LANGUAGES.find((l) => l.id === language) ?? FILE_LANGUAGES[0],
    [language],
  );

  const reset = () => {
    setName("");
    setLanguage("plaintext");
    setBody("");
  };

  const handleSave = async () => {
    if (saving) return;
    const text = body;
    if (!text.trim()) {
      toast.info("Add some content before saving");
      return;
    }
    setSaving(true);
    try {
      const fileName = withExtension(name, language);
      // Author text → a real File, then through the ONE upload primitive.
      const file = new File([text], fileName, { type: lang.mime });
      const result = await requestUpload({
        files: [file],
        folderPath: folderForWarRoomTile(tileId),
        visibility: "private",
      });
      if (result.cancelled) return;
      // The dedup dialog may alias to an existing identical file — attach that.
      const ids = [
        ...result.uploaded,
        ...result.aliased.map((a) => a.existingFileId),
      ];
      const fileId = ids[0];
      if (!fileId) {
        const first = result.failed[0];
        toast.error(
          first ? `Couldn't create the file: ${first.error}` : "Couldn't create the file",
        );
        return;
      }
      const attached = await dispatch(attachFileToTile(tileId, fileId, fileName));
      if (attached) {
        toast.success(`Created ${fileName}`);
        reset();
        onOpenChange(false);
      }
    } catch (err) {
      console.error("[war-room/new-file] create failed:", err);
      toast.error("Couldn't create the file");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex h-[80dvh] max-h-[80dvh] w-[min(92vw,56rem)] max-w-[56rem] flex-col gap-3 p-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FilePlus2 className="size-4 text-primary" />
            New file
          </DialogTitle>
          <DialogDescription>
            Create a code, config, or text file and attach it to this thread.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="File name (e.g. config)"
            // text-base (16px) avoids iOS input zoom (repo mobile rule).
            className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-base sm:text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as FileLanguageId)}
            aria-label="File type"
            className="shrink-0 rounded-md border border-border bg-card px-2.5 py-1.5 text-base sm:text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {FILE_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <span className="shrink-0 rounded bg-muted px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
            {withExtension(name, language)}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
          <SmallCodeEditor
            language={lang.id}
            initialCode={body}
            onChange={(v) => setBody(v ?? "")}
            mode="light"
            height="100%"
            showResetButton={false}
            showMinimapToggle={false}
          />
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !body.trim()}
            className={cn(saving && "cursor-not-allowed")}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <FilePlus2 className="mr-2 size-4" />
                Create file
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
