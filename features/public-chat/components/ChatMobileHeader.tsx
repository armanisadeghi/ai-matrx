"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { setMode } from "@/styles/themes/themeSlice";
import {
  PanelLeft,
  SquarePen,
  ChevronDown,
  Menu,
  Compass,
  Sun,
  Moon,
  LogIn,
  LayoutDashboard,
  Bug,
  Blocks,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { selectUser, selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import type { AgentConfig } from "../context/DEPRECATED-ChatContext";
import { useChatContext } from "../context/DEPRECATED-ChatContext";

const AdminMenu = lazy(() => import("@/components/matrx/AdminMenu"));
const FeedbackButton = lazy(() => import("@/features/feedback/FeedbackButton"));

// ============================================================================
// TYPES
// ============================================================================

interface ChatMobileHeaderProps {
  onToggleSidebar: () => void;
  onNewChat: () => void;
  selectedAgent?: AgentConfig | null;
  onOpenAgentPicker: () => void;
  /** When true, header left group hides to avoid overlapping the open sidebar */
  isSidebarOpen?: boolean;
}

// ============================================================================
// CHAT HEADER (all viewports)
// Transparent floating header — no background, icons overlay content.
// Replaces PublicHeader entirely on the chat route.
// Layout: [sidebar] [new chat] [agent name ▼] --- [admin] [feedback] [discover] [menu] [logo]
// ============================================================================

export function ChatMobileHeader({
  onToggleSidebar,
  onNewChat,
  selectedAgent,
  onOpenAgentPicker,
  isSidebarOpen = false,
}: ChatMobileHeaderProps) {
  const router = useRouter();
  const theme = useAppSelector((s) => s.theme.mode);
  const dispatch = useAppDispatch();
  const setTheme = (t: "light" | "dark") => dispatch(setMode(t));
  const user = useSelector(selectUser);
  const isAdmin = useSelector(selectIsSuperAdmin);
  const isAuthenticated = !!user?.id;
  const [mounted, setMounted] = useState(false);
  const { state, setUseLocalhost, setUseBlockMode } = useChatContext();

  useEffect(() => {
    setMounted(true);
  }, []);

  const agentName = selectedAgent?.name || "General Chat";

  return (
    <header className="absolute top-0 left-0 right-0 z-50 flex items-center h-10 px-1.5 pointer-events-none">
      {/* Left group: sidebar toggle, new chat, agent selector
                Hidden when sidebar is open (sidebar's own header has these same controls) */}
      <div
        className={`flex items-center gap-0.5 min-w-0 flex-1 pointer-events-auto transition-opacity duration-200 ${
          isSidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors flex-shrink-0"
          title="Open sidebar"
        >
          <PanelLeft className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={onNewChat}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors flex-shrink-0"
          title="New chat"
        >
          <SquarePen className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={onOpenAgentPicker}
          className="flex items-center gap-1 min-w-0 px-1.5 py-1 rounded-md hover:bg-accent/50 transition-colors"
          title={`Switch agent: ${agentName}`}
        >
          <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
            {agentName}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        </button>
      </div>

      {/* Right group: admin, feedback, discover, hamburger menu, logo */}
      <div className="flex items-center gap-1 pointer-events-auto">
        {/* Admin-only toggles: localhost + block mode */}
        {isAdmin && mounted && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setUseLocalhost(!state.useLocalhost)}
              title={
                state.useLocalhost
                  ? "Using localhost — click to switch to production"
                  : "Using production — click to switch to localhost"
              }
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                state.useLocalhost
                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40"
                  : "text-muted-foreground/50 hover:text-muted-foreground border border-transparent hover:border-border"
              }`}
            >
              local
            </button>
            <button
              onClick={() => setUseBlockMode(!state.isBlockMode)}
              title={
                state.isBlockMode
                  ? "Block mode ON — using agents-blocks endpoint. Click to disable."
                  : "Block mode OFF — using standard agents endpoint. Click to enable."
              }
              className={`p-1.5 rounded-md transition-colors ${
                state.isBlockMode
                  ? "text-violet-600 dark:text-violet-400 bg-violet-500/15 border border-violet-500/30"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50 border border-transparent"
              }`}
            >
              <Blocks className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Admin Menu — admin-only server environment toggle */}
        {isAdmin && mounted && (
          <Suspense fallback={null}>
            <AdminMenu />
          </Suspense>
        )}

        {/* Feedback button — authenticated only */}
        {isAuthenticated && mounted && (
          <Suspense
            fallback={
              <span
                className="flex h-11 w-11 items-center justify-center opacity-30"
                aria-hidden="true"
              >
                <Bug className="h-4 w-4" />
              </span>
            }
          >
            <FeedbackButton variant="transparent" />
          </Suspense>
        )}

        {/* Discover link — desktop only */}
        <Link
          href="/canvas/discover"
          className="hidden md:flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <Compass className="h-3.5 w-3.5" />
          Discover
        </Link>

        {/* Hamburger menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors flex-shrink-0">
              <Menu className="h-[18px] w-[18px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="w-44">
            {/* Discover — visible in menu on mobile only */}
            <DropdownMenuItem asChild className="md:hidden">
              <Link href="/canvas/discover" className="flex items-center gap-2">
                <Compass className="h-4 w-4" />
                Discover
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="md:hidden" />

            {/* Theme toggle */}
            {mounted && (
              <DropdownMenuItem
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex items-center gap-2"
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="h-4 w-4" />
                    Light Mode
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4" />
                    Dark Mode
                  </>
                )}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* Auth */}
            {isAuthenticated ? (
              <DropdownMenuItem
                onClick={() => router.push("/dashboard")}
                className="flex items-center gap-2"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => router.push("/login")}
                className="flex items-center gap-2"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Logo — rightmost element */}
        <Link
          href="/"
          className="p-2 rounded-md transition-opacity hover:opacity-70 flex-shrink-0"
          title="AI Matrx Home"
        >
          <Image
            src="/matrx/matrx-icon.svg"
            width={16}
            height={16}
            alt="AI Matrx"
            className="flex-shrink-0"
          />
        </Link>
      </div>
    </header>
  );
}

export default ChatMobileHeader;
