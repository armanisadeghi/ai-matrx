"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import type { ModulePage } from "@/components/matrx/navigation/types";

interface PageSpecificHeaderProps {
  children: React.ReactNode;
}

export function PageSpecificHeader({ children }: PageSpecificHeaderProps) {
  const [mounted, setMounted] = useState(false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    // SSR shell header center takes priority, then authenticated layout header
    const element =
      document.getElementById("shell-header-center") ||
      document.getElementById("page-specific-header-content");
    setTargetElement(element);
  }, []);

  if (!mounted || !targetElement) {
    return null;
  }

  // Wrap with shell-header-inject when portaling into SSR shell for proper styling
  if (targetElement.id === "shell-header-center") {
    return createPortal(
      <div className="shell-header-inject">{children}</div>,
      targetElement,
    );
  }

  return createPortal(children, targetElement);
}

export function CockpitHeader(props: any) {
  const pathname = usePathname();
  const [PlaygroundHeaderAllInOne, setPlaygroundHeaderAllInOne] =
    useState<any>(null);

  if (!pathname?.includes("/ai/cockpit") || !PlaygroundHeaderAllInOne) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <PlaygroundHeaderAllInOne {...props} />
    </PageSpecificHeader>
  );
}

interface PromptHeaderProps {
  promptId?: string;
  promptName: string;
  onPromptNameChange: (value: string) => void;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onOpenFullScreenEditor?: () => void;
  onOpenSettings?: () => void;
  developerMessage: string;
  onDeveloperMessageChange: (value: string) => void;
  fullPromptObject?: any;
  onAcceptFullPrompt?: (optimizedObject: any) => void;
  onAcceptAsCopy?: (optimizedObject: any) => void;
  // Mobile tab support
  mobileActiveTab?: "edit" | "test";
  onMobileTabChange?: (tab: "edit" | "test") => void;
}

export function PromptHeader(props: PromptHeaderProps) {
  const pathname = usePathname();
  const [PromptBuilderHeaderCompact, setPromptBuilderHeaderCompact] =
    useState<any>(null);

  const isPromptRoute =
    pathname?.includes("/ai/prompts") || pathname?.includes("/ssr/prompts");

  useEffect(() => {
    if (!isPromptRoute) return;
    import("@/features/prompts/components/layouts/PromptBuilderHeaderCompact").then(
      (module) => {
        setPromptBuilderHeaderCompact(() => module.PromptBuilderHeaderCompact);
      },
    );
  }, [isPromptRoute]);

  if (!isPromptRoute || !PromptBuilderHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <PromptBuilderHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

interface ChatHeaderProps {
  baseRoute?: string;
}

export function ChatHeader({ baseRoute = "/chat" }: ChatHeaderProps) {
  const pathname = usePathname();
  const [ChatHeaderCompact, setChatHeaderCompact] = useState<any>(null);

  useEffect(() => {
    if (!pathname?.includes("/chat")) return;
    import("@/features/chat/components/header/ChatHeaderCompact").then(
      (module) => {
        setChatHeaderCompact(() => module.ChatHeaderCompact);
      },
    );
  }, [pathname]);

  if (!pathname?.includes("/chat") || !ChatHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <ChatHeaderCompact baseRoute={baseRoute} />
    </PageSpecificHeader>
  );
}

interface RecipeViewHeaderProps {
  recipeId: string;
}

export function RecipeViewHeader(props: RecipeViewHeaderProps) {
  const pathname = usePathname();
  const [RecipeViewHeaderCompact, setRecipeViewHeaderCompact] =
    useState<any>(null);

  const isRecipeView =
    !!pathname?.includes("/ai/recipes/") && !pathname?.includes("/edit");

  useEffect(() => {
    if (!isRecipeView) return;
    import("@/features/recipes/components/RecipeViewHeaderCompact").then(
      (module) => {
        setRecipeViewHeaderCompact(() => module.RecipeViewHeaderCompact);
      },
    );
  }, [isRecipeView]);

  if (!isRecipeView || !RecipeViewHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <RecipeViewHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

interface RecipeEditHeaderProps {
  recipeId: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onSettingsClick: () => void;
  nextVersion: number;
}

export function RecipeEditHeader(props: RecipeEditHeaderProps) {
  const pathname = usePathname();
  const [RecipeEditHeaderCompact, setRecipeEditHeaderCompact] =
    useState<any>(null);

  const isRecipeEdit =
    !!pathname?.includes("/ai/recipes/") && !!pathname?.includes("/edit");

  useEffect(() => {
    if (!isRecipeEdit) return;
    import("@/features/recipes/components/RecipeEditHeaderCompact").then(
      (module) => {
        setRecipeEditHeaderCompact(() => module.RecipeEditHeaderCompact);
      },
    );
  }, [isRecipeEdit]);

  if (!isRecipeEdit || !RecipeEditHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <RecipeEditHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

interface NotesHeaderProps {
  onCreateNote: () => void;
  onCreateFolder: () => void;
  sortConfig: { field: string; order: "asc" | "desc" };
  onSortChange: (field: string, order: "asc" | "desc") => void;
}

export function NotesHeader(props: NotesHeaderProps) {
  const pathname = usePathname();
  const [NotesHeaderCompact, setNotesHeaderCompact] = useState<any>(null);

  useEffect(() => {
    if (!pathname?.includes("/notes")) return;
    import("@/features/notes/components/NotesHeaderCompact").then((module) => {
      setNotesHeaderCompact(() => module.NotesHeaderCompact);
    });
  }, [pathname]);

  if (!pathname?.includes("/notes") || !NotesHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <NotesHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

interface TranscriptsHeaderProps {
  onCreateNew: () => void;
  onDeleteTranscript: () => void;
  className?: string;
}

export function TranscriptsHeaderPortal(props: TranscriptsHeaderProps) {
  const pathname = usePathname();
  const [TranscriptsHeader, setTranscriptsHeader] = useState<any>(null);

  useEffect(() => {
    // Match the canonical processor workspace only — `/transcripts` exact,
    // NOT the sub-routes `/transcripts/studio` or `/transcripts/scribe`
    // which have their own headers.
    if (pathname !== "/transcripts") return;
    import("@/features/transcripts/components/TranscriptsHeader").then(
      (module) => {
        setTranscriptsHeader(() => module.TranscriptsHeader);
      },
    );
  }, [pathname]);

  if (pathname !== "/transcripts" || !TranscriptsHeader) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <TranscriptsHeader {...props} />
    </PageSpecificHeader>
  );
}

interface AppletHeaderProps {
  appId?: string;
  isDemo?: boolean;
  isDebug?: boolean;
  activeAppletSlug?: string;
  isCreator?: boolean;
  isAdmin?: boolean;
  isPreview?: boolean;
}

export function AppletHeader(props: AppletHeaderProps) {
  const pathname = usePathname();
  const [AppletHeaderCompact, setAppletHeaderCompact] = useState<any>(null);

  useEffect(() => {
    if (!pathname?.includes("/apps/custom/")) return;
    // Applet header component not yet implemented
  }, [pathname]);

  if (!pathname?.includes("/apps/custom/") || !AppletHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <AppletHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

/** Props for MessagesHeader component */
interface MessagesHeaderProps {
  title?: string;
  showBack?: boolean;
  backHref?: string;
  onBack?: () => void;
  /** URL for the avatar image */
  avatarUrl?: string | null;
  /** Whether the other user is online */
  isOnline?: boolean;
}

export function MessagesHeader(props: MessagesHeaderProps) {
  const pathname = usePathname();
  const [MessagesHeaderCompact, setMessagesHeaderCompact] = useState<any>(null);

  useEffect(() => {
    if (!pathname?.includes("/messages")) return;
    import("@/features/messaging/components/MessagesHeaderCompact").then(
      (module) => {
        setMessagesHeaderCompact(() => module.MessagesHeaderCompact);
      },
    );
  }, [pathname]);

  if (!pathname?.includes("/messages") || !MessagesHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <MessagesHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

interface PromptAppHeaderProps {
  mode: "view" | "edit" | "run";
  onModeChange: (mode: "view" | "edit" | "run") => void;
  isSaving?: boolean;
  onAIEdit?: () => void;
}

export function PromptAppHeader(props: PromptAppHeaderProps) {
  const [PromptAppHeaderCompact, setPromptAppHeaderCompact] =
    useState<any>(null);

  useEffect(() => {
    import("@/features/prompt-apps/components/PromptAppHeaderCompact").then(
      (module) => {
        setPromptAppHeaderCompact(() => module.PromptAppHeaderCompact);
      },
    );
  }, []);

  if (!PromptAppHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <PromptAppHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

interface ModuleHeaderProps {
  pages: ModulePage[];
  currentPath: string;
  moduleHome: string;
  moduleName?: string;
  className?: string;
}

export function ModuleHeader(props: ModuleHeaderProps) {
  // Dynamically import the component to avoid SSR issues
  const [ResponsiveModuleHeaderContent, setResponsiveModuleHeaderContent] =
    useState<any>(null);

  useEffect(() => {
    import("@/components/matrx/navigation/ResponsiveModuleHeaderContent").then(
      (module) => {
        setResponsiveModuleHeaderContent(() => module.default);
      },
    );
  }, []);

  if (!ResponsiveModuleHeaderContent) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <ResponsiveModuleHeaderContent {...props} />
    </PageSpecificHeader>
  );
}
