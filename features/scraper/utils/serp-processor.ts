

interface SearchMetadata {
    id?: string;
    status?: string;
    json_endpoint?: string;
    created_at?: string;
    processed_at?: string;
    google_url?: string;
    raw_html_file?: string;
    total_time_taken?: number;
}

interface SearchParameters {
    engine?: string;
    q?: string;
    google_domain?: string;
    gl?: string;
    hl?: string;
}

interface SearchInformation {
    query_displayed?: string;
    total_results?: number;
    time_taken_displayed?: number;
    organic_results_state?: string;
}

interface InlineImage {
    link?: string;
    source?: string;
    thumbnail?: string;
    original?: string;
    title?: string;
    serpapi_link?: string;
    source_name?: string;
}

interface RelatedQuestion {
    question?: string;
    snippet?: string;
    title?: string;
    link?: string;
    displayed_link?: string;
    next_page_token?: string;
    serpapi_link?: string;
}

interface AIOverview {
    sources?: Array<{
        title?: string;
        link?: string;
        displayed_link?: string;
    }>;
    text?: string;
}

interface OrganicResult {
    position?: number;
    title?: string;
    link?: string;
    displayed_link?: string;
    snippet?: string;
    cached_page_link?: string;
    redirect_link?: string;
    favicon?: string;
    source?: string;
    snippet_highlighted_words?: string[];
    missing?: string[];
    must_include?: {
        word?: string;
        link?: string;
    };
    about_this_result?: {
        source?: {
            description?: string;
            source_info_link?: string;
            security?: string;
            icon?: string;
        };
    };
    sitelinks?: {
        inline?: Array<{
            title?: string;
            link?: string;
        }>;
    };
    rich_snippet?: {
        top?: {
            detected_extensions?: {
                [key: string]: any;
            };
        };
    };
}

interface RelatedSearch {
    query?: string;
    link?: string;
    serpapi_link?: string;
    block_position?: number;
}

interface Discussion {
    title?: string;
    link?: string;
    displayed_link?: string;
    snippet?: string;
}

interface Pagination {
    current?: number;
    next?: string;
    other_pages?: {
        [key: string]: string;
    };
}

interface SerpApiPagination {
    current?: number;
    next_link?: string;
    next?: string;
    other_pages?: {
        [key: string]: string;
    };
}

// Main interface for the complete SerpAPI response
interface LocalResult {
    position?: number;
    title?: string;
    place_id?: string;
    rating?: number;
    reviews?: number;
    type?: string;
    address?: string;
    phone?: string;
    hours?: string;
    description?: string;
    links?: {
        website?: string;
        directions?: string;
    };
    gps_coordinates?: {
        latitude?: number;
        longitude?: number;
    };
}

interface LocalResults {
    places?: LocalResult[];
    more_locations_link?: string;
}

interface Filter {
    name?: string;
    link?: string;
    serpapi_link?: string;
    parameters?: {
        [key: string]: any;
    };
}

interface SerpAPIResults {
    search_metadata?: SearchMetadata;
    search_parameters?: SearchParameters;
    search_information?: SearchInformation;
    inline_images?: InlineImage[];
    related_questions?: RelatedQuestion[];
    ai_overview?: AIOverview;
    organic_results?: OrganicResult[];
    top_stories_link?: string;
    top_stories_serpapi_link?: string;
    related_searches?: RelatedSearch[];
    discussions_and_forums?: Discussion[];
    pagination?: Pagination;
    serpapi_pagination?: SerpApiPagination;
    // Additional fields from your API
    local_results?: LocalResults;
    local_map?: {
        image?: string;
        gps_coordinates?: {
            latitude?: number;
            longitude?: number;
        };
    };
    filters?: Filter[];
}

// Main interface for the nested result structure
export interface ProcessedSerpData {
    results: SerpAPIResults;
}

// Utility class for processing SerpAPI results
export class SerpProcessor {
    private data: SerpAPIResults;

    constructor(nestedData: ProcessedSerpData) {
        this.data = nestedData?.results ?? {};
    }
    
    // Extract search metadata
    getSearchMetadata(): SearchMetadata | null {
        return this.data.search_metadata || null;
    }

    // Extract search parameters
    getSearchParameters(): SearchParameters | null {
        return this.data.search_parameters || null;
    }

    // Extract search information
    getSearchInformation(): SearchInformation | null {
        return this.data.search_information || null;
    }

    // Extract organic search results
    getOrganicResults(): OrganicResult[] {
        return this.data.organic_results || [];
    }

    // Extract top organic results (first N results)
    getTopOrganicResults(limit: number = 5): OrganicResult[] {
        return this.getOrganicResults().slice(0, limit);
    }

    // Extract related questions
    getRelatedQuestions(): RelatedQuestion[] {
        return this.data.related_questions || [];
    }

    // Extract AI overview
    getAIOverview(): AIOverview | null {
        return this.data.ai_overview || null;
    }

    // Extract inline images
    getInlineImages(): InlineImage[] {
        return this.data.inline_images || [];
    }

    // Extract related searches
    getRelatedSearches(): RelatedSearch[] {
        return this.data.related_searches || [];
    }

    // Extract discussions and forums
    getDiscussionsAndForums(): Discussion[] {
        return this.data.discussions_and_forums || [];
    }

    // Extract pagination info
    getPagination(): Pagination | null {
        return this.data.pagination || null;
    }

    // Get SerpAPI pagination (with direct API links)
    getSerpApiPagination(): SerpApiPagination | null {
        return this.data.serpapi_pagination || null;
    }

    // Get local results (local businesses)
    getLocalResults(): LocalResult[] {
        return this.data.local_results?.places || [];
    }

    // Get search filters
    getFilters(): Filter[] {
        return this.data.filters || [];
    }

    // Get local map info
    getLocalMap(): { image?: string; gps_coordinates?: { latitude?: number; longitude?: number } } | null {
        return this.data.local_map || null;
    }

    // Get total number of results
    getTotalResults(): number {
        return this.data.search_information?.total_results || 0;
    }

    // Get search query
    getSearchQuery(): string {
        return this.data.search_parameters?.q || "";
    }

    // Get all available sections as an array of section names
    getAvailableSections(): string[] {
        const sections: string[] = [];
        const sectionMap = {
            search_metadata: this.data.search_metadata,
            search_parameters: this.data.search_parameters,
            search_information: this.data.search_information,
            inline_images: this.data.inline_images,
            related_questions: this.data.related_questions,
            ai_overview: this.data.ai_overview,
            organic_results: this.data.organic_results,
            related_searches: this.data.related_searches,
            discussions_and_forums: this.data.discussions_and_forums,
            pagination: this.data.pagination,
            serpapi_pagination: this.data.serpapi_pagination,
            local_results: this.data.local_results?.places,
            filters: this.data.filters,
            local_map: this.data.local_map,
        };

        for (const [section, data] of Object.entries(sectionMap)) {
            if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
                sections.push(section);
            }
        }

        return sections;
    }

    // Extract key insights summary
    getSummary(): {
        query: string;
        totalResults: number;
        organicResultsCount: number;
        relatedQuestionsCount: number;
        hasAIOverview: boolean;
        inlineImagesCount: number;
        relatedSearchesCount: number;
        localResultsCount: number;
        filtersCount: number;
        availableSections: string[];
    } {
        return {
            query: this.getSearchQuery(),
            totalResults: this.getTotalResults(),
            organicResultsCount: this.getOrganicResults().length,
            relatedQuestionsCount: this.getRelatedQuestions().length,
            hasAIOverview: !!this.getAIOverview(),
            inlineImagesCount: this.getInlineImages().length,
            relatedSearchesCount: this.getRelatedSearches().length,
            localResultsCount: this.getLocalResults().length,
            filtersCount: this.getFilters().length,
            availableSections: this.getAvailableSections(),
        };
    }
}

// Main processing function for use in Node.js scripts
export function processSerpData(data: ProcessedSerpData): SerpProcessor {
    return new SerpProcessor(data);
}