'use client';
// components/layouts/ConversationalLayout.tsx
import { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AppletConfig } from '@/types/applets/types';

interface ConversationalLayoutProps {
    config: AppletConfig;
}

export function ConversationalLayout({ config }: ConversationalLayoutProps) {
    const [selectedSection, setSelectedSection] = useState('new-chat');

    return (
        <div className="min-h-dvh bg-gradient-to-b from-background to-background/50 animate-fade-in">
            <div className="container py-8">
                {/* Floating Header */}
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-10 bg-background/80 backdrop-blur-lg rounded-full px-6 py-3 shadow-lg border border-border/50 flex items-center space-x-4">
                    {config.icon}
                    <div>
                        <h1 className="text-2xl font-bold">{config.title}</h1>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="mt-24 grid grid-cols-12 gap-6">
                    {/* Side Navigation */}
                    <div className="col-span-3">
                        <div className="space-y-4 sticky top-24">
                            {(config.sections ?? []).map((section) => (
                                <Link
                                    key={section.id}
                                    href={section.link ?? '#'}
                                    onClick={() => setSelectedSection(section.id)}
                                >
                                    <Card
                                        className={`transition-all duration-300 hover:scale-105 ${
                                            selectedSection === section.id
                                            ? 'border-primary shadow-lg'
                                            : 'hover:border-primary/50'
                                        }`}
                                    >
                                        <CardContent className="p-4 flex items-center space-x-3">
                                            <div className={`p-2 rounded-lg ${
                                                selectedSection === section.id
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted'
                                            }`}>
                                                {section.icon}
                                            </div>
                                            <div>
                                                <h3 className="font-medium">{section.title}</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    {section.description}
                                                </p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Main Chat Area */}
                    <div className="col-span-9">
                        <Card className="border-2 h-[800px] relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-50" />
                            <div className="absolute inset-0 bg-grid-white/[0.02] bg-grid" />

                            <div className="relative h-full flex flex-col">
                                {/* Chat Header */}
                                <div className="p-4 border-b bg-background/50 backdrop-blur-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                                            <span className="font-medium">AI Assistant</span>
                                        </div>
                                        <div className="flex space-x-2">
                                            {config.stats?.map((stat) => (
                                                <div key={stat.id} className="flex items-center space-x-2 text-sm text-muted-foreground">
                                                    {stat.icon}
                                                    <span>{stat.value} {stat.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Chat Content */}
                                <div className="flex-1 overflow-y-auto p-6">
                                    <div className="flex flex-col space-y-4">
                                        {/* Placeholder for chat messages */}
                                        <div className="text-center text-muted-foreground">
                                            Start a new conversation with AI
                                        </div>
                                    </div>
                                </div>

                                {/* Chat Input */}
                                <div className="p-4 border-t bg-background/50 backdrop-blur-sm">
                                    <div className="flex space-x-2">
                                        <input
                                            type="text"
                                            placeholder="Type your message..."
                                            className="flex-1 rounded-lg border bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                        <Button>Send</Button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
