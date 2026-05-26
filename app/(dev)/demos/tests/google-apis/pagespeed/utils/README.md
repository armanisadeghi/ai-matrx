# LLM Data Formatting

## Overview

This utility extracts and formats PageSpeed Insights data specifically for AI/LLM analysis. It filters out only the issues that need attention (failed audits and those needing improvement) and structures them in a clean, actionable format.

## Key Features

- ✅ **Smart Filtering**: Only includes audits with scores < 90% that need improvement
- ✅ **Severity Classification**: Categorizes issues as "critical" (< 50%) or "warning" (50-89%)
- ✅ **Multiple Formats**: Supports both Markdown and JSON output
- ✅ **Actionable Data**: Extracts recommendations and affected items
- ✅ **LLM-Optimized**: Clean, concise structure perfect for AI workflows

## Data Structure

```typescript
interface LLMAnalysisData {
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
        category: string;              // e.g., "Performance"
        severity: "critical" | "warning";
        title: string;                 // Issue title
        description: string;           // Detailed description
        score: number;                 // 0-100
        displayValue?: string;         // Current metric value
        recommendations?: string;      // Actionable recommendations
    }[];
}
```

## Usage

### In Code

```typescript
import { formatPageSpeedForLLM, formatAsMarkdown, formatAsJSON } from "./formatForLLM";

// Extract structured data
const llmData = formatPageSpeedForLLM(pageSpeedResponse, "desktop");

// Format as Markdown for AI prompts
const markdown = formatAsMarkdown(llmData);

// Format as JSON for API integrations
const json = formatAsJSON(llmData);
```

### Example Output (Markdown)

```markdown
# PageSpeed Analysis - DESKTOP
**URL:** https://example.com
**Analyzed:** 1/1/2024, 12:00:00 PM

## Summary Scores
- **Performance:** 65/100
- **Accessibility:** 88/100
- **Best Practices:** 92/100
- **SEO:** 95/100

## 🔴 Critical Issues (2)

### 1. Largest Contentful Paint (Score: 42/100)
**Category:** Performance
**Description:** Largest Contentful Paint marks the time at which the largest text or image is painted.
**Current Value:** 4.2 s
**Recommendations:** Potential savings: 2100ms

### 2. Cumulative Layout Shift (Score: 38/100)
**Category:** Performance
**Description:** Cumulative Layout Shift measures the movement of visible elements within the viewport.
**Current Value:** 0.45

## ⚠️ Needs Improvement (3)

### 1. First Contentful Paint (Score: 65/100)
...
```

## Use Cases

1. **AI Chatbots**: Pass formatted data to ChatGPT/Claude for optimization suggestions
2. **Automated Reports**: Generate improvement reports with AI
3. **Workflow Automation**: Trigger automated fixes based on issues
4. **Custom Dashboards**: Display only actionable items
5. **CI/CD Integration**: Fail builds on critical issues

## Modal Component

The `LLMDataModal` component provides a user-friendly interface to:
- View formatted data before sending to AI
- Switch between Markdown and JSON formats
- Copy data with one click
- See issue counts at a glance

## Integration Example

```typescript
// In any workflow
const issues = formatPageSpeedForLLM(data, "mobile");

if (issues.issues.length > 0) {
    const prompt = `
        Analyze these PageSpeed issues and provide specific fixes:
        
        ${formatAsMarkdown(issues)}
    `;
    
    // Send to your AI service
    const suggestions = await callAI(prompt);
}
```

## What Gets Excluded

- ✅ Passed audits (score >= 90%)
- ✅ Informative audits (non-actionable)
- ✅ Non-applicable audits
- ✅ Manual checks (require human review)

This keeps the data focused and actionable!

