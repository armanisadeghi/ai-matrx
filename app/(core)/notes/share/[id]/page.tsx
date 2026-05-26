"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { acceptSharedNote } from "@/features/notes/service/notesService";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";

export default function AcceptSharedNotePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { id: userId } = useAppSelector(selectUser);

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!id) return;

    const acceptShare = async () => {
      if (!userId) {
        setStatus("error");
        setErrorMessage("You must be logged in to accept shared notes");
        return;
      }

      try {
        await acceptSharedNote(id, userId);
        setStatus("success");
        setTimeout(() => {
          router.push("/notes");
        }, 2000);
      } catch (error) {
        console.error("Error accepting shared note:", error);
        setStatus("error");
        setErrorMessage(
          "Failed to accept note. It may not exist or you may not have permission.",
        );
      }
    };

    acceptShare();
  }, [id, userId, router]);

  return (
    <div className="flex items-center justify-center min-h-dvh bg-muted">
      <div className="max-w-md w-full p-8 bg-card rounded-lg shadow-lg">
        {status === "loading" && (
          <div className="text-center">
            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Accepting Shared Note...
            </h2>
            <p className="text-muted-foreground">
              Please wait while we add this note to your collection.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center">
            <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
              <Check className="h-6 w-6 text-success" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Note Accepted!
            </h2>
            <p className="text-muted-foreground mb-4">
              The shared note has been added to your collection.
            </p>
            <Button onClick={() => router.push("/notes")}>Go to Notes</Button>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Unable to Accept Note
            </h2>
            <p className="text-muted-foreground mb-4">{errorMessage}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => router.push("/notes")}>
                Go to Notes
              </Button>
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
