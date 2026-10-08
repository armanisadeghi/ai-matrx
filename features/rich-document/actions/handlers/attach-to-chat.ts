// features/rich-document/actions/handlers/attach-to-chat.ts
//
// "Attach to chat" for a saved artifact shown as a RichDocument (source type
// "artifact") — the same attachArtifactToChat the canvas pane and every
// message block use (rendered-output P2 WP4). It attaches the artifact's
// content by reference to the chat the person is looking at; never user_input.

import { Paperclip } from "lucide-react";
import { registerAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { attachArtifactToChat } from "@/features/canvas/output/artifactAttach";
import { focusedChatConversationId } from "@/features/canvas/output/attachOptions";
import { getStore } from "@/lib/redux/store-singleton";
import { toast } from "@/lib/toast";

registerAction({
  id: "attach-artifact-to-chat",
  label: "Attach to chat",
  icon: Paperclip,
  category: "share",
  supportedSources: ["artifact"],
  renderSlot: "overflow",
  order: 40,
  requiresAuth: true,
  run: async (ctx) => {
    if (ctx.source.type !== "artifact") return;
    const store = getStore();
    if (!store) return;
    const conversationId = focusedChatConversationId(
      store.getState() as unknown as Parameters<typeof focusedChatConversationId>[0],
    );
    if (!conversationId) {
      toast.error("There is no chat to attach to. Open a chat first.");
      return;
    }
    const type = typeof ctx.metadata?.type === "string" ? ctx.metadata.type : "kind_value";
    const title = typeof ctx.metadata?.title === "string" ? ctx.metadata.title : "Artifact";
    await attachArtifactToChat({
      store,
      conversationId,
      type,
      title,
      data: ctx.content,
      canvasItemId: ctx.source.artifactId,
      blockKey: `artifact_${ctx.source.artifactId}`,
      representation: "code",
      element: () => null,
    });
  },
});
