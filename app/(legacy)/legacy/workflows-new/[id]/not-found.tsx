import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileX, ArrowLeft, Plus } from "lucide-react";

export default function WorkflowNotFound() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 bg-destructive/10 dark:bg-destructive/20 rounded-full flex items-center justify-center">
              <FileX className="w-12 h-12 text-destructive/60 dark:text-destructive/70" />
            </div>
            {/* Animated pulse effect */}
            <div className="absolute inset-0 w-24 h-24 bg-destructive/5 dark:bg-destructive/10 rounded-full animate-ping" />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-foreground">
            Workflow Not Found
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            The workflow you're looking for doesn't exist or may have been deleted.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link href="/workflows" className="block">
            <Button className="w-full gap-2" size="lg">
              <ArrowLeft className="w-4 h-4" />
              Back to Workflows
            </Button>
          </Link>
          
          <Link href="/workflows/new" className="block">
            <Button variant="outline" className="w-full gap-2" size="lg">
              <Plus className="w-4 h-4" />
              Create New Workflow
            </Button>
          </Link>
        </div>

        {/* Help text */}
        <p className="text-sm text-muted-foreground/80">
          Need help? Check your workflow list or create a new one to get started.
        </p>
      </div>
    </div>
  );
} 