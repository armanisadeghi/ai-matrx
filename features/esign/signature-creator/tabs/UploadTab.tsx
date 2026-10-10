"use client";

import { useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export function UploadTab({ onFile, busy, error }: { onFile: (file: File) => void; busy: boolean; error: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`flex h-44 flex-col items-center justify-center gap-3 rounded-md border border-dashed ${
        over ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        aria-label="Signature image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Button variant="outline" icon={<ImageUp />} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Cleaning up" : "Choose image"}
      </Button>
      <span className="text-xs text-muted-foreground">PNG or JPEG, or drop it here</span>
      {error && <span role="alert" className="px-3 text-center text-xs text-destructive">{error}<ErrorAlchemyMenu error={error} /></span>}
    </div>
  );
}
