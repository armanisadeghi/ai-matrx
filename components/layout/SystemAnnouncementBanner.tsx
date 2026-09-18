"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, Info, Megaphone, X } from "lucide-react";
import type {
  AnnouncementType,
  SystemAnnouncement,
} from "@/types/feedback.types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { Button } from "@/components/ui/button";
import { useOpenAnnouncementsViewer } from "@/features/overlays/openers/announcements";
import { cn } from "@/lib/utils";

interface SystemAnnouncementBannerProps {
  announcement: SystemAnnouncement;
  /** Admin-only preview: do not persist a dismissal for the current viewer. */
  preview?: boolean;
  onDismiss?: () => void;
}

const TYPE_PRESENTATION: Record<
  AnnouncementType,
  {
    icon: typeof Info;
    iconClass: string;
    iconBackground: string;
    actionLabel: string;
  }
> = {
  info: {
    icon: Info,
    iconClass: "text-info",
    iconBackground: "bg-info/10",
    actionLabel: "View details",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-warning",
    iconBackground: "bg-warning/10",
    actionLabel: "Review notice",
  },
  critical: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    iconBackground: "bg-destructive/10",
    actionLabel: "Review now",
  },
  update: {
    icon: Megaphone,
    iconClass: "text-primary",
    iconBackground: "bg-primary/10",
    actionLabel: "See what’s new",
  },
};

/**
 * The user-facing delivery surface for a system announcement.
 *
 * Eligibility and persistence stay with the existing announcement system;
 * this component only owns the compact banner interaction. The detail view is
 * opened through the canonical overlay controller, so the banner never grows
 * a second modal stack of its own.
 */
export default function SystemAnnouncementBanner({
  announcement,
  preview = false,
  onDismiss,
}: SystemAnnouncementBannerProps) {
  const dispatch = useAppDispatch();
  const openAnnouncements = useOpenAnnouncementsViewer();
  const viewedAnnouncements = useAppSelector(
    (state) => state.userPreferences.system.viewedAnnouncements,
  );
  const [isVisible, setIsVisible] = useState(true);
  const presentation = TYPE_PRESENTATION[announcement.announcement_type];
  const Icon = presentation.icon;

  const rememberAsViewed = () => {
    if (viewedAnnouncements.includes(announcement.id)) return;
    dispatch(
      setModulePreferences({
        module: "system",
        preferences: {
          viewedAnnouncements: [...viewedAnnouncements, announcement.id],
        },
      }),
    );
  };

  const dismiss = () => {
    setIsVisible(false);
    if (!preview) rememberAsViewed();
    onDismiss?.();
  };

  const openDetail = () => {
    openAnnouncements({ initialAnnouncementId: announcement.id });
    dismiss();
  };

  if (!isVisible || (!preview && viewedAnnouncements.includes(announcement.id)))
    return null;

  return (
    <aside
      aria-label="System announcement"
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-0 z-50 mx-auto w-auto max-w-3xl animate-in fade-in slide-in-from-bottom-3 pb-safe duration-300 sm:inset-x-6"
    >
      <div className="relative overflow-hidden rounded-3xl border border-glass-edge bg-glass shadow-glass-lg backdrop-blur-glass backdrop-saturate-glass">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="relative flex flex-col gap-4 p-4 pr-12 sm:flex-row sm:items-center sm:gap-5 sm:p-5 sm:pr-14">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/80 shadow-sm sm:h-14 sm:w-14",
              presentation.iconBackground,
            )}
          >
            <Icon
              className={cn("h-6 w-6", presentation.iconClass)}
              aria-hidden
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tracking-tight text-foreground">
              {announcement.title}
            </p>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
              {announcement.message}
            </p>
          </div>

          <Button
            type="button"
            onClick={openDetail}
            className="h-10 shrink-0 rounded-full bg-foreground px-5 text-background hover:bg-foreground/90"
          >
            {presentation.actionLabel}
          </Button>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground sm:right-4 sm:top-4"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
