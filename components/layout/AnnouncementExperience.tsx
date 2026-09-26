"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Info,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { getActiveAnnouncements } from "@/actions/feedback.actions";
import { renderAnnouncementMessage } from "@/utils/render-announcement-message";
import type {
  AnnouncementType,
  SystemAnnouncement,
} from "@/types/feedback.types";
import { cn } from "@/lib/utils";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const TYPE_CONFIG: Record<
  AnnouncementType,
  { icon: LucideIcon; label: string; iconClass: string; iconBackground: string }
> = {
  info: {
    icon: Info,
    label: "Information",
    iconClass: "text-info",
    iconBackground: "bg-info/10",
  },
  warning: {
    icon: AlertTriangle,
    label: "Important notice",
    iconClass: "text-warning",
    iconBackground: "bg-warning/10",
  },
  critical: {
    icon: AlertCircle,
    label: "Action required",
    iconClass: "text-destructive",
    iconBackground: "bg-destructive/10",
  },
  update: {
    icon: Megaphone,
    label: "Product update",
    iconClass: "text-primary",
    iconBackground: "bg-primary/10",
  },
};

interface AnnouncementExperienceProps {
  isOpen: boolean;
  onClose: () => void;
  initialAnnouncementId?: string;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function Detail({
  announcement,
  onBack,
}: {
  announcement: SystemAnnouncement;
  onBack?: () => void;
}) {
  const config = TYPE_CONFIG[announcement.announcement_type];
  const Icon = config.icon;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative shrink-0 overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/20 via-background to-accent/20 px-6 pb-6 pt-5 sm:px-10 sm:pb-10 sm:pt-9">
        <div className="pointer-events-none absolute -left-12 -top-16 h-44 w-44 rounded-full bg-warning/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="relative -ml-2 mb-5 rounded-full"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All announcements
          </Button>
        ) : null}
        <div className="relative mx-auto flex max-w-xl flex-col items-center text-center">
          <div className="mb-4 flex items-center gap-3 sm:mb-6 sm:gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-background/90 shadow-sm sm:h-20 sm:w-20">
              <Image
                src="/matrx/matrx-icon.svg"
                alt="AI Matrx"
                width={48}
                height={48}
                className="h-9 w-9 sm:h-12 sm:w-12"
              />
            </div>
            <div
              className="flex items-center gap-1.5 text-muted-foreground/60"
              aria-hidden
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              <span className="h-2 w-2 rounded-full bg-current" />
              <span className="h-2 w-2 rounded-full bg-current" />
            </div>
            <div
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-background/90 shadow-sm sm:h-20 sm:w-20",
                config.iconBackground,
              )}
            >
              <Icon
                className={cn("h-7 w-7 sm:h-10 sm:w-10", config.iconClass)}
              />
            </div>
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {config.label}
          </p>
          <h2 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {announcement.title}
          </h2>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {formatDate(announcement.created_at)}
          </div>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 overscroll-contain">
        <div className="mx-auto max-w-2xl px-6 py-7 sm:px-10 sm:py-9">
          <div className="whitespace-pre-wrap text-base leading-7 text-foreground/90">
            {renderAnnouncementMessage(announcement.message)}
          </div>
          <div className="mt-8 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Other active updates are available from the user menu under
            Announcements.
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function Inbox({
  announcements,
  onSelect,
}: {
  announcements: SystemAnnouncement[];
  onSelect: (announcement: SystemAnnouncement) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/70 px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight">Announcements</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Product updates and important notices from AI Matrx.
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1 overscroll-contain">
        <div className="space-y-2 p-3 sm:p-4">
          {announcements.map((announcement) => {
            const config = TYPE_CONFIG[announcement.announcement_type];
            const Icon = config.icon;
            return (
              <button
                type="button"
                key={announcement.id}
                onClick={() => onSelect(announcement)}
                className="group flex w-full items-start gap-3 rounded-2xl border border-transparent p-3 text-left transition-colors hover:border-border hover:bg-muted/60 sm:p-4"
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    config.iconBackground,
                  )}
                >
                  <Icon
                    className={cn("h-5 w-5", config.iconClass)}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {announcement.title}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm leading-5 text-muted-foreground">
                    {announcement.message}
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground/80">
                    {formatDate(announcement.created_at)}
                  </span>
                </span>
                <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function AnnouncementExperience({
  isOpen,
  onClose,
  initialAnnouncementId,
}: AnnouncementExperienceProps) {
  const isMobile = useIsMobile();
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAnnouncementId ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getActiveAnnouncements()
      .then((result) => {
        if (cancelled) return;
        if (result.success) setAnnouncements(result.data ?? []);
        else
          setError(result.error ?? "Announcements are unavailable right now.");
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Announcements are unavailable right now.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const selected = selectedId
    ? (announcements.find((row) => row.id === selectedId) ?? null)
    : null;
  const content = loading ? (
    <div className="flex min-h-72 flex-1 items-center justify-center p-8">
      <div
        className="w-full max-w-sm space-y-4"
        aria-label="Loading announcements"
      >
        <div className="mx-auto h-20 w-20 animate-pulse rounded-2xl bg-muted" />
        <div className="mx-auto h-7 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mx-auto h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="mt-8 h-24 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  ) : error ? (
    <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </span>
      <div>
        <p className="font-semibold">Announcements could not be loaded <ErrorAlchemyMenu /></p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
      </div>
    </div>
  ) : announcements.length === 0 ? (
    <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Megaphone className="h-7 w-7 text-muted-foreground" />
      </span>
      <div>
        <p className="font-semibold">You’re all caught up</p>
        <p className="mt-1 text-sm text-muted-foreground">
          New product updates and notices will appear here.
        </p>
      </div>
    </div>
  ) : selected ? (
    <Detail
      announcement={selected}
      onBack={announcements.length > 1 ? () => setSelectedId(null) : undefined}
    />
  ) : (
    <Inbox
      announcements={announcements}
      onSelect={(announcement) => setSelectedId(announcement.id)}
    />
  );

  if (isMobile)
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="flex h-[85dvh] flex-col overflow-hidden p-0 pb-safe">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Announcements</DrawerTitle>
            <DrawerDescription>
              Product updates and important notices.
            </DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(760px,88dvh)] max-w-3xl flex-col gap-0 overflow-hidden rounded-[28px] p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Announcements</DialogTitle>
          <DialogDescription>
            Product updates and important notices.
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export default AnnouncementExperience;
