"use client";

import { Camera, FileText, Image as ImageIcon, Plus, Video } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/lib/toast";

interface AttachKind {
  key: "image" | "video" | "file" | "camera";
  label: string;
  icon: typeof Camera;
  color: string;
  comingSoon?: boolean;
}

const ITEMS: AttachKind[] = [
  {
    key: "image",
    label: "Photos & videos",
    icon: ImageIcon,
    color: "#0095f6",
  },
  { key: "file", label: "Document", icon: FileText, color: "#7f66ff" },
  { key: "video", label: "Video clip", icon: Video, color: "#e1338c" },
  { key: "camera", label: "Camera", icon: Camera, color: "#06cf9c", comingSoon: true },
];

interface MessageInputAttachMenuProps {
  onPick: (kind: "image" | "video" | "file") => void;
}

export function MessageInputAttachMenu({
  onPick,
}: MessageInputAttachMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Attach"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-6 w-6" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={12}
        className="w-[260px] border-border bg-popover p-1 text-popover-foreground"
      >
        <div className="flex flex-col">
          {ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.comingSoon) {
                  toast.info(`${item.label} — coming soon`);
                  return;
                }
                if (item.key === "camera") return;
                onPick(item.key);
              }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-left text-[14px] hover:bg-accent"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{ backgroundColor: item.color }}
              >
                <item.icon className="h-4 w-4 text-white" strokeWidth={2} />
              </span>
              <span className="flex-1">{item.label}</span>
              {item.comingSoon ? (
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  soon
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
