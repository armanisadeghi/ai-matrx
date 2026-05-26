"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function PromptsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <Card className="h-full w-full bg-textured border-none shadow-lg">
            <div className="p-8 md:p-12">
                <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                    <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                    <h2 className="text-2xl font-bold text-foreground mb-2">
                        Something went wrong
                    </h2>
                    <p className="text-muted-foreground mb-6 max-w-md">
                        {error.message || "An error occurred while loading prompts"}
                    </p>
                    <Button
                        onClick={reset}
                    >
                        Try Again
                    </Button>
                </div>
            </div>
        </Card>
    );
}

