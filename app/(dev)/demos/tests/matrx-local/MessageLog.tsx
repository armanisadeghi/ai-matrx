import React from "react";

interface MessageLogProps {
    messages: Array<{
        type: string;
        message: string;
        timestamp: string;
    }>;
}



// =====================
// Message Log Component
// =====================
const MessageLog = ({messages}: MessageLogProps) => (
    <div className="bg-muted rounded-lg p-4 h-64 overflow-auto">
        {messages.map((msg, index) => (
            <div
                key={index}
                className={`mb-2 text-sm ${
                    msg.type === 'error'
                        ? 'text-destructive'
                        : msg.type === 'system'
                            ? 'text-muted-foreground'
                            : ''
                }`}
            >
                <span className="text-muted-foreground">[{msg.timestamp}] </span>
                {msg.type === 'sent' && '→ '}
                {msg.type === 'received' && '← '}
                {msg.message}
            </div>
        ))}
    </div>
);

export default MessageLog;