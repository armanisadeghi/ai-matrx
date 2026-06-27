import { useCallback, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MatrxRecordId } from "@/types/records";
import { ChatMode } from "@/types/chat/chat.types";

interface UseConversationRoutingProps {
    initialModelId?: string;
    initialMode?: ChatMode;
}

const DEFAULT_MODEL_ID = "49848d52-9cc8-4ce4-bacb-32aa2201cd10";
const DEFAULT_MODE = "general" as ChatMode;

export const useConversationRouting = ({ 
    initialModelId = DEFAULT_MODEL_ID, 
    initialMode = DEFAULT_MODE,
}: UseConversationRoutingProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    const paramsModelId = (searchParams.get("model") as string) || initialModelId;
    const paramsMode = (searchParams.get("mode") as ChatMode) || initialMode;
    
    const [currentModelId, setCurrentModelId] = useState<string>(paramsModelId);
    const [currentMode, setCurrentMode] = useState<ChatMode | undefined>(paramsMode);
    
    // Sync from URL params only if they differ from current state (e.g., browser back/forward)
    useEffect(() => {
        if (paramsMode && paramsMode !== currentMode) {
            setCurrentMode(paramsMode);
        }
    }, [paramsMode, currentMode]);
    
    useEffect(() => {
        if (paramsModelId && paramsModelId !== currentModelId) {
            setCurrentModelId(paramsModelId);
        }
    }, [paramsModelId, currentModelId]);
    
    // Function to update search params
    const createQueryString = useCallback(
        (updates: Record<string, string | undefined>) => {
            const params = new URLSearchParams(searchParams.toString());
            Object.entries(updates).forEach(([name, value]) => {
                if (value) {
                    params.set(name, value);
                } else {
                    params.delete(name);
                }
            });
            return params.toString();
        },
        [searchParams]
    );
    
    // Update URL when model or mode changes without navigation
    useEffect(() => {
        // Construct query string inline to avoid dependency on createQueryString
        const params = new URLSearchParams();
        if (currentModelId) {
            params.set('model', currentModelId);
        }
        if (currentMode) {
            params.set('mode', currentMode);
        }
        const queryString = params.toString();
        const currentQueryString = searchParams.toString();
        
        // Only update URL if it actually changed
        if (queryString !== currentQueryString) {
            router.replace(`${pathname}?${queryString}`, { scroll: false });
        }
    }, [currentModelId, currentMode, pathname, router, searchParams]);
    
    // Navigate to a specific conversation while maintaining parameters
    const navigateToConversation = useCallback(
        (conversationId: string, overrides?: { model?: MatrxRecordId; mode?: ChatMode }) => {
            // Get current or overridden values
            const nextModel = overrides?.model || currentModelId;
            const nextMode = overrides?.mode || currentMode;
            
            // Create query string with current or overridden params
            const queryString = createQueryString({
                model: nextModel,
                mode: nextMode,
            });
            
            // Navigate to the new conversation
            router.push(`/chat/${conversationId}?${queryString}`);
        },
        [router, createQueryString, currentModelId, currentMode]
    );
    
    return {
        currentModelId,
        currentMode,
        setCurrentModelId,
        setCurrentMode,
        navigateToConversation,
    };
};

export type ConversationRoutingResult = ReturnType<typeof useConversationRouting>;
export default useConversationRouting;