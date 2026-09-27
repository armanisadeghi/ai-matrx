"use client";

/**
 * Content items on a board: a web page, an image, a write-up (markdown an
 * agent wrote or a stream saved), and a label. Board-only content — the
 * source holds the URL or the text itself.
 */

import { useState } from "react";
import { FileText, Globe, Image as ImageIcon, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import type { NodeSource } from "../board/document";
import { HtmlTileBody, ImageTileBody } from "../tiles/MediaTileBodies";
import { MarkdownTileBody } from "../tiles/MarkdownTileBody";
import { TextTileBody } from "../tiles/NoteTileBody";
import type { BoardItemType, ItemBodyProps, PickerProps } from "./types";
import { parseWebUrl } from "./web-address";

function UrlPicker({
  label,
  placeholder,
  make,
  onPick,
  onCancel,
}: PickerProps & { label: string; placeholder: string; make: (url: URL) => { title: string; source: NodeSource } }) {
  const [value, setValue] = useState("");
  const url = parseWebUrl(value);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (url) onPick([make(url)]);
      }}
    >
      <label className="text-sm font-medium text-foreground" htmlFor="board-url-input">
        {label}
      </label>
      <Input
        id="board-url-input"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="text-base"
      />
      {value.trim() && !url && <p className="text-xs text-destructive">That is not a web address.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!url}>
          Add to board
        </Button>
      </div>
    </form>
  );
}

function WebPagePicker(props: PickerProps) {
  return (
    <UrlPicker
      {...props}
      label="Web address"
      placeholder="example.com/page"
      make={(url) => ({ title: url.hostname, source: { kind: "html", url: url.href } })}
    />
  );
}

function ImagePicker(props: PickerProps) {
  return (
    <UrlPicker
      {...props}
      label="Image address"
      placeholder="example.com/picture.png"
      make={(url) => ({
        title: url.pathname.split("/").pop() || url.hostname,
        source: { kind: "image", url: url.href },
      })}
    />
  );
}

function WebPageBody({ source, title, tier, interacting }: ItemBodyProps) {
  if (source.kind !== "html") return null;
  return <HtmlTileBody src={source.url} srcDoc={source.html} title={title} tier={tier} active={interacting} />;
}

function ImageBody({ source, title }: ItemBodyProps) {
  if (source.kind !== "image" || !source.url) return null;
  return <ImageTileBody src={source.url} alt={title} />;
}

function WriteUpBody({ tileId, source, tier }: ItemBodyProps) {
  if (source.kind !== "text") return null;
  return <MarkdownTileBody id={tileId} text={source.markdown} tier={tier} />;
}

function LabelBody({ source, onSource }: ItemBodyProps) {
  if (source.kind !== "label") return null;
  return <TextTileBody text={source.text} onChange={(text) => onSource({ kind: "label", text })} />;
}

export const CONTENT_ITEMS: BoardItemType[] = [
  {
    key: "web-page",
    label: "Web page",
    icon: Globe,
    group: "media",
    defaultSize: { w: 800, h: 560 },
    matches: (s) => s.kind === "html",
    Body: WebPageBody,
    bringIn: {
      label: "Web page",
      Picker: WebPagePicker,
    },
    href: (s) => (s.kind === "html" && s.url ? s.url : null),
    kindLabel: "web page",
  },
  {
    key: "image",
    label: "Image",
    icon: ImageIcon,
    group: "media",
    defaultSize: { w: 560, h: 400 },
    matches: (s) => s.kind === "image" && !!s.url,
    Body: ImageBody,
    bringIn: {
      label: "Image from a link",
      Picker: ImagePicker,
    },
    href: (s) => (s.kind === "image" && s.url ? s.url : null),
  },
  {
    key: "write-up",
    label: "Write-up",
    icon: FileText,
    group: "content",
    defaultSize: { w: 640, h: 720 },
    matches: (s) => s.kind === "text",
    Body: WriteUpBody,
    kindLabel: "markdown",
  },
  {
    key: "label",
    label: "Label",
    icon: Type,
    group: "content",
    defaultSize: { w: 520, h: 120 },
    matches: (s) => s.kind === "label",
    Body: LabelBody,
    startNew: { label: "Label", create: () => ({ title: "Label", source: { kind: "label", text: "" } }) },
    kindLabel: "text",
  },
];
