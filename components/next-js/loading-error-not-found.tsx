"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { AlertCircle, Loader2, RefreshCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Loading Skeleton Component
const LoadingSkeleton = () => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center space-y-8 min-h-[50dvh]">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="relative"
      >
        <Loader2 className="w-12 h-12 text-primary" />
      </motion.div>

      <div className="space-y-3 w-full max-w-md">
        <div className="w-3/4 h-4 bg-muted rounded animate-pulse mx-auto" />
        <div className="w-1/2 h-4 bg-muted rounded animate-pulse mx-auto" />
      </div>
    </div>
  );
};

// Loading Page Component
export function Loading() {
  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-semibold">
            Loading Content
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSkeleton />
        </CardContent>
      </Card>
    </div>
  );
}

// Error Page Component
export function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[Error boundary]", error);
  }, [error]);

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center justify-center space-x-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <span>Something went wrong</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTitle>Error Details</AlertTitle>
            <AlertDescription className="mt-2 font-mono text-sm">
              {error.message || "An unexpected error occurred"}
              {error.digest && (
                <div className="mt-1 text-xs opacity-70">
                  Error ID: {error.digest}
                </div>
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex justify-center space-x-4">
          <Button
            variant="outline"
            onClick={() => router.push("/")}
            className="space-x-2"
          >
            <Home className="h-4 w-4" />
            <span>Home</span>
          </Button>
          <Button onClick={() => reset()} className="space-x-2">
            <RefreshCcw className="h-4 w-4" />
            <span>Try Again</span>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Not Found Page Component
export function NotFound() {
  const router = useRouter();

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-semibold">
            404 - Page Not Found
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="p-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="text-8xl font-bold text-primary/20"
            >
              404
            </motion.div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={() => router.push("/")} className="space-x-2">
            <Home className="h-4 w-4" />
            <span>Return Home</span>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default {
  Loading,
  Error,
  NotFound,
};
