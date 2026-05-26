import type { PageSpeedResponse, LighthouseAuditResultV5 } from "../types";

export interface LLMAnalysisData {
    url: string;
    strategy: "desktop" | "mobile";
    timestamp: string;
    summary: {
        performance: number;
        accessibility: number;
        bestPractices: number;
        seo: number;
    };
    issues: {
        category: string;
        severity: "critical" | "warning";
        title: string;
        description: string;
        score: number;
        displayValue?: string;
        recommendations?: string;
    }[];
}

export function formatPageSpeedForLLM(
    data: PageSpeedResponse,
    strategy: "desktop" | "mobile"
): LLMAnalysisData {
    const { lighthouseResult, analysisUTCTimestamp } = data;
    const { categories, audits, finalUrl } = lighthouseResult;

    // Extract scores
    const summary = {
        performance: Math.round((categories.performance?.score || 0) * 100),
        accessibility: Math.round((categories.accessibility?.score || 0) * 100),
        bestPractices: Math.round((categories["best-practices"]?.score || 0) * 100),
        seo: Math.round((categories.seo?.score || 0) * 100),
    };

    // Extract issues (audits with score < 0.9)
    const issues: LLMAnalysisData["issues"] = [];

    Object.entries(categories).forEach(([categoryKey, category]) => {
        if (!category) return;

        category.auditRefs.forEach((ref) => {
            const audit = audits[ref.id];
            if (!audit) return;

            // Only include audits that need improvement (score < 0.9)
            if (
                audit.score !== null &&
                audit.score < 0.9 &&
                audit.scoreDisplayMode !== "informative" &&
                audit.scoreDisplayMode !== "notApplicable"
            ) {
                issues.push({
                    category: category.title,
                    severity: audit.score < 0.5 ? "critical" : "warning",
                    title: audit.title,
                    description: audit.description,
                    score: Math.round(audit.score * 100),
                    displayValue: audit.displayValue,
                    recommendations: extractRecommendations(audit),
                });
            }
        });
    });

    // Sort by severity (critical first) then by score (lowest first)
    issues.sort((a, b) => {
        if (a.severity !== b.severity) {
            return a.severity === "critical" ? -1 : 1;
        }
        return a.score - b.score;
    });

    return {
        url: finalUrl,
        strategy,
        timestamp: analysisUTCTimestamp,
        summary,
        issues,
    };
}

function extractRecommendations(audit: LighthouseAuditResultV5): string | undefined {
    // Try to extract actionable information from details
    if (audit.details) {
        const details = audit.details as any;
        
        // Check for items array (common in many audits)
        if (details.items && Array.isArray(details.items) && details.items.length > 0) {
            const items = details.items.slice(0, 3); // Limit to first 3 items
            const itemSummary = items
                .map((item: any) => {
                    if (item.url) return item.url;
                    if (item.source) return item.source;
                    if (item.node?.snippet) return item.node.snippet;
                    return null;
                })
                .filter(Boolean)
                .join(", ");
            
            if (itemSummary) {
                return `Affected items: ${itemSummary}${details.items.length > 3 ? ` (and ${details.items.length - 3} more)` : ""}`;
            }
        }

        // Check for opportunity (savings data)
        if (details.overallSavingsMs) {
            return `Potential savings: ${Math.round(details.overallSavingsMs)}ms`;
        }
        if (details.overallSavingsBytes) {
            return `Potential savings: ${Math.round(details.overallSavingsBytes / 1024)}KB`;
        }
    }

    return undefined;
}

export function formatAsMarkdown(data: LLMAnalysisData): string {
    const lines: string[] = [];

    lines.push(`# PageSpeed Analysis - ${data.strategy.toUpperCase()}`);
    lines.push(`**URL:** ${data.url}`);
    lines.push(`**Analyzed:** ${new Date(data.timestamp).toLocaleString()}`);
    lines.push("");

    lines.push("## Summary Scores");
    lines.push(`- **Performance:** ${data.summary.performance}/100`);
    lines.push(`- **Accessibility:** ${data.summary.accessibility}/100`);
    lines.push(`- **Best Practices:** ${data.summary.bestPractices}/100`);
    lines.push(`- **SEO:** ${data.summary.seo}/100`);
    lines.push("");

    if (data.issues.length === 0) {
        lines.push("## ✅ All Checks Passed!");
        lines.push("No issues found that need improvement.");
    } else {
        const criticalIssues = data.issues.filter((i) => i.severity === "critical");
        const warnings = data.issues.filter((i) => i.severity === "warning");

        if (criticalIssues.length > 0) {
            lines.push(`## 🔴 Critical Issues (${criticalIssues.length})`);
            criticalIssues.forEach((issue, index) => {
                lines.push("");
                lines.push(`### ${index + 1}. ${issue.title} (Score: ${issue.score}/100)`);
                lines.push(`**Category:** ${issue.category}`);
                lines.push(`**Description:** ${issue.description}`);
                if (issue.displayValue) {
                    lines.push(`**Current Value:** ${issue.displayValue}`);
                }
                if (issue.recommendations) {
                    lines.push(`**Recommendations:** ${issue.recommendations}`);
                }
            });
            lines.push("");
        }

        if (warnings.length > 0) {
            lines.push(`## ⚠️ Needs Improvement (${warnings.length})`);
            warnings.forEach((issue, index) => {
                lines.push("");
                lines.push(`### ${index + 1}. ${issue.title} (Score: ${issue.score}/100)`);
                lines.push(`**Category:** ${issue.category}`);
                lines.push(`**Description:** ${issue.description}`);
                if (issue.displayValue) {
                    lines.push(`**Current Value:** ${issue.displayValue}`);
                }
                if (issue.recommendations) {
                    lines.push(`**Recommendations:** ${issue.recommendations}`);
                }
            });
        }
    }

    return lines.join("\n");
}

export function formatAsJSON(data: LLMAnalysisData): string {
    return JSON.stringify(data, null, 2);
}

