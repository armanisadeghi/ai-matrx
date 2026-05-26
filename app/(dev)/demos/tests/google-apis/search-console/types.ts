// Google Search Console Types

export interface SiteProperty {
    siteUrl: string;
    permissionLevel: string;
}

export interface SearchAnalyticsResponse {
    rows?: SearchAnalyticsRow[];
    responseAggregationType?: string;
}

export interface SearchAnalyticsRow {
    keys?: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface DateRange {
    startDate: string;
    endDate: string;
}

export interface SearchAnalyticsRequest {
    startDate: string;
    endDate: string;
    dimensions?: string[];
    dimensionFilterGroups?: any[];
    aggregationType?: string;
    rowLimit?: number;
    startRow?: number;
}

export interface PerformanceSummary {
    totalClicks: number;
    totalImpressions: number;
    averageCTR: number;
    averagePosition: number;
}

export type Dimension = 'query' | 'page' | 'country' | 'device' | 'searchAppearance' | 'date';

