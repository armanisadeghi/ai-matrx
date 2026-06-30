import { useState, useEffect, useCallback } from "react";
import { OrderBy, Orientation, Plus } from "unsplash-js";
import { SearchOrderBy } from "unsplash-js/dist/methods/search/types/request";
import { unsplashClient } from "./unsplashClient";

// Our simple types
export type SortOrder =
  | "latest"
  | "popular"
  | "relevant"
  | "oldest"
  | "views"
  | "downloads";
export type ImageOrientation =
  | "landscape"
  | "portrait"
  | "squarish"
  | undefined;
export type PremiumFilter = "mixed" | "only" | "none";

/** Minimal Unsplash photo shape used by this hook */
export type UnsplashPhoto = {
  id: string;
  tags?: Array<{ title: string }>;
  links: { download_location: string };
};

type UnsplashCollection = {
  id: string;
};

type UnsplashTopic = {
  id: string;
};

// Type conversion helpers
const mapSortOrderToOrderBy = (sort?: SortOrder): OrderBy => {
  if (!sort) return OrderBy.LATEST;
  switch (sort) {
    case "latest":
      return OrderBy.LATEST;
    case "oldest":
      return OrderBy.OLDEST;
    case "popular":
      return OrderBy.POPULAR;
    case "views":
      return OrderBy.VIEWS;
    case "downloads":
      return OrderBy.DOWNLOADS;
    default:
      return OrderBy.LATEST;
  }
};

const mapSortOrderToSearchOrderBy = (sort?: SortOrder): SearchOrderBy => {
  if (!sort) return "relevant";
  switch (sort) {
    case "relevant":
      return "relevant";
    case "latest":
      return "latest";
    // SearchOrderBy only supports 'latest', 'relevant', and 'editorial'
    case "popular":
    case "oldest":
    default:
      return "relevant"; // Default to latest for unsupported options
  }
};

// Mapping constants
const UNSPLASH_TOPICS = [
  "animals",
  "athletics",
  "architecture",
  "arts & culture",
  "business & work",
  "current events",
  "experimental",
  "fashion",
  "film",
  "food & drink",
  "health & wellness",
  "history",
  "interiors",
  "nature",
  "people",
  "spirituality",
  "technology",
  "textures and patterns",
  "travel",
  "wallpapers",
];

// Routes every call through `/api/unsplash` so the access key stays
// server-side. Same `{ type, response, errors }` envelope as `unsplash-js`,
// so the rest of this hook needs no other changes.
const unsplash = unsplashClient;

export function useUnsplashGallery() {
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<UnsplashPhoto | null>(null);
  const [relatedPhotos, setRelatedPhotos] = useState<UnsplashPhoto[]>([]);
  const [favorites, setFavorites] = useState<UnsplashPhoto[]>([]);
  const [fetchType, setFetchType] = useState("search");
  const [fetchParam, setFetchParam] = useState("");
  const [collections, setCollections] = useState<UnsplashCollection[]>([]);
  const [topics, setTopics] = useState<UnsplashTopic[]>([]);

  // Simple parameters
  const [sortOrder, setSortOrder] = useState<SortOrder>("relevant");
  const [orientation, setOrientation] = useState<ImageOrientation>(undefined);
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>("none");

  // Search photos with our simple parameters
  const searchPhotos = useCallback(
    async (
      searchQuery: string,
      pageNum: number,
      options: {
        sortOrder?: SortOrder;
        orientation?: ImageOrientation;
        premiumFilter?: PremiumFilter;
      } = {},
    ) => {
      setLoading(true);

      // Use provided options or fallback to current state
      const finalSortOrder = options.sortOrder || sortOrder;
      const finalOrientation = options.orientation || orientation;
      const finalPremiumFilter = options.premiumFilter || premiumFilter;

      // Pass our simple types to Unsplash API with conversion
      const result = await unsplash.search.getPhotos({
        query: searchQuery || "nature",
        page: pageNum,
        perPage: 15,
        orderBy: mapSortOrderToSearchOrderBy(finalSortOrder),
        orientation: finalOrientation as Orientation,
        plus: finalPremiumFilter as Plus,
      });

      if (result.type === "success") {
        if (pageNum === 1) {
          setPhotos(result.response.results);
        } else {
          setPhotos((prev) => [...prev, ...result.response.results]);
        }
        setHasMore(result.response.results.length > 0);
      } else {
        console.error("Search failed:", result.errors);
      }
      setLoading(false);
    },
    [sortOrder, orientation, premiumFilter],
  );

  // Fetch recent photos
  const fetchRecentPhotos = useCallback(
    async (pageNum: number, options: { sortOrder?: SortOrder } = {}) => {
      setLoading(true);

      // Use provided sortOrder or fallback to current state
      const finalSortOrder = options.sortOrder || sortOrder;

      const result = await unsplash.photos.list({
        page: pageNum,
        perPage: 15,
        orderBy: mapSortOrderToOrderBy(finalSortOrder),
      });

      if (result.type === "success") {
        if (pageNum === 1) {
          setPhotos(result.response.results);
        } else {
          setPhotos((prev) => [...prev, ...result.response.results]);
        }
        setHasMore(result.response.results.length > 0);
      } else {
        console.error("Fetch recent photos failed:", result.errors);
      }
      setLoading(false);
    },
    [sortOrder],
  );

  // Search collections
  const searchCollections = useCallback(
    async (searchQuery: string, pageNum: number) => {
      setLoading(true);

      const result = await unsplash.search.getCollections({
        query: searchQuery || "nature",
        page: pageNum,
        perPage: 15,
      });

      if (result.type === "success") {
        if (pageNum === 1) {
          setCollections(result.response.results);
        } else {
          setCollections((prev) => [...prev, ...result.response.results]);
        }
        setHasMore(result.response.results.length > 0);
      } else {
        console.error("Search collections failed:", result.errors);
      }
      setLoading(false);
    },
    [],
  );

  // List collections
  const fetchCollections = useCallback(async (pageNum: number) => {
    setLoading(true);

    const result = await unsplash.collections.list({
      page: pageNum,
      perPage: 15,
    });

    if (result.type === "success") {
      if (pageNum === 1) {
        setCollections(result.response.results);
      } else {
        setCollections((prev) => [...prev, ...result.response.results]);
      }
      setHasMore(result.response.results.length > 0);
    } else {
      console.error("Fetch collections failed:", result.errors);
    }
    setLoading(false);
  }, []);

  // Get collection photos
  const fetchCollectionPhotos = useCallback(
    async (
      collectionId: string,
      pageNum: number,
      options: {
        sortOrder?: SortOrder;
        orientation?: ImageOrientation;
      } = {},
    ) => {
      setLoading(true);

      // Use provided options or fallback to current state
      const finalSortOrder = options.sortOrder || sortOrder;
      const finalOrientation = options.orientation || orientation;

      const result = await unsplash.collections.getPhotos({
        collectionId,
        page: pageNum,
        perPage: 15,
        orderBy: mapSortOrderToOrderBy(finalSortOrder),
        orientation: finalOrientation as Orientation,
      });

      if (result.type === "success") {
        if (pageNum === 1) {
          setPhotos(result.response.results);
        } else {
          setPhotos((prev) => [...prev, ...result.response.results]);
        }
        setHasMore(result.response.results.length > 0);
      } else {
        console.error("Fetch collection photos failed:", result.errors);
      }
      setLoading(false);
    },
    [sortOrder, orientation],
  );

  // Fetch by topic
  const fetchTopicPhotos = useCallback(
    async (
      topic: string,
      pageNum: number,
      options: {
        sortOrder?: SortOrder;
        orientation?: ImageOrientation;
      } = {},
    ) => {
      setLoading(true);

      // Use provided options or fallback to current state
      const finalSortOrder = options.sortOrder || sortOrder;
      const finalOrientation = options.orientation || orientation;

      const result = await unsplash.topics.getPhotos({
        topicIdOrSlug: topic,
        page: pageNum,
        perPage: 15,
        orderBy: mapSortOrderToOrderBy(finalSortOrder),
        orientation: finalOrientation as Orientation,
      });

      if (result.type === "success") {
        if (pageNum === 1) {
          setPhotos(result.response.results);
        } else {
          setPhotos((prev) => [...prev, ...result.response.results]);
        }
        setHasMore(result.response.results.length > 0);
      } else {
        console.error("Fetch topic photos failed:", result.errors);
      }
      setLoading(false);
    },
    [sortOrder, orientation],
  );

  // List all topics
  const fetchTopics = useCallback(async (pageNum: number) => {
    setLoading(true);

    const result = await unsplash.topics.list({
      page: pageNum,
      perPage: 30,
    });

    if (result.type === "success") {
      if (pageNum === 1) {
        setTopics(result.response.results);
      } else {
        setTopics((prev) => [...prev, ...result.response.results]);
      }
      setHasMore(result.response.results.length > 0);
    } else {
      console.error("Fetch topics failed:", result.errors);
    }
    setLoading(false);
  }, []);

  // Main effect to load photos based on current state
  useEffect(() => {
    if (fetchType === "search" && query) {
      searchPhotos(query, 1, {
        sortOrder,
        orientation,
        premiumFilter,
      });
    } else if (fetchType === "recent") {
      fetchRecentPhotos(1, { sortOrder });
    } else if (fetchType === "topic" && fetchParam) {
      fetchTopicPhotos(fetchParam, 1, {
        sortOrder,
        orientation,
      });
    } else if (fetchType === "collection" && fetchParam) {
      fetchCollectionPhotos(fetchParam, 1, {
        sortOrder,
        orientation,
      });
    } else if (fetchType === "searchCollections" && query) {
      searchCollections(query, 1);
    } else if (fetchType === "collections") {
      fetchCollections(1);
    } else if (fetchType === "topics") {
      fetchTopics(1);
    }
  }, [
    query,
    fetchType,
    fetchParam,
    sortOrder,
    orientation,
    premiumFilter,
    searchPhotos,
    fetchRecentPhotos,
    fetchTopicPhotos,
    fetchCollectionPhotos,
    searchCollections,
    fetchCollections,
    fetchTopics,
  ]);

  // Simple handlers with our types
  const handleSearch = useCallback(
    (
      newQuery: string,
      options: {
        sortOrder?: SortOrder;
        orientation?: ImageOrientation;
        premiumFilter?: PremiumFilter;
      } = {},
    ) => {
      setQuery(newQuery);
      setFetchType("search");
      setFetchParam("");
      setPage(1);

      // Update states from options if provided
      if (options.sortOrder) setSortOrder(options.sortOrder);
      if (options.orientation !== undefined)
        setOrientation(options.orientation);
      if (options.premiumFilter) setPremiumFilter(options.premiumFilter);

      searchPhotos(newQuery, 1, options);
    },
    [searchPhotos],
  );

  const handleRecentPhotos = useCallback(
    (options: { sortOrder?: SortOrder } = {}) => {
      setFetchType("recent");
      setFetchParam("");
      setQuery("");
      setPage(1);

      if (options.sortOrder) setSortOrder(options.sortOrder);

      fetchRecentPhotos(1, options);
    },
    [fetchRecentPhotos],
  );

  const handleTopicPhotos = useCallback(
    (
      topic: string,
      options: {
        sortOrder?: SortOrder;
        orientation?: ImageOrientation;
      } = {},
    ) => {
      setFetchType("topic");
      setFetchParam(topic);
      setQuery("");
      setPage(1);

      if (options.sortOrder) setSortOrder(options.sortOrder);
      if (options.orientation !== undefined)
        setOrientation(options.orientation);

      fetchTopicPhotos(topic, 1, options);
    },
    [fetchTopicPhotos],
  );

  const handleCollectionPhotos = useCallback(
    (
      collectionId: string,
      options: {
        sortOrder?: SortOrder;
        orientation?: ImageOrientation;
      } = {},
    ) => {
      setFetchType("collection");
      setFetchParam(collectionId);
      setQuery("");
      setPage(1);

      if (options.sortOrder) setSortOrder(options.sortOrder);
      if (options.orientation !== undefined)
        setOrientation(options.orientation);

      fetchCollectionPhotos(collectionId, 1, options);
    },
    [fetchCollectionPhotos],
  );

  const handleSearchCollections = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);
      setFetchType("searchCollections");
      setFetchParam("");
      setPage(1);

      searchCollections(newQuery, 1);
    },
    [searchCollections],
  );

  const handleListCollections = useCallback(() => {
    setFetchType("collections");
    setFetchParam("");
    setQuery("");
    setPage(1);

    fetchCollections(1);
  }, [fetchCollections]);

  const handleListTopics = useCallback(() => {
    setFetchType("topics");
    setFetchParam("");
    setQuery("");
    setPage(1);

    fetchTopics(1);
  }, [fetchTopics]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);

      if (fetchType === "search") {
        searchPhotos(query, nextPage, {
          sortOrder,
          orientation,
          premiumFilter,
        });
      } else if (fetchType === "recent") {
        fetchRecentPhotos(nextPage, { sortOrder });
      } else if (fetchType === "topic") {
        fetchTopicPhotos(fetchParam, nextPage, {
          sortOrder,
          orientation,
        });
      } else if (fetchType === "collection") {
        fetchCollectionPhotos(fetchParam, nextPage, {
          sortOrder,
          orientation,
        });
      } else if (fetchType === "searchCollections") {
        searchCollections(query, nextPage);
      } else if (fetchType === "collections") {
        fetchCollections(nextPage);
      } else if (fetchType === "topics") {
        fetchTopics(nextPage);
      }
    }
  }, [
    loading,
    hasMore,
    page,
    query,
    fetchType,
    fetchParam,
    sortOrder,
    orientation,
    premiumFilter,
    searchPhotos,
    fetchRecentPhotos,
    fetchTopicPhotos,
    fetchCollectionPhotos,
    searchCollections,
    fetchCollections,
    fetchTopics,
  ]);

  const handlePhotoClick = async (photo: UnsplashPhoto) => {
    setSelectedPhoto(photo);

    if (photo.tags && photo.tags.length > 0) {
      const tag = photo.tags[0].title;
      const result = await unsplash.search.getPhotos({
        query: tag,
        page: 1,
        perPage: 5,
        orderBy: mapSortOrderToSearchOrderBy(sortOrder),
        orientation: orientation as Orientation,
        plus: premiumFilter as Plus,
      });

      if (result.type === "success") {
        setRelatedPhotos(
          result.response.results.filter((p) => p.id !== photo.id),
        );
      }
    } else {
      setRelatedPhotos([]);
    }
  };

  const closePhotoView = () => {
    setSelectedPhoto(null);
    setRelatedPhotos([]);
  };

  const toggleFavorite = (photo: UnsplashPhoto) => {
    setFavorites((prev) =>
      prev.some((fav) => fav.id === photo.id)
        ? prev.filter((fav) => fav.id !== photo.id)
        : [...prev, photo],
    );
  };

  const downloadImage = async (photo: UnsplashPhoto) => {
    const response = await fetch(photo.links.download_location);
    const data = await response.json();
    window.open(data.url, "_blank");
  };

  return {
    photos,
    loading,
    hasMore,
    selectedPhoto,
    relatedPhotos,
    favorites,
    collections,
    topics,

    // Handler functions for various operations
    handleSearch,
    loadMore,
    handlePhotoClick,
    closePhotoView,
    toggleFavorite,
    downloadImage,
    handleRecentPhotos,
    handleTopicPhotos,
    handleCollectionPhotos,
    handleSearchCollections,
    handleListCollections,
    handleListTopics,

    // Predefined topic list (static)
    predefinedTopics: UNSPLASH_TOPICS,

    // Expose simple options for UI
    sortOrderOptions: [
      "relevant",
      "latest",
      "popular",
      "oldest",
    ] as SortOrder[],
    orientationOptions: [
      "landscape",
      "portrait",
      "squarish",
    ] as ImageOrientation[],
    premiumFilterOptions: ["mixed", "only", "none"] as PremiumFilter[],

    // Current settings
    currentSortOrder: sortOrder,
    currentOrientation: orientation,
    currentPremiumFilter: premiumFilter,

    // Setter methods for individual options
    setSortOrder,
    setOrientation,
    setPremiumFilter,

    // Current state info for UI
    currentFetchType: fetchType,
  };
}
