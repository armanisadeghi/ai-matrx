"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@ai-matrx/design-system";
import {
  Play,
  Pencil,
  X,
  Eye,
  Copy,
  Share2,
  Trash2,
  Loader2,
  AppWindow,
  LucideIcon,
} from "lucide-react";

interface PrimaryActionButtonProps {
  icon: LucideIcon;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  gradientFrom: string;
  gradientTo: string;
  iconBgColor: string;
  iconTextColor: string;
}

function PrimaryActionButton({
  icon: Icon,
  title,
  onClick,
  disabled = false,
  gradientFrom,
  gradientTo,
  iconBgColor,
  iconTextColor,
}: PrimaryActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full group relative overflow-hidden rounded-lg border-2 border-border transition-all duration-300 ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:border-primary/50 hover:shadow-xl hover:scale-[1.02]"
      }`}
    >
      <div
        className={`absolute inset-0 bg-gradient-to-r ${gradientFrom} ${gradientTo} transition-all duration-300`}
      />
      <div className="relative p-3 sm:p-5 md:p-6 flex flex-col items-center">
        <div
          className={`p-2 ${iconBgColor} rounded-full group-hover:opacity-90 transition-colors duration-300 group-hover:scale-110 transform`}
        >
          <Icon className={`w-5 h-5 sm:w-7 sm:h-7 ${iconTextColor}`} />
        </div>
        <h3 className="text-base sm:text-lg font-bold text-foreground mb-1">
          {title}
        </h3>
      </div>
    </button>
  );
}

interface AgentActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string;
  agentName: string;
  agentDescription?: string;
  onRun: () => void;
  onEdit: () => void;
  onView?: () => void;
  onDuplicate?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onCreateApp?: () => void;
  showView?: boolean;
  showDuplicate?: boolean;
  showShare?: boolean;
  showDelete?: boolean;
  showCreateApp?: boolean;
  isDeleting?: boolean;
  isDuplicating?: boolean;
}

export function AgentActionModal({
  isOpen,
  onClose,
  agentName,
  agentDescription,
  onRun,
  onEdit,
  onView,
  onDuplicate,
  onShare,
  onDelete,
  onCreateApp,
  showView = true,
  showDuplicate = true,
  showShare = true,
  showDelete = true,
  showCreateApp = true,
  isDeleting = false,
  isDuplicating = false,
}: AgentActionModalProps) {
  const handleAction = (
    e: React.MouseEvent,
    actionName: string,
    actionFn: () => void,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    actionFn();
    if (actionName !== "share") {
      onClose();
    }
  };

  const isAnyActionActive = isDeleting || isDuplicating;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] my-2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-bold text-center text-foreground">
            {agentName || "Untitled Agent"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <PrimaryActionButton
            icon={Play}
            title="Run Agent"
            onClick={(e) => handleAction(e, "run", onRun)}
            disabled={isAnyActionActive}
            gradientFrom="from-primary/10 group-hover:from-primary/20"
            gradientTo="to-secondary/10 group-hover:to-secondary/20"
            iconBgColor="bg-primary"
            iconTextColor="text-primary-foreground"
          />

          <PrimaryActionButton
            icon={Pencil}
            title="Edit Agent"
            onClick={(e) => handleAction(e, "edit", onEdit)}
            disabled={isAnyActionActive}
            gradientFrom="from-secondary/10 group-hover:from-secondary/20"
            gradientTo="to-accent/10 group-hover:to-accent/20"
            iconBgColor="bg-secondary"
            iconTextColor="text-secondary-foreground"
          />

          {showCreateApp && onCreateApp && (
            <PrimaryActionButton
              icon={AppWindow}
              title="Create App"
              onClick={(e) => handleAction(e, "create-app", onCreateApp)}
              disabled={isAnyActionActive}
              gradientFrom="from-green-500/10 group-hover:from-green-500/20"
              gradientTo="to-green-500/10 group-hover:to-green-500/20"
              iconBgColor="bg-green-500"
              iconTextColor="text-secondary-foreground"
            />
          )}
        </div>

        {(showView || showDuplicate || showShare || showDelete) && (
          <div className="border-t border-border pt-2 sm:pt-3">
            <div className="grid grid-cols-2 gap-2">
              {showView && onView && (
                <Button
                  variant="outline"
                  onClick={(e) => handleAction(e, "view", onView)}
                  disabled={isAnyActionActive}
                  className="flex items-center justify-start gap-1.5 sm:gap-2 h-auto py-2 px-3 sm:px-4 border-border hover:bg-accent"
                >
                  <Eye className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">View</span>
                </Button>
              )}

              {showDuplicate && onDuplicate && (
                <Button
                  variant="outline"
                  onClick={(e) => handleAction(e, "duplicate", onDuplicate)}
                  disabled={isAnyActionActive}
                  className="flex items-center justify-start gap-1.5 sm:gap-2 h-auto py-2 px-3 sm:px-4 border-border hover:bg-accent relative"
                >
                  {isDuplicating && (
                    <div className="absolute inset-0 bg-muted/50 backdrop-blur-sm flex items-center justify-center rounded-md">
                      <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                    </div>
                  )}
                  <Copy className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">
                    Duplicate
                  </span>
                </Button>
              )}

              {showShare && onShare && (
                <Button
                  variant="outline"
                  onClick={(e) => handleAction(e, "share", onShare)}
                  disabled={isAnyActionActive}
                  className="flex items-center justify-start gap-1.5 sm:gap-2 h-auto py-2 px-3 sm:px-4 border-border hover:bg-accent"
                >
                  <Share2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Share</span>
                </Button>
              )}

              {showDelete && onDelete && (
                <Button
                  variant="outline"
                  onClick={(e) => handleAction(e, "delete", onDelete)}
                  disabled={isAnyActionActive}
                  className="flex items-center justify-start gap-1.5 sm:gap-2 h-auto py-2 px-3 sm:px-4 border-destructive/30 text-destructive hover:bg-destructive/10 relative"
                >
                  {isDeleting && (
                    <div className="absolute inset-0 bg-destructive/20 backdrop-blur-sm flex items-center justify-center rounded-md">
                      <Loader2 className="w-4 h-4 text-destructive animate-spin" />
                    </div>
                  )}
                  <Trash2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Delete</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
