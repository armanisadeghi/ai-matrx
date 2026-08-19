import { MessageTemplateManager } from '@/features/message-templates/admin/MessageTemplateManager';

export default function MessageTemplatesPage() {
    return (
        <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
            <MessageTemplateManager className="flex-1" />
        </div>
    );
}

