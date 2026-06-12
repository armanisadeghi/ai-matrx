import React from 'react';
import Link from 'next/link';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function EducationPage() {
    return (
        <div className="min-h-dvh bg-background text-foreground flex flex-col items-center justify-center p-8">
            <div className="max-w-4xl w-full space-y-8 text-center">
                {/* Icon */}
                <div className="flex justify-center">
                    <div className="rounded-full bg-primary/10 p-6">
                        <BookOpen className="w-16 h-16 text-primary" />
                    </div>
                </div>

                {/* Main Heading */}
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-800 via-neutral-700 to-neutral-700 dark:from-neutral-800 dark:via-white dark:to-white">
                    Education Center
                </h1>

                {/* Subheading */}
                <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
                    Free Learning Resources for Everyone
                </p>

                {/* Description */}
                <p className="text-base md:text-lg text-muted-foreground/80 max-w-2xl mx-auto">
                    Access comprehensive educational content, tutorials, and interactive learning experiences.
                    Start your learning journey with our step-by-step guides and practice problems.
                </p>

                {/* Available Courses */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto pt-8">
                    <Link href="/education/math">
                        <div className="group border rounded-lg p-6 hover:shadow-lg transition-all cursor-pointer hover:-translate-y-1 bg-card">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="rounded-full bg-primary/10 p-3">
                                    <BookOpen className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">
                                    Mathematics
                                </h3>
                            </div>
                            <p className="text-muted-foreground mb-4">
                                Interactive algebra lessons with step-by-step problem solving. Master mathematical concepts through detailed explanations.
                            </p>
                            <div className="flex items-center text-primary text-sm font-medium">
                                Start Learning
                                <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                            </div>
                        </div>
                    </Link>

                    <div className="border rounded-lg p-6 bg-card opacity-60">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="rounded-full bg-muted p-3">
                                <BookOpen className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-xl font-semibold text-muted-foreground">
                                Coming Soon
                            </h3>
                        </div>
                        <p className="text-muted-foreground/80 mb-4">
                            More educational content and courses are being developed. Check back soon for updates!
                        </p>
                    </div>

                    <div className="border rounded-lg p-6 bg-card opacity-60">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="rounded-full bg-muted p-3">
                                <BookOpen className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-xl font-semibold text-muted-foreground">
                                Coming Soon
                            </h3>
                        </div>
                        <p className="text-muted-foreground/80 mb-4">
                            Additional learning resources and interactive tutorials are in development.
                        </p>
                    </div>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
                    <Link href="/">
                        <Button
                            variant="outline"
                            className="flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Home
                        </Button>
                    </Link>
                    <Link href="/education/math">
                        <Button className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            Explore Math Lessons
                        </Button>
                    </Link>
                </div>

                {/* Additional Info */}
                <div className="pt-8 border-t border-border max-w-2xl mx-auto">
                    <p className="text-sm text-muted-foreground">
                        Have questions or need help in the meantime?{' '}
                        <Link href="/contact" className="text-primary hover:underline">
                            Contact our team
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

