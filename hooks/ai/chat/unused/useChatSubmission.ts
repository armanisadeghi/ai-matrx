import { useState } from 'react';
import { MatrxRecordId } from '@/types/records';

interface UseChatSubmissionProps {
  clearLastPrompt: () => Promise<void>;
  onSubmitSuccess?: () => void;
  onSubmitError?: (error: any) => void;
}

export function useChatSubmission({ 
  clearLastPrompt, 
  onSubmitSuccess, 
  onSubmitError 
}: UseChatSubmissionProps) {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isNewChat, setIsNewChat] = useState<boolean>(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const handleMessageSubmit = async (
    message: string, 
    sendMessageFn: (message: string) => void | Promise<any>,
    modelKey?: MatrxRecordId
  ): Promise<boolean> => {
    if (!message || message.trim() === "" || isSubmitting) {
      return false;
    }

    setIsSubmitting(true);

    try {
      // Call the API function
      await sendMessageFn(message);
      
      // If successful, clear the stored prompt
      await clearLastPrompt();
      
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
      
      return true;
    } catch (error) {
      console.error("Error submitting message:", error);
      
      if (onSubmitError) {
        onSubmitError(error);
      }
      
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    handleMessageSubmit
  };
}