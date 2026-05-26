// app/(authenticated)/flash-cards/components/AIChatInterface.tsx

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Flashcard,
  FlashcardData,
  ChatMessage,
} from "@/types/flashcards.types";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { addMessage } from "@/lib/redux/slices/flashcardChatSlice";
import { openai, defaultOpenAiModel } from "@/lib/ai/openAiBrowserClient";

interface AIChatInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  card: FlashcardData;
}

const AIChatInterface: React.FC<AIChatInterfaceProps> = ({
  isOpen,
  onClose,
  card,
}) => {
  const dispatch = useDispatch();
  const chatMessages = useSelector(
    (state: RootState) => state.flashcardChat[card.id]?.chat || [],
  );
  const [chatInput, setChatInput] = useState("");

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const newMessage: ChatMessage = { role: "user", content: chatInput };
    dispatch(addMessage({ flashcardId: card.id, message: newMessage }));
    setChatInput("");

    try {
      const stream = await openai.chat.completions.create({
        model: defaultOpenAiModel,
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant. The current flashcard question is: "${card.front}" and the answer is: "${card.back}". Help the user understand this concept.`,
          },
          ...chatMessages,
          newMessage,
        ],
        stream: true,
      });

      let assistantMessage = "";
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        assistantMessage += content;
        dispatch(
          addMessage({
            flashcardId: card.id,
            message: { role: "assistant", content: assistantMessage },
          }),
        );
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
        >
          <motion.div
            className="w-full max-w-2xl h-[80vh] bg-zinc-900 rounded-lg shadow-xl overflow-hidden"
            layoutId="expandable-card"
          >
            <div className="flex flex-col h-full">
              <div className="flex-grow overflow-auto p-4">
                {chatMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`mb-4 ${msg.role === "user" ? "text-right" : "text-left"}`}
                  >
                    <span
                      className={`inline-block p-2 rounded ${msg.role === "user" ? "bg-blue-600" : "bg-zinc-700"}`}
                    >
                      {msg.content}
                    </span>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-zinc-700">
                <div className="flex">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-grow p-2 rounded-l bg-zinc-800 text-white"
                    placeholder="Ask a question..."
                  />
                  <Button
                    onClick={handleSendMessage}
                    className="rounded-l-none"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
            <Button onClick={onClose} className="absolute top-2 right-2">
              Close
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIChatInterface;
