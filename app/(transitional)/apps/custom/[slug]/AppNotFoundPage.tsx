"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Home, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppNotFoundPage() {
    const router = useRouter();

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
            <Card className="w-full max-w-2xl border-2 shadow-2xl bg-textured">
                <CardHeader className="text-center space-y-4 pb-8">
                    <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-orange-400 to-red-500 dark:from-orange-500 dark:to-red-600 flex items-center justify-center shadow-lg">
                        <Search className="w-12 h-12 text-white" />
                    </div>
                    <CardTitle className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                        App Not Found
                    </CardTitle>
                    <CardDescription className="text-lg text-gray-600 dark:text-gray-400">
                        The application you're looking for doesn't exist or may have been removed.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 border-border">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                            What you can do:
                        </h3>
                        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                            <li className="flex items-start gap-2">
                                <span className="text-orange-500 mt-1">•</span>
                                <span>Check if the URL is correct</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-orange-500 mt-1">•</span>
                                <span>Browse available apps from your dashboard</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-orange-500 mt-1">•</span>
                                <span>Create a new custom app if you have permissions</span>
                            </li>
                        </ul>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                        <Button
                            onClick={() => router.back()}
                            variant="outline"
                            size="lg"
                            className="w-full h-14 text-base font-semibold border-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            <ArrowLeft className="w-5 h-5 mr-2" />
                            Go Back
                        </Button>
                        <Button
                            onClick={() => router.push('/dashboard')}
                            size="lg"
                            className="w-full h-14 text-base font-semibold bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-lg"
                        >
                            <Home className="w-5 h-5 mr-2" />
                            Go to Dashboard
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

