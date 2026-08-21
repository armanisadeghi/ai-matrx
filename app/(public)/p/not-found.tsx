import { FileQuestion, Home } from 'lucide-react';
import Link from 'next/link';

/**
 * Custom 404 page for all /p/* routes.
 *
 * Reached only when the ADDRESS itself matched nothing public — a slug with no
 * published app behind it, an unregistered resource type, or a malformed id.
 * An id-addressed miss never lands here: those pages render `<AccessGate>`,
 * which resolves whether the record is denied / deleted / missing / signed-out
 * instead of guessing. This surface therefore only speaks about the address.
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
                    Nothing is published at this address
                </h1>
                <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
                    This link didn&apos;t match a published app or shared resource.
                    It may be mistyped, or it may be out of date.
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
