// components/layouts/ToolsLayout.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { AppletConfig, ToolEntityConfig } from "@/types/applets/types";
import {toolEntities} from "@/config/applets/tools";

interface ToolsLayoutProps {
    config: ToolEntityConfig;
}

export const ToolsLayout = ({ config }) => {
    // Group entities by category
    const groupedEntities = toolEntities.reduce((acc, entityConfig) => {
        const category = entityConfig.category ?? 'other';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(entityConfig);
        return acc;
    }, {} as Record<string, typeof toolEntities>);

    return (
        <div className="container py-8 animate-fade-in">
            {/* Header */}
            <div className="space-y-4 mb-8">
                <div className="flex items-center space-x-4">
                    {config.icon}
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight">{config.title}</h1>
                        <p className="text-xl text-muted-foreground">{config.description}</p>
                    </div>
                </div>
            </div>

            {/* Sections by Category */}
            <div className="space-y-8">
                {Object.entries(groupedEntities).map(([category, entities]) => (
                    <div key={category}>
                        <h2 className="text-2xl font-semibold tracking-tight mb-4">
                            {category === 'core' ? 'Core Tools' : 'Connected Features'}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {entities.map(entityConfig => (
                                <Link
                                    key={entityConfig.id}
                                    href={`/applets/matrx/tools/${entityConfig.id}`}
                                    className="group"
                                >
                                    <Card className="h-full transition-all hover:shadow-lg hover:border-primary/50">
                                        <CardHeader>
                                            <div className="flex items-center justify-between">
                                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                                    {entityConfig.icon}
                                                </div>
                                                {entityConfig.badge && (
                                                    <Badge variant="secondary">{entityConfig.badge}</Badge>
                                                )}
                                            </div>
                                            <CardTitle className="mt-4 flex items-center justify-between">
                                                {entityConfig.title}
                                                {entityConfig.count && (
                                                    <span className="text-sm text-muted-foreground">
                                                     {entityConfig.count}
                                                  </span>
                                                )}
                                            </CardTitle>
                                            <CardDescription>{entityConfig.description}</CardDescription>
                                        </CardHeader>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
