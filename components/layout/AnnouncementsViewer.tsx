"use client";

import React, { useEffect, useState } from "react";
import {
  Info,
  AlertTriangle,
  AlertCircle,
  Megaphone,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { getActiveAnnouncements } from "@/actions/feedback.actions";
import { renderAnnouncementMessage } from "@/utils/render-announcement-message";
import type {
  SystemAnnouncement,
  AnnouncementType,
} from "@/types/feedback.types";

const typeConfig: Record<
  AnnouncementType,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  info: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    label: "Info",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    label: "Warning",
  },
  critical: {
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    label: "Critical",
  },
  update: {
    icon: Megaphone,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    label: "Update",
  },
};

interface AnnouncementsViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AnnouncementsViewer({
  isOpen,
  onClose,
}: AnnouncementsViewerProps) {
  const isMobile = useIsMobile();
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    getActiveAnnouncements().then((result) => {
      if (result.success && result.data) {
        setAnnouncements(result.data);
      }
      setLoading(false);
    });
  }, [isOpen]);

  const content = (
    <ScrollArea className="flex-1">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Megaphone className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No active announcements</p>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {announcements.map((a) => {
            const cfg = typeConfig[a.announcement_type];
            const Icon = cfg.icon as React.FC<{ className?: string }>;
            return (
              <div
                key={a.id}
                className="rounded-lg border bg-card p-4 space-y-2"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${cfg.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold truncate">
                        {a.title}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0"
                      >
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {renderAnnouncementMessage(a.message)}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-2">
                      {new Date(a.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ScrollArea>
  );

  if (isMobile) {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Announcements
            </DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[70dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Megaphone className="h-4 w-4" />
            Announcements
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export default AnnouncementsViewer;
