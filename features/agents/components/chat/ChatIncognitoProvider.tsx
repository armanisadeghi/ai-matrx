"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectChatIncognitoActive,
  setChatIncognitoActive,
  toggleChatIncognito,
} from "./chat-incognito.slice";
import { isNewChatRoute } from "./chat-incognito.routes";

interface ChatIncognitoContextValue {
  isIncognito: boolean;
  toggleIncognito: () => void;
  canUseIncognito: boolean;
}

const ChatIncognitoContext = createContext<ChatIncognitoContextValue | null>(
  null,
);

export function useChatIncognito(): ChatIncognitoContextValue {
  const ctx = useContext(ChatIncognitoContext);
  if (!ctx) {
    throw new Error(
      "useChatIncognito must be used within ChatIncognitoProvider",
    );
  }
  return ctx;
}

export function ChatIncognitoProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const canUseIncognito = isNewChatRoute(pathname);
  const isIncognito = useAppSelector(selectChatIncognitoActive);

  useEffect(() => {
    if (!canUseIncognito) dispatch(setChatIncognitoActive(false));
  }, [canUseIncognito, dispatch]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".shell-root");
    if (!root) return undefined;

    if (canUseIncognito && isIncognito) {
      root.dataset.chatIncognito = "true";
    } else {
      delete root.dataset.chatIncognito;
    }

    return () => {
      delete root.dataset.chatIncognito;
    };
  }, [canUseIncognito, isIncognito]);

  const toggleIncognitoMode = () => {
    dispatch(toggleChatIncognito());
  };

  const value = {
    isIncognito: canUseIncognito && isIncognito,
    toggleIncognito: toggleIncognitoMode,
    canUseIncognito,
  };

  return (
    <ChatIncognitoContext.Provider value={value}>
      {children}
    </ChatIncognitoContext.Provider>
  );
}
