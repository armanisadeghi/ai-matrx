'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { experimentalRoutes, searchExperimentalRoutes } from '../experimental-routes-config';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Search, ExternalLink, Beaker, ChevronRight } from 'lucide-react';

export default function ExperimentalRoutesPage() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(experimentalRoutes.map(section => section.name))
    );

    const filteredRoutes = useMemo(() => {
        if (!searchQuery.trim()) {
            return experimentalRoutes;
        }
        
        const searchResults = searchExperimentalRoutes(searchQuery);
        const sectionMap = new Map<string, typeof experimentalRoutes[0]>();
        
        searchResults.forEach(route => {
            const section = experimentalRoutes.find(s => s.name === route.section);
            if (!section) return;
            
            if (!sectionMap.has(section.name)) {
                sectionMap.set(section.name, {
                    ...section,
                    routes: []
                });
            }
            
            const mappedSection = sectionMap.get(section.name)!;
            mappedSection.routes.push(route);
        });
        
        return Array.from(sectionMap.values());
    }, [searchQuery]);

    const toggleSection = (sectionName: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(sectionName)) {
                next.delete(sectionName);
            } else {
                next.add(sectionName);
            }
            return next;
        });
    };

    const handleRouteClick = (path: string) => {
        router.push(path);
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'active':
                return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
            case 'in-progress':
                return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
            case 'deprecated':
                return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
        }
    };

    const totalRoutes = experimentalRoutes.reduce((sum, section) => sum + section.routes.length, 0);

    return (
        <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-background">
            {/* Header */}
            <div className="flex-none border-b border-border bg-card px-6 py-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/20 rounded-lg">
                        <Beaker className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Experimental Routes</h1>
                        <p className="text-sm text-muted-foreground">
                            {totalRoutes} test and demo routes across {experimentalRoutes.length} sections
                        </p>
                    </div>
                </div>

                {/* Search */}
                <div className="relative max-w-2xl">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search routes by name, path, or description..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-10"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear search"
                        >
                            <span className="text-lg">×</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Routes List */}
            <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-4 space-y-4">
                    {filteredRoutes.length === 0 ? (
                        <Card className="p-8 text-center">
                            <p className="text-muted-foreground">No routes found matching "{searchQuery}"</p>
                        </Card>
                    ) : (
                        filteredRoutes.map((section) => (
                            <Card key={section.name} className="overflow-hidden">
                                {/* Section Header */}
                                <button
                                    onClick={() => toggleSection(section.name)}
                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <ChevronRight 
                                            className={`w-4 h-4 transition-transform ${
                                                expandedSections.has(section.name) ? 'rotate-90' : ''
                                            }`}
                                        />
                                        <div className="text-left">
                                            <h2 className="font-semibold text-lg">{section.name}</h2>
                                            {section.description && (
                                                <p className="text-sm text-muted-foreground">{section.description}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">
                                            {section.routes.length} {section.routes.length === 1 ? 'route' : 'routes'}
                                        </Badge>
                                        <code className="text-xs px-2 py-1 bg-muted rounded">
                                            {section.baseRoute}
                                        </code>
                                    </div>
                                </button>

                                {/* Routes List */}
                                {expandedSections.has(section.name) && (
                                    <div className="border-t border-border">
                                        <div className="divide-y divide-border">
                                            {section.routes.map((route, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleRouteClick(route.path)}
                                                    className="w-full px-6 py-3 flex items-center justify-between hover:bg-accent transition-colors group"
                                                >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                                                        <div className="text-left flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium">{route.name}</span>
                                                                {route.status && (
                                                                    <Badge 
                                                                        variant="outline"
                                                                        className={`text-xs ${getStatusColor(route.status)}`}
                                                                    >
                                                                        {route.status}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {route.description && (
                                                                <p className="text-sm text-muted-foreground">{route.description}</p>
                                                            )}
                                                            <code className="text-xs text-muted-foreground block mt-1 truncate">
                                                                {route.path}
                                                            </code>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

