"use client";

/**
 * One-click "Attach screenshot" + "Attach to chat ▸ screenshot · code · text" +
 * "Copy image" for a rendered HTML page (rendered-output standard, guarantee 3).
 *
 * The screenshot is captured NOW (at attach), by the server engine at this
 * frame's width and the viewer's theme, and lands as an image part whose chip
 * shows at once (pending). Code/text ride the conversation's context as a
 * resource reference — never the message text.
 *
 * Lives on the HTML card header until the canvas pane's standard "Attach to
 * chat ▸" entry (canvas ≥ 0.10 `CanvasOutputPorts.attachOptions`) is wired to
 * the same `attachRendered` call.
 */

import React, { useState } from "react";
import { Camera, Paperclip } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { copyImage } from "@ai-matrx/kit/clipboard";
import { useAttachRenderedArtifact } from "@ai-matrx/chat/agents/components/inputs/resources/useAttachRenderedArtifact";
import { availableRenderedArtifactRepresentations } from "@ai-matrx/chat/agents/utils/renderedArtifactContext";
import type { RenderedArtifactRepresentation } from "@ai-matrx/chat/agents/types/instance.types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import {
  captureRecordOnServer,
  frameCapture,
  renderedRecordFor,
  viewerColorScheme,
} from "@/features/html-pages/capture/renderedCapture";

export interface HtmlAttachToChatProps {
  conversationId: string | undefined;
  canvasItemId: string | undefined;
  pageUrl: string | null;
  title: string;
  frame: () => HTMLElement | null;
}

export function HtmlAttachToChat({
  conversationId,
  canvasItemId,
  pageUrl,
  title,
  frame,
}: HtmlAttachToChatProps) {
  const attach = useAttachRenderedArtifact(conversationId);
  const [busy, setBusy] = useState(false);
  const record = renderedRecordFor(canvasItemId, pageUrl);
  if (!record || !conversationId) return null;

  const attachAs = async (representation: RenderedArtifactRepresentation) => {
    setBusy(representation === "screenshot");
    try {
      await attach({
        source: {
          kind: "rendered_artifact",
          record_type: record.recordType,
          record_id: record.recordId,
          title,
        },
        representation,
        capture: async () => {
          const result = await captureRecordOnServer({
            ...record,
            width: frame()?.clientWidth || 1024,
            colorScheme: viewerColorScheme(),
          });
          return {
            kind: "stored",
            fileId: result.fileId,
            width: result.width,
            height: result.height,
          };
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const copyAsImage = async () => {
    try {
      const png = await frameCapture(record, frame)();
      const ok = await copyImage(png);
      if (ok) toast.success("Image copied");
      else toast.error("Couldn't copy the image");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't capture the page");
    }
  };

  return (
    <>
      <Button
        variant="quiet"
        icon={<Camera />}
        onClick={() => void attachAs("screenshot")}
        disabled={busy}
        title="Attach screenshot to chat"
        aria-label="Attach screenshot to chat"
        data-html-attach-screenshot=""
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="quiet"
            icon={<Paperclip />}
            title="Attach to chat"
            aria-label="Attach to chat"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {availableRenderedArtifactRepresentations().map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => void attachAs(option.value)}
              data-html-attach-as={option.value}
            >
              {`Attach ${option.label.toLowerCase()}`}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void copyAsImage()}>
            Copy image
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
