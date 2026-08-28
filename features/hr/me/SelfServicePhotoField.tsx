"use client";

// features/hr/me/SelfServicePhotoField.tsx — SPEC-EMPLOYEES §7.1
//
// 🚨 THE PHOTO IS `self_free`, AND THAT IS THE WHOLE CONTROL.
// §7.1's table puts "directory photo" in the self_free row beside preferred name
// and pronouns — no approval, no request, no HR in the loop. So this saves
// immediately like the other free fields, and there is deliberately no pending
// state here: inventing one would tell somebody their own photo needs approving
// when the spec says it does not.
//
// 🚨 WHAT IS STORED IS THE FILE ID. The upload returns a durable
// `files.files(id)`, and THAT is what goes on the record — never a URL. Rendering
// resolves the id at render time through the platform's durable lane; see
// `HrEmployeePhoto`, which is also what shows the result here so the person sees
// exactly what the directory will show.
//
// 🚨 REMOVING IS NOT SPEC'D SEPARATELY, SO IT IS THE SAME WRITE. The spec names
// no delete path for the photo. `hr_self_update`'s free branch nulls the column
// on an empty string, so "Remove" is the same self-service write with an empty
// value — not a second door with its own rules.

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";

import { HrEmployeePhoto } from "../shared/HrEmployeePhoto";

/** What the backend will accept as a directory photo. */
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 10 * 1024 * 1024;

export function SelfServicePhotoField({
  photoFileId,
  name,
  onSave,
  saving,
  className,
}: {
  photoFileId?: string | null;
  name: string | null | undefined;
  /** Resolves `false` when the write did not land, like every other self field. */
  onSave: (field: string, next: string) => Promise<boolean>;
  saving?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const { upload } = useFileUpload();

  const busy = uploading || saving;

  const choose = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("That file is not an image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      // Said as a fact with the limit in it, so the person knows what would work.
      toast.error("That image is larger than 10 MB. Pick a smaller one.");
      return;
    }

    setUploading(true);
    try {
      // The handler takes a tagged source, not a bare File.
      const uploaded = await upload({ kind: "file", file });
      const fileId = uploaded?.fileId;
      if (!fileId) {
        // The upload returned without the one thing the record needs. Say so
        // rather than writing nothing and looking like a save.
        toast.error("The image uploaded but came back without an id, so nothing was saved.");
        return;
      }
      // No toast here: `useSelfUpdate` already announces the save by name, and
      // two toasts for one act is the same sentence twice.
      await onSave("photo_file_id", fileId);
    } catch (e) {
      toast.error(
        e instanceof Error && e.message.trim()
          ? `The image did not upload. ${e.message}`
          : "The image did not upload.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <div className="text-xs font-medium text-muted-foreground">Photo</div>
      <div className="flex items-center gap-3">
        <HrEmployeePhoto
          photoFileId={photoFileId}
          name={name}
          className="h-14 w-14"
          textClassName="text-base"
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void choose(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {photoFileId ? "Replace photo" : "Add a photo"}
          </Button>
          {photoFileId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11 sm:min-h-9"
              disabled={busy}
              onClick={() => {
                void onSave("photo_file_id", "");
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">
        This is the photo the staff directory shows. Changing it is yours alone —
        it needs no approval.
      </p>
    </div>
  );
}
