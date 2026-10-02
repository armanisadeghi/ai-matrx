"use client";

interface UserMessageCardProps {
  content: string;
  timestamp?: string;
}

export function UserMessageCard({ content, timestamp }: UserMessageCardProps) {
  return (
    <div className="flex justify-end animate-in slide-in-from-bottom-2 duration-200">
      <div className="max-w-[85%] bg-primary/10 border border-primary/20 rounded-xl px-3 py-1.5">
        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {content}
        </p>
        {timestamp && (
          <span className="text-[10px] text-muted-foreground block mt-0.5 text-right">
            {timestamp}
          </span>
        )}
      </div>
    </div>
  );
}
