// app/(public)/education/math/[id]/not-found.tsx
import React from 'react';
import Link from 'next/link';
import { BookOpen, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MathProblemNotFound() {
    return (
        <div className="min-h-dvh bg-textured flex items-center justify-center p-4">
            <div className="max-w-2xl w-full text-center space-y-6">
                {/* Icon */}
                <div className="flex justify-center">
                    <div className="rounded-full bg-muted p-6">
                        <BookOpen className="w-16 h-16 text-muted-foreground" />
                    </div>
                </div>

                {/* Heading */}
                <h1 className="text-4xl md:text-5xl font-bold">
                    Math Problem Not Found
                </h1>

                {/* Description */}
                <p className="text-xl text-muted-foreground">
                    We couldn&apos;t find the math problem you&apos;re looking for.
                </p>
                <p className="text-base text-muted-foreground/80">
                    It may have been removed, renamed, or is no longer available. 
                    Try browsing our collection of available problems instead.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
                    <Link href="/education/math">
                        <Button
                            variant="outline"
                            className="flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Math Lessons
                        </Button>
                    </Link>
                    <Link href="/education">
                        <Button className="flex items-center gap-2">
                            <Home className="w-4 h-4" />
                            Education Home
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}

