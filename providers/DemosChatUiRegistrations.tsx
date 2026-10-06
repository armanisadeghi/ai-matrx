"use client";

// The demos profile intentionally keeps this graph out of AppShell. Each
// affected demo route layout imports this boundary before its descendants render.
import "@/providers/chatUiRegistration";

export function DemosChatUiRegistrations() {
  return null;
}
