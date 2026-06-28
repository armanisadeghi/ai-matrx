"use client";
import React, { useMemo, useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { convertOrganizedDataToString } from "../../utils/scraper-utils";
import PageHeader from "./PageHeader";
import ContentTabs from "./ContentTabs";
import OrganizedContent from "../OrganizedContent";
import SimplifiedView from "../SimplifiedView";
import StructuredData from "../StructuredData";
import TextContent from "../TextContent";
import MetadataContent from "../MetadataContent";
import RemovalDetails from "../RemovalDetails";
import HashesContent from "../HashesContent";
import RawJSON from "../RawJSON";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";
import FancyJsonExplorer from "../FancyJsonExplorer";
import BookmarkViewer from "../BookmarkViewer";
import { formatJson } from "@/utils/json/json-cleaner-utility";
import SEOAnalysisPage from "@/features/scraper/parts/SEOAnalysisPage";
import HeaderAnalysis from "../HeaderAnalysis";
import FactChecker from "../agent-analysis/FactChecker";
import KeywordAnalysis from "../agent-analysis/KeywordAnalysis";
import FeatureDisabledPlaceholder from "../reusable/FeatureDisabledPlaceholder";
import ImageGallery from "../tabs/images/ImageGallery";
import { ScrapedContentPretty } from "../ScrapedContentPretty";

interface PageContentProps {
  pageData: any;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  dataUtils: typeof import("../../utils/data-utils").default;
}

const PageContent: React.FC<PageContentProps> = ({
  pageData,
  activeTab,
  setActiveTab,
  dataUtils,
}) => {
  // State for feature toggles
  const [featureToggles, setFeatureToggles] = useState({
    keywordAnalysis: false,
    factChecker: false,
  });

  if (!pageData) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400">
        No data available for this page
      </div>
    );
  }

  // Extract data using the new ScraperDataUtils system
  const extractedData = useMemo(() => {
    try {
      // pageData is processed by ScraperDataUtils before render
      // Extract the first result for display
      const firstResult = pageData?.results?.[0];

      if (!firstResult) {
        console.error("[PAGE CONTENT] No results found in pageData:", pageData);
        return { isError: true, error: "No results found in processed data" };
      }

      // Extract all the data we need for display
      const overview = firstResult.overview || {};
      const textData = firstResult.text_data || "";
      const organizedData = firstResult.organized_data || {};
      const structuredData = firstResult.structured_data || {};
      const contentFilterDetails =
        firstResult.content_filter_removal_details || [];
      const hashes = firstResult.hashes || [];
      const links = firstResult.links || {};
      const mainImage = firstResult.main_image;
      const scrapedAt = firstResult.scraped_at;
      const status = firstResult.status;
      const error = firstResult.error;
      const markdownRenderable =
        typeof firstResult.markdown_renderable === "string"
          ? firstResult.markdown_renderable
          : "";

      // Process organized data for removal details display
      const allRemovals = contentFilterDetails.map((item) => ({
        ...item,
        remover: "Content Filter",
      }));

      const images = links.images || [];

      if (scrapedAt) {
        console.log(
          "[PAGE CONTENT] Scraped at timestamp TODO: Create ScrapedAtInfo component:",
        );
        // TODO: Create ScrapedAtInfo component
      }

      // TODO: Create component for main_image display if not in images
      if (mainImage && !images.includes(mainImage)) {
        console.log(
          "[PAGE CONTENT] Main image not in images list TODO: Create MainImageDisplay component:",
        );
        // TODO: Create MainImageDisplay component
      }

      // TODO: Create components for different link types
      Object.keys(links).forEach((linkType) => {
        if (
          linkType !== "images" &&
          links[linkType] &&
          links[linkType].length > 0
        ) {
          console.log(
            `[PAGE CONTENT] ${linkType} links TODO: Create LinkDisplay component for each type:`,
          );
          // TODO: Create LinkDisplay component for each type
        }
      });

      return {
        isError: false,
        statusValue: status,
        overview,
        textData,
        organizedData,
        structuredData,
        contentFilterDetails,
        hashes,
        allRemovals,
        contentOutline: overview?.outline || {},
        links,
        images,
        mainImage,
        scrapedAt,
        error,
        markdownRenderable,
      };
    } catch (error) {
      console.error("[PAGE CONTENT] Error extracting data:", error);
      return {
        isError: true,
        error: `Error extracting data: ${error.message}`,
      };
    }
  }, [pageData, dataUtils]);

  if (extractedData.isError) {
    return (
      <Alert className="m-4">
        <AlertDescription>{extractedData.error}</AlertDescription>
      </Alert>
    );
  }

  const {
    statusValue,
    overview,
    textData,
    organizedData,
    structuredData,
    allRemovals,
    hashes,
    contentOutline,
    images,
  } = extractedData;

  const value = useMemo(
    () => convertOrganizedDataToString(organizedData),
    [organizedData],
  );

  // Function to enable a specific feature when requested from the placeholder
  const enableFeature = (feature) => {
    setFeatureToggles((prev) => ({
      ...prev,
      [feature]: true,
    }));
  };

  return (
    <div className="h-full flex flex-col w-full bg-textured">
      <div className="flex-1 min-h-0 flex flex-col max-w-full px-2 sm:px-4 lg:px-6 py-4">
        <PageHeader
          title={overview?.page_title}
          url={overview?.url}
          status={statusValue}
          featureToggles={featureToggles}
          setFeatureToggles={setFeatureToggles}
        />
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <ContentTabs activeTab={activeTab} setActiveTab={setActiveTab} />
          <div className="flex-1 overflow-auto bg-textured rounded-xl shadow-md border-border">
            <TabsContent value="pretty" className="m-0 h-full overflow-auto">
              <div className="mx-auto max-w-4xl p-4">
                <div className="rounded-lg border border-border">
                  <ScrapedContentPretty
                    markdown={extractedData.markdownRenderable ?? ""}
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="reader" className="m-0 h-full overflow-auto">
              <SimplifiedView pageData={extractedData} />
            </TabsContent>
            <TabsContent value="organized" className="m-0 h-full overflow-auto">
              <OrganizedContent organizedData={organizedData} />
            </TabsContent>
            <TabsContent
              value="structured"
              className="m-0 h-full overflow-auto"
            >
              <StructuredData structuredData={structuredData} />
            </TabsContent>
            <TabsContent value="images" className="m-0 h-full overflow-auto">
              <ImageGallery imageUrls={images} />
            </TabsContent>
            <TabsContent value="text" className="m-0 h-full overflow-auto">
              <TextContent textData={textData} />
            </TabsContent>
            <TabsContent value="metadata" className="m-0 h-full overflow-auto">
              <MetadataContent overview={overview} />
            </TabsContent>
            <TabsContent value="removals" className="m-0 h-full overflow-auto">
              <RemovalDetails allRemovals={allRemovals} />
            </TabsContent>
            <TabsContent
              value="header-analysis"
              className="m-0 h-full overflow-auto"
            >
              <HeaderAnalysis overview={overview} />
            </TabsContent>
            <TabsContent
              value="seo-analysis"
              className="m-0 h-full overflow-auto"
            >
              <SEOAnalysisPage
                overview={overview}
                structuredData={structuredData}
              />
            </TabsContent>
            <TabsContent
              value="keyword-analysis"
              className="m-0 h-full overflow-auto"
            >
              {featureToggles.keywordAnalysis ? (
                <KeywordAnalysis value={value} overview={overview} />
              ) : (
                <FeatureDisabledPlaceholder
                  featureName="Keyword Analysis"
                  description="This feature makes API calls that may incur costs. Enable it to analyze keywords in your content."
                  onEnable={() => enableFeature("keywordAnalysis")}
                />
              )}
            </TabsContent>
            <TabsContent
              value="fact-checker"
              className="m-0 h-full overflow-auto"
            >
              {featureToggles.factChecker ? (
                <FactChecker value={value} overview={overview} />
              ) : (
                <FeatureDisabledPlaceholder
                  featureName="Fact Checker"
                  description="This feature makes API calls that may incur costs. Enable it to check facts in your content."
                  onEnable={() => enableFeature("factChecker")}
                />
              )}
            </TabsContent>

            <TabsContent value="hashes" className="m-0 h-full overflow-auto">
              <HashesContent hashes={hashes} />
            </TabsContent>
            <TabsContent value="raw" className="m-0 h-full overflow-auto">
              <RawJSON pageData={pageData} />
            </TabsContent>
            <TabsContent
              value="raw-explorer"
              className="m-0 h-full overflow-auto"
            >
              <RawJsonExplorer pageData={pageData} />
            </TabsContent>
            <TabsContent
              value="fancy-json-explorer"
              className="m-0 h-full overflow-auto"
            >
              <FancyJsonExplorer pageData={pageData} />
            </TabsContent>
            <TabsContent
              value="bookmark-viewer"
              className="m-0 h-full overflow-auto"
            >
              <BookmarkViewer pageData={pageData} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default PageContent;
