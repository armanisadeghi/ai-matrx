"use client";

import { Zap } from "lucide-react";

interface EmptyResultProps {
  message?: string;
}

export function EmptyResult({
  message = "Enter values to see your estimate",
}: EmptyResultProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[220px] py-8">
      <div className="rounded-full bg-primary/10 p-3 mb-4 ring-1 ring-primary/15">
        <Zap className="h-5 w-5 text-primary" />
      </div>
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-xs">
        Your result will update live as you type.
      </p>
    </div>
  );
}
