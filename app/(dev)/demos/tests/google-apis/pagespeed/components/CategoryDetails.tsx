"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { LighthouseCategoryV5, LighthouseAuditResultV5 } from "../types";
import { CheckCircle2, XCircle, AlertCircle, Info, ChevronRight } from "lucide-react";

interface CategoryDetailsProps {
    category: LighthouseCategoryV5;
    audits: Record<string, LighthouseAuditResultV5>;
}

export function CategoryDetails({ category, audits }: CategoryDetailsProps) {
    const getAuditsByScore = () => {
        const passed: LighthouseAuditResultV5[] = [];
        const warnings: LighthouseAuditResultV5[] = [];
        const failed: LighthouseAuditResultV5[] = [];
        const informational: LighthouseAuditResultV5[] = [];

        category.auditRefs.forEach((ref) => {
            const audit = audits[ref.id];
            if (!audit) return;

            if (audit.scoreDisplayMode === "informative" || audit.scoreDisplayMode === "notApplicable") {
                informational.push(audit);
            } else if (audit.score === null) {
                informational.push(audit);
            } else if (audit.score >= 0.9) {
                passed.push(audit);
            } else if (audit.score >= 0.5) {
                warnings.push(audit);
            } else {
                failed.push(audit);
            }
        });

        return { passed, warnings, failed, informational };
    };

    const { passed, warnings, failed, informational } = getAuditsByScore();

    const AuditItem = ({ audit }: { audit: LighthouseAuditResultV5 }) => {
        const getIcon = () => {
            if (audit.scoreDisplayMode === "informative" || audit.scoreDisplayMode === "notApplicable") {
                return <Info className="w-5 h-5 text-blue-500 dark:text-blue-400" />;
            }
            if (audit.score === null) {
                return <Info className="w-5 h-5 text-gray-500 dark:text-gray-400" />;
            }
            if (audit.score >= 0.9) {
                return <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400" />;
            }
            if (audit.score >= 0.5) {
                return <AlertCircle className="w-5 h-5 text-orange-500 dark:text-orange-400" />;
            }
            return <XCircle className="w-5 h-5 text-red-500 dark:text-red-400" />;
        };

        const getScoreBadge = () => {
            if (audit.score === null) return null;
            const score = Math.round(audit.score * 100);
            let colorClass = "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
            
            if (audit.score >= 0.9) {
                colorClass = "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
            } else if (audit.score >= 0.5) {
                colorClass = "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300";
            } else {
                colorClass = "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
            }

            return (
                <Badge className={`${colorClass} border-none`}>
                    {score}
                </Badge>
            );
        };

        return (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border-border">
                <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">
                            {audit.title}
                        </h4>
                        {getScoreBadge()}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {audit.description}
                    </p>
                    {audit.displayValue && (
                        <p className="text-xs font-mono text-gray-700 dark:text-gray-300 mt-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded inline-block">
                            {audit.displayValue}
                        </p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Category Description */}
            {category.description && (
                <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="pt-4">
                        <p className="text-sm text-blue-900 dark:text-blue-100">
                            {category.description}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Audits */}
            <Accordion type="multiple" className="space-y-2">
                {/* Failed Audits */}
                {failed.length > 0 && (
                    <AccordionItem value="failed" className="border border-red-200 dark:border-red-800 rounded-lg">
                        <AccordionTrigger className="px-4 hover:no-underline">
                            <div className="flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    Failed Audits
                                </span>
                                <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-none">
                                    {failed.length}
                                </Badge>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                            <div className="space-y-2">
                                {failed.map((audit) => (
                                    <AuditItem key={audit.id} audit={audit} />
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                )}

                {/* Warnings */}
                {warnings.length > 0 && (
                    <AccordionItem value="warnings" className="border border-orange-200 dark:border-orange-800 rounded-lg">
                        <AccordionTrigger className="px-4 hover:no-underline">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    Needs Improvement
                                </span>
                                <Badge className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-none">
                                    {warnings.length}
                                </Badge>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                            <div className="space-y-2">
                                {warnings.map((audit) => (
                                    <AuditItem key={audit.id} audit={audit} />
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                )}

                {/* Passed Audits */}
                {passed.length > 0 && (
                    <AccordionItem value="passed" className="border border-green-200 dark:border-green-800 rounded-lg">
                        <AccordionTrigger className="px-4 hover:no-underline">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400" />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    Passed Audits
                                </span>
                                <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-none">
                                    {passed.length}
                                </Badge>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                            <div className="space-y-2">
                                {passed.map((audit) => (
                                    <AuditItem key={audit.id} audit={audit} />
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                )}

                {/* Informational */}
                {informational.length > 0 && (
                    <AccordionItem value="informational" className="border-border rounded-lg">
                        <AccordionTrigger className="px-4 hover:no-underline">
                            <div className="flex items-center gap-2">
                                <Info className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    Additional Information
                                </span>
                                <Badge className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-none">
                                    {informational.length}
                                </Badge>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                            <div className="space-y-2">
                                {informational.map((audit) => (
                                    <AuditItem key={audit.id} audit={audit} />
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                )}
            </Accordion>
        </div>
    );
}

