"use client";

import React, { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TbListSearch } from "react-icons/tb";
import { IoCreateOutline } from "react-icons/io5";
import Link from "next/link";
import dynamic from "next/dynamic";

const ConversationSearchOverlay = dynamic(
  () =>
    import("@/features/chat/components/conversations/ConversationSearchOverlay").then(
      (m) => ({ default: m.ConversationSearchOverlay }),
    ),
  { ssr: false },
);

interface ChatHeaderCompactProps {
  baseRoute?: string;
}

export function ChatHeaderCompact({
  baseRoute = "/chat",
}: ChatHeaderCompactProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const handleOpenSearch = () => {
    setIsSearchOpen(true);
  };

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 h-full bg-textured">
        {/* Mobile - Always dropdown */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={baseRoute} className="flex items-center w-full">
                  <IoCreateOutline className="h-4 w-4 mr-2" />
                  New Chat
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenSearch}>
                <TbListSearch className="h-4 w-4 mr-2" />
                Search Conversations
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Desktop - Inline controls with tight spacing */}
        <div className="hidden md:flex items-center gap-1">
          {/* New Chat Button */}
          <Link href={baseRoute}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-full hover:bg-accent"
              title="New Chat"
            >
              <IoCreateOutline className="h-3.5 w-3.5" />
            </Button>
          </Link>

          {/* Search Button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 rounded-full hover:bg-accent"
            onClick={handleOpenSearch}
            title="Search Conversations"
          >
            <TbListSearch className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Conversation Search Overlay */}
      <ConversationSearchOverlay
        isOpen={isSearchOpen}
        onClose={handleCloseSearch}
      />
    </>
  );
}
