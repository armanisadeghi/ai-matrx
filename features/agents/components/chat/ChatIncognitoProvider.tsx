"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
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
  const canUseIncognito = isNewChatRoute(pathname);
  const [isIncognito, setIsIncognito] = useState(false);

  useEffect(() => {
    if (!canUseIncognito) setIsIncognito(false);
  }, [canUseIncognito]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".shell-root");
    if (!root) return;

    if (canUseIncognito && isIncognito) {
      root.dataset.chatIncognito = "true";
    } else {
      delete root.dataset.chatIncognito;
    }

    return () => {
      delete root.dataset.chatIncognito;
    };
  }, [canUseIncognito, isIncognito]);

  const toggleIncognito = useCallback(() => {
    setIsIncognito((value) => !value);
  }, []);

  const value = useMemo(
    () => ({ isIncognito, toggleIncognito, canUseIncognito }),
    [isIncognito, toggleIncognito, canUseIncognito],
  );

  return (
    <ChatIncognitoContext.Provider value={value}>
      {children}
    </ChatIncognitoContext.Provider>
  );
}
