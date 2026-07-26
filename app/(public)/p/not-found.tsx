import { FileQuestion, Home } from 'lucide-react';
import Link from 'next/link';

/**
 * Custom 404 page for all /p/* routes.
 * 
 * Shown when:
 * - An app slug doesn't match any published app
 * - An app has been unpublished or deleted
 * - Invalid URL is accessed under /p/
 */
export default function PromptAppNotFound() {
    return (
        <div className="flex items-center justify-center min-h-[calc(100dvh-var(--header-height,2.5rem))] bg-textured p-6">
            <div className="w-full max-w-md text-center">
                {/* Icon */}
                <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
                    <FileQuestion className="w-8 h-8 text-muted-foreground" />
                </div>

                {/* Heading */}
                <h1 className="text-2xl font-bold text-foreground mb-2">
                    App not found
                </h1>
                <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
                    The app you&apos;re looking for doesn&apos;t exist, may have been removed, 
                    or is no longer published.
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors w-full sm:w-auto justify-center"
                    >
                        <Home className="w-4 h-4" />
                        Go Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
