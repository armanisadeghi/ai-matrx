"use client";

// features/hr/shared/HrEmployeePhoto.tsx — SPEC-EMPLOYEES §2.3.0, SPEC-ACCESS §3.1
//
// 🚨 A SIGNED URL IS A HANDOFF, NEVER AN IDENTITY.
//
// The record stores a `photo_file_id` — a file id, FK to `files.files(id)` — and
// NOTHING here stores, caches or persists a URL. The durable URL is built from
// the id at render time by string concatenation (`fileUrls`), contains only that
// id, and never expires; authorization happens at REQUEST time via the HttpOnly
// `mx_files_session` cookie that rides plain `<img>` bindings.
//
// That is the platform's file lane, not a local choice: `features/files/handler`
// eradicated presigned transport outright ("There is no presigned transport"),
// and a blocking guard in aidream (`scripts/check_signed_url_confinement.py`)
// exists to stop signed URLs crawling back in through "just one field".
//
// 🚨 INITIALS ARE THE NO-PHOTO STATE, AND THEY STAY. Both HR surfaces already
// rendered initials as the honest placeholder rather than a broken <img>. That
// was right, and it remains the fallback for three distinct cases the viewer
// cannot tell apart and does not need to: no photo on file, a viewer whose tier
// never received `photo_file_id`, and a photo whose bytes will not load.
//
// 🚨 THE SPEC SAYS WHERE THIS GOES, AND WHERE IT DOES NOT.
//   · §2.3.0 — the profile header, on every tab.
//   · SPEC-ACCESS §3.1 — the Directory tier's data contract includes the photo.
//   · The org chart's node type carries `photo_file_id`, but §5.2's prose does
//     NOT name a photo, so this is not wired there on a component's authority.
//   · No approval or decision surface mentions a photo, so it is not on one.

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { pythonFileInlineUrl } from "@/features/files/handler/utils/python-base";
import { mediaFilesClient } from "@/features/files/media-client/client";

/** First letters of the first and last word — the existing placeholder rule. */
export function hrInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function HrEmployeePhoto({
  photoFileId,
  name,
  className,
  textClassName,
}: {
  /** `hr.employee.photo_file_id`. Absent for a viewer whose tier never got it. */
  photoFileId?: string | null;
  name: string | null | undefined;
  /** Size and shape come from the caller, so each surface keeps its own scale. */
  className?: string;
  textClassName?: string;
}) {
  const id = photoFileId?.trim() || null;
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    // The cookie is what authorizes the <img>. Idempotent and deduped, so every
    // photo on a directory page shares one establishment.
    if (id) void mediaFilesClient.ensureSession();
  }, [id]);

  useEffect(() => {
    setFailed(false);
    setRetried(false);
  }, [id]);

  const shell = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
    className,
  );

  if (!id || failed) {
    return (
      <div aria-hidden className={cn(shell, "font-medium text-muted-foreground", textClassName)}>
        {hrInitials(name)}
      </div>
    );
  }

  return (
    <div className={shell}>
      <img
        src={pythonFileInlineUrl(id)}
        alt={name ? `${name}'s photo` : "Employee photo"}
        className="h-full w-full object-cover"
        onError={() => {
          /*
            Recovery is a SESSION REFRESH, not a new URL — the URL is durable and
            was never the problem. A revoked or expired cookie looks identical to
            a missing file from here, so the cookie is re-established once and the
            load retried; a second failure falls back to initials rather than
            leaving a broken image where a person's face should be.
          */
          if (!retried) {
            setRetried(true);
            void mediaFilesClient.ensureSession({ force: true }).then(() => {
              // Re-mount the <img> by clearing the failure flag on the next tick.
              setFailed(false);
            });
            return;
          }
          setFailed(true);
        }}
      />
    </div>
  );
}
