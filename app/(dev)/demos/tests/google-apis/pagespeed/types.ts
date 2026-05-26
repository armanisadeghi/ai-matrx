// PageSpeed Insights API Types based on Google's documentation

export interface PageSpeedResponse {
    captchaResult?: string;
    id: string;
    loadingExperience?: PagespeedApiLoadingExperienceV5;
    originLoadingExperience?: PagespeedApiLoadingExperienceV5;
    analysisUTCTimestamp: string;
    lighthouseResult: LighthouseResultV5;
    version: PagespeedVersion;
}

export interface PagespeedApiLoadingExperienceV5 {
    id: string;
    metrics: Record<string, UserPageLoadMetricV5>;
    overall_category: string;
    initial_url?: string;
    origin_fallback?: boolean;
}

export interface UserPageLoadMetricV5 {
    percentile: number;
    distributions: Array<{
        min: number;
        max?: number;
        proportion: number;
    }>;
    category: string;
}

export interface LighthouseResultV5 {
    requestedUrl: string;
    finalUrl: string;
    lighthouseVersion: string;
    userAgent: string;
    fetchTime: string;
    environment: Environment;
    runWarnings: string[];
    configSettings: ConfigSettings;
    audits: Record<string, LighthouseAuditResultV5>;
    categories: Categories;
    categoryGroups: Record<string, CategoryGroupV5>;
    timing: Timing;
    i18n: I18n;
    stackPacks?: StackPack[];
}

export interface LighthouseAuditResultV5 {
    id: string;
    title: string;
    description: string;
    score: number | null;
    scoreDisplayMode: string;
    displayValue?: string;
    numericValue?: number;
    numericUnit?: string;
    details?: any;
    warnings?: string[];
}

export interface Categories {
    performance?: LighthouseCategoryV5;
    accessibility?: LighthouseCategoryV5;
    "best-practices"?: LighthouseCategoryV5;
    seo?: LighthouseCategoryV5;
    pwa?: LighthouseCategoryV5;
}

export interface LighthouseCategoryV5 {
    id: string;
    title: string;
    description?: string;
    score: number | null;
    manualDescription?: string;
    auditRefs: AuditRef[];
}

export interface AuditRef {
    id: string;
    weight: number;
    group?: string;
    acronym?: string;
    relevantAudits?: string[];
}

export interface CategoryGroupV5 {
    title: string;
    description?: string;
}

export interface Environment {
    networkUserAgent: string;
    hostUserAgent: string;
    benchmarkIndex: number;
}

export interface ConfigSettings {
    emulatedFormFactor: string;
    formFactor: string;
    locale: string;
    onlyCategories: string[];
    channel: string;
}

export interface Timing {
    total: number;
}

export interface I18n {
    rendererFormattedStrings: RendererFormattedStrings;
}

export interface RendererFormattedStrings {
    varianceDisclaimer: string;
    opportunityResourceColumnLabel: string;
    opportunitySavingsColumnLabel: string;
    errorMissingAuditInfo: string;
    errorLabel: string;
    warningHeader: string;
    passedAuditsGroupTitle: string;
    notApplicableAuditsGroupTitle: string;
    manualAuditsGroupTitle: string;
    toplevelWarningsMessage: string;
    crcLongestDurationLabel: string;
    crcInitialNavigation: string;
    lsPerformanceCategoryDescription: string;
    labDataTitle: string;
}

export interface StackPack {
    id: string;
    title: string;
    iconDataURL: string;
    descriptions: Record<string, string>;
}

export interface PagespeedVersion {
    major: string;
    minor: string;
}

export type Strategy = "desktop" | "mobile";

export type Category = "ACCESSIBILITY" | "BEST_PRACTICES" | "PERFORMANCE" | "SEO";

export interface PageSpeedAPIParams {
    url: string;
    strategy?: Strategy;
    categories?: Category[];
    locale?: string;
}

