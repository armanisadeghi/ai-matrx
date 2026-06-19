const BASE = "/research";

export const RESEARCH_ENDPOINTS = {
  suggest: `${BASE}/suggest`,

  templates: {
    list: `${BASE}/templates/list`,
    create: `${BASE}/templates`,
    detail: (templateId: string) => `${BASE}/templates/${templateId}`,
  },

  extension: {
    scrapeQueue: `${BASE}/extension/scrape-queue`,
  },

  projects: {
    createTopic: (projectId: string) => `${BASE}/projects/${projectId}/topics`,
    listTopics: (projectId: string) => `${BASE}/projects/${projectId}/topics`,
  },

  topic: (topicId: string) => ({
    state: `${BASE}/topics/${topicId}`,
    run: `${BASE}/topics/${topicId}/run`,
    search: `${BASE}/topics/${topicId}/search`,
    scrape: `${BASE}/topics/${topicId}/scrape`,
    analyzeAll: `${BASE}/topics/${topicId}/analyze-all`,
    rankAuthority: `${BASE}/topics/${topicId}/sources/rank-authority`,
    synthesize: `${BASE}/topics/${topicId}/synthesize`,
    costs: `${BASE}/topics/${topicId}/costs`,
    links: `${BASE}/topics/${topicId}/links`,

    keywords: {
      add: `${BASE}/topics/${topicId}/keywords`,
    },

    sources: {
      rescrape: (sourceId: string) =>
        `${BASE}/topics/${topicId}/sources/${sourceId}/rescrape`,
      content: (sourceId: string) =>
        `${BASE}/topics/${topicId}/sources/${sourceId}/content`,
      analyze: (sourceId: string) =>
        `${BASE}/topics/${topicId}/sources/${sourceId}/analyze`,
      suggestTags: (sourceId: string) =>
        `${BASE}/topics/${topicId}/sources/${sourceId}/suggest-tags`,
      transcribe: (sourceId: string) =>
        `${BASE}/topics/${topicId}/sources/${sourceId}/transcribe`,
      extensionContent: (sourceId: string) =>
        `${BASE}/topics/${topicId}/sources/${sourceId}/extension-content`,
      markComplete: (sourceId: string) =>
        `${BASE}/topics/${topicId}/sources/${sourceId}/mark-complete`,
      verdict: (sourceId: string) =>
        `${BASE}/topics/${topicId}/sources/${sourceId}/verdict`,
      upload: `${BASE}/topics/${topicId}/sources/upload`,
    },

    content: {
      edit: (contentId: string) =>
        `${BASE}/topics/${topicId}/content/${contentId}`,
      paste: (sourceId: string) =>
        `${BASE}/topics/${topicId}/sources/${sourceId}/content`,
    },

    tags: {
      consolidate: (tagId: string) =>
        `${BASE}/topics/${topicId}/tags/${tagId}/consolidate`,
    },

    document: {
      generate: `${BASE}/topics/${topicId}/document`,
    },

    linksAddToScope: `${BASE}/topics/${topicId}/links/add-to-scope`,

    analyses: {
      retry: (analysisId: string) =>
        `${BASE}/topics/${topicId}/analyses/${analysisId}/retry`,
      retryFailed: `${BASE}/topics/${topicId}/retry-failed`,
    },
  }),
} as const;
