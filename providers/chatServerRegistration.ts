// The app's SERVER-ONLY doors, registered into `@ai-matrx/chat` (packages/chat/src/host/server-deps.ts).
// Imported by app/layout.tsx (a server module); never import this from client code.
import "server-only";
import { registerChatServerDeps } from "@ai-matrx/chat/host/server-deps";
import { createClient } from "@/utils/supabase/server";
import { getAgent } from "@/lib/agents/data";

registerChatServerDeps({ createClient, getAgent });
