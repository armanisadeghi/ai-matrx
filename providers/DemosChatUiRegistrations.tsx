"use client";

// The demos profile intentionally keeps this graph out of AppShell. Chat
// routes import this client boundary before their descendants render.
import "@/providers/chatUiRegistration";

export function DemosChatUiRegistrations() {
  return null;
}
