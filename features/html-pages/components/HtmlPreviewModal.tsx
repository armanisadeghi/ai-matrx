"use client";

// TODO: Fix loading inefficiency.

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Copy,
  CheckCircle2,
  Eye,
  FileCode,
  Globe,
  Settings,
  Save,
  ExternalLink,
  Loader2,
  Edit,
  ChevronDown,
  ChevronRight,
  Code2,
} from "lucide-react";
import { useHTMLPages } from "@/features/html-pages/hooks/useHTMLPages";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  useSaveAndOpenInCodeEditor,
  CHAT_CAPTURES_FOLDER_NAME,
} from "@/features/code/actions/saveAndOpenInCodeEditor";
import {
  copyToClipboard,
  removeThinkingContent,
} from "@/components/matrx/buttons/markdown-copy-utils";
import {
  getWordPressCSS,
  loadWordPressCSS,
} from "@/features/html-pages/css/wordpress-styles";
import SmallCodeEditor from "@/features/code-editor/components/code-block/SmallCodeEditor";
import { ImageAssetUploader } from "@/components/official/ImageAssetUploader";
import { CloudFolders } from "@/features/files";
import { Checkbox } from "@/components/ui/checkbox";

interface HtmlPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  htmlContent: string;
  title?: string;
}

export default function HtmlPreviewModal({
  isOpen,
  onClose,
  htmlContent,
  title = "HTML Preview",
}: HtmlPreviewModalProps) {
  const [copied, setCopied] = useState(false);
  const [copiedNoBullets, setCopiedNoBullets] = useState(false);
  const [copiedCSS, setCopiedCSS] = useState(false);
  const [copiedComplete, setCopiedComplete] = useState(false);
  const [copiedCustom, setCopiedCustom] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "preview" | "html" | "css" | "complete" | "custom" | "save" | "edit"
  >("preview");
  const [editedCompleteHtml, setEditedCompleteHtml] = useState<string>("");
  const [wordPressCSS, setWordPressCSS] = useState<string>("");

  // Custom copy options
  const [includeBulletStyles, setIncludeBulletStyles] = useState(true);
  const [includeDecorativeLineBreaks, setIncludeDecorativeLineBreaks] =
    useState(true);

  // HTML Pages system (gracefully handle missing Redux provider)
  let user: any = null;
  let hasReduxProvider = true;
  try {
    user = useAppSelector(selectUser);
  } catch (error) {
    // Expected in public context without Redux provider
    hasReduxProvider = false;
    console.warn(
      "[HtmlPreviewModal] Redux provider not found, HTML page features disabled",
    );
  }

  // useHTMLPages doesn't use Redux, so it's safe to call unconditionally
  const { createHTMLPage, isCreating, error, clearError } = useHTMLPages(
    user?.id,
  );
  const [savedPage, setSavedPage] = useState<any>(null);
  const [pageTitle, setPageTitle] = useState<string>("");
  const [pageDescription, setPageDescription] = useState<string>("");
  const [metaTitle, setMetaTitle] = useState<string>("");
  const [metaDescription, setMetaDescription] = useState<string>("");
  const [metaKeywords, setMetaKeywords] = useState<string>("");
  const [ogImage, setOgImage] = useState<string>("");
  const [canonicalUrl, setCanonicalUrl] = useState<string>("");
  const [showAdvancedMeta, setShowAdvancedMeta] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cssTextareaRef = useRef<HTMLTextAreaElement>(null);
  const completeTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize edited complete HTML when modal opens
  useEffect(() => {
    if (isOpen && htmlContent && wordPressCSS) {
      const completeHtml = generateCompleteHTML();
      setEditedCompleteHtml(completeHtml);
    }
  }, [isOpen, htmlContent, wordPressCSS]);

  // Reset edited complete HTML when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEditedCompleteHtml("");
    }
  }, [isOpen]);

  // Load WordPress CSS for accurate preview
  useEffect(() => {
    const loadCSS = async () => {
      const cssContent = await loadWordPressCSS();
      setWordPressCSS(cssContent);
    };

    if (isOpen) {
      loadCSS();
    }
  }, [isOpen]);

  // Generate complete HTML with CSS
  const generateCompleteHTML = () => {
    // Extract title from HTML content (H1 first, then H2, fallback to generic)
    const extractedTitle = extractTitleFromHTML(htmlContent);
    const pageTitle = extractedTitle || "WordPress Content";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>${pageTitle}</title>
    <style>
html, body {
    background-color: #ffffff;
    color: #1a1a1a;
    color-scheme: light;
}
${wordPressCSS}
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;
  };

  // Get the current HTML content (edited version if available, otherwise original)
  const getCurrentHtmlContent = () => {
    return editedCompleteHtml || generateCompleteHTML();
  };

  // Extract just the body content from complete HTML for preview
  const extractBodyContent = (completeHtml: string) => {
    const match = completeHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match ? match[1] : htmlContent;
  };

  // SEO helper functions
  const getCharacterCountStatus = (
    text: string,
    ideal: number,
    max: number,
  ) => {
    const length = text.length;
    if (length === 0) return { status: "empty", color: "text-gray-400" };
    if (length <= ideal)
      return { status: "good", color: "text-green-600 dark:text-green-400" };
    if (length <= max)
      return {
        status: "warning",
        color: "text-yellow-600 dark:text-yellow-400",
      };
    return { status: "error", color: "text-red-600 dark:text-red-400" };
  };

  const getSEORecommendation = (text: string, field: string) => {
    const length = text.length;
    switch (field) {
      case "title":
        if (length === 0) return "Page title is required";
        if (length < 30) return "Consider a longer, more descriptive title";
        if (length > 60) return "Title may be truncated in search results";
        return "Good title length";
      case "description":
        if (length === 0) return "Description helps with SEO";
        if (length < 120) return "Consider a longer description";
        if (length > 160) return "Description may be truncated";
        return "Good description length";
      case "metaTitle":
        if (length === 0) return "Will use page title if empty";
        if (length < 30) return "Consider a longer meta title";
        if (length > 60) return "Meta title may be truncated";
        return "Good meta title length";
      case "metaDescription":
        if (length === 0) return "Will use page description if empty";
        if (length < 120) return "Consider a longer meta description";
        if (length > 160) return "Meta description may be truncated";
        return "Good meta description length";
      default:
        return "";
    }
  };

  // Function to extract title from HTML content
  const extractTitleFromHTML = (htmlContent: string): string => {
    try {
      // Create a temporary DOM element to parse the HTML
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = htmlContent;

      // Look for H1 first
      const h1 = tempDiv.querySelector("h1");
      if (h1 && h1.textContent?.trim()) {
        return h1.textContent.trim();
      }

      // If no H1, look for H2
      const h2 = tempDiv.querySelector("h2");
      if (h2 && h2.textContent?.trim()) {
        return h2.textContent.trim();
      }

      // Return empty string if no heading found
      return "";
    } catch (error) {
      console.error("Error extracting title from HTML:", error);
      return "";
    }
  };

  // Function to extract description from HTML content
  const extractDescriptionFromHTML = (htmlContent: string): string => {
    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = htmlContent;

      // Find the first heading (H1 or H2)
      let firstHeading = tempDiv.querySelector("h1");
      if (!firstHeading) {
        firstHeading = tempDiv.querySelector("h2");
      }

      if (firstHeading) {
        // Look for the first <p> element that comes after the heading
        let nextElement = firstHeading.nextElementSibling;
        while (nextElement) {
          if (nextElement.tagName === "P" && nextElement.textContent?.trim()) {
            // Get the first sentence from the paragraph
            const fullText = nextElement.textContent.trim();
            const firstSentence = fullText.split(/[.!?]/)[0];
            return (
              firstSentence.trim() +
              (firstSentence.length < fullText.length ? "." : "")
            );
          }
          nextElement = nextElement.nextElementSibling;
        }
      } else {
        // If no heading found, just get the first <p> element
        const firstP = tempDiv.querySelector("p");
        if (firstP && firstP.textContent?.trim()) {
          const fullText = firstP.textContent.trim();
          const firstSentence = fullText.split(/[.!?]/)[0];
          return (
            firstSentence.trim() +
            (firstSentence.length < fullText.length ? "." : "")
          );
        }
      }

      return "";
    } catch (error) {
      console.error("Error extracting description from HTML:", error);
      return "";
    }
  };

  // Auto-populate title and description when Save Page tab is activated
  useEffect(() => {
    if (activeTab === "save" && !pageTitle && !pageDescription) {
      const currentCompleteHtml = getCurrentHtmlContent();
      const bodyContent = extractBodyContent(currentCompleteHtml);
      if (bodyContent) {
        const extractedTitle = extractTitleFromHTML(bodyContent);
        const extractedDescription = extractDescriptionFromHTML(bodyContent);

        if (extractedTitle) {
          setPageTitle(extractedTitle);
          // Auto-populate meta title if empty
          if (!metaTitle) {
            setMetaTitle(extractedTitle);
          }
        }
        if (extractedDescription) {
          setPageDescription(extractedDescription);
          // Auto-populate meta description if empty
          if (!metaDescription) {
            setMetaDescription(extractedDescription);
          }
        }
      }
    }
  }, [
    activeTab,
    pageTitle,
    pageDescription,
    editedCompleteHtml,
    metaTitle,
    metaDescription,
  ]);

  if (!isOpen) return null;

  // Note: CSS now loaded from centralized source

  const stripBulletStyles = (html: string) => {
    return html.replace(/class="matrx-list-item"/g, "");
  };

  const stripDecorativeLineBreaks = (html: string) => {
    return html.replace(/<hr class="matrx-hr"[^>]*>/g, "");
  };

  const applyCustomOptions = (html: string) => {
    let processedHtml = html;

    if (!includeBulletStyles) {
      processedHtml = stripBulletStyles(processedHtml);
    }

    if (!includeDecorativeLineBreaks) {
      processedHtml = stripDecorativeLineBreaks(processedHtml);
    }

    return processedHtml;
  };

  const handleCopyHtml = async () => {
    const currentCompleteHtml = getCurrentHtmlContent();
    const bodyContent = extractBodyContent(currentCompleteHtml);
    await copyToClipboard(bodyContent, {
      onSuccess: () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      onError: (err) => console.error("Failed to copy HTML:", err),
    });
  };

  const handleCopyHtmlNoBullets = async () => {
    const currentCompleteHtml = getCurrentHtmlContent();
    const bodyContent = extractBodyContent(currentCompleteHtml);
    const noBulletsHtml = stripBulletStyles(bodyContent);
    await copyToClipboard(noBulletsHtml, {
      onSuccess: () => {
        setCopiedNoBullets(true);
        setTimeout(() => setCopiedNoBullets(false), 2000);
      },
      onError: (err) =>
        console.error("Failed to copy HTML without bullet styles:", err),
    });
  };

  const handleCopyCSS = async () => {
    await copyToClipboard(wordPressCSS, {
      onSuccess: () => {
        setCopiedCSS(true);
        setTimeout(() => setCopiedCSS(false), 2000);
      },
      onError: (err) => console.error("Failed to copy CSS:", err),
    });
  };

  const handleCopyComplete = async () => {
    const completeHTML = getCurrentHtmlContent();
    await copyToClipboard(completeHTML, {
      onSuccess: () => {
        setCopiedComplete(true);
        setTimeout(() => setCopiedComplete(false), 2000);
      },
      onError: (err) => console.error("Failed to copy complete HTML:", err),
    });
  };

  const handleCopyCustom = async () => {
    const currentCompleteHtml = getCurrentHtmlContent();
    const bodyContent = extractBodyContent(currentCompleteHtml);
    const customHTML = applyCustomOptions(bodyContent);
    await copyToClipboard(customHTML, {
      onSuccess: () => {
        setCopiedCustom(true);
        setTimeout(() => setCopiedCustom(false), 2000);
      },
      onError: (err) => console.error("Failed to copy custom HTML:", err),
    });
  };

  const handleCopyUrl = async (url: string) => {
    await copyToClipboard(url, {
      onSuccess: () => {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 1500);
      },
      onError: (err) => console.error("Failed to copy URL:", err),
    });
  };

  // HTML Page save handlers
  const handleSavePage = async () => {
    if (!pageTitle.trim()) {
      alert("Please enter a page title before saving");
      return;
    }

    if (!user?.id) {
      alert("You must be logged in to save HTML pages");
      return;
    }

    try {
      clearError();

      // Get current complete HTML and filter thinking content from body
      const currentCompleteHtml = getCurrentHtmlContent();
      const bodyContent = extractBodyContent(currentCompleteHtml);
      const filteredBodyContent = removeThinkingContent(bodyContent);

      // Reconstruct complete HTML with filtered body content
      const completeHTML = currentCompleteHtml.replace(
        /<body[^>]*>[\s\S]*?<\/body>/i,
        `<body>\n    ${filteredBodyContent}\n</body>`,
      );

      // Prepare meta fields
      const metaFields = {
        metaTitle: metaTitle.trim() || pageTitle.trim(),
        metaDescription: metaDescription.trim() || pageDescription.trim(),
        metaKeywords: metaKeywords.trim() || null,
        ogImage: ogImage.trim() || null,
        canonicalUrl: canonicalUrl.trim() || null,
      };

      const result = await createHTMLPage(
        completeHTML,
        pageTitle.trim(),
        pageDescription.trim(),
        metaFields,
      );
      setSavedPage(result);

      // Clear form after successful save
      setPageTitle("");
      setPageDescription("");
      setMetaTitle("");
      setMetaDescription("");
      setMetaKeywords("");
      setOgImage("");
      setCanonicalUrl("");

      console.log("Page saved successfully:", result);
    } catch (err) {
      console.error("Save failed:", err);
      alert(`Save failed: ${err.message}`);
    }
  };

  const handleSelectAll = () => {
    if (textareaRef.current) {
      textareaRef.current.select();
      textareaRef.current.setSelectionRange(0, 99999); // For mobile devices
    }
  };

  const handleSelectAllCSS = () => {
    if (cssTextareaRef.current) {
      cssTextareaRef.current.select();
      cssTextareaRef.current.setSelectionRange(0, 99999); // For mobile devices
    }
  };

  const handleSelectAllComplete = () => {
    if (completeTextareaRef.current) {
      completeTextareaRef.current.select();
      completeTextareaRef.current.setSelectionRange(0, 99999); // For mobile devices
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-textured rounded-lg shadow-xl max-w-[90vw] max-w-[1400px] w-full h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {hasReduxProvider && (
              <OpenInCodeEditorButton
                getContent={getCurrentHtmlContent}
                title={title}
                onOpened={onClose}
              />
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "preview"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Eye size={16} className="inline mr-1" />
              Preview
            </button>
            <button
              onClick={() => setActiveTab("html")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "html"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Copy size={16} className="inline mr-1" />
              HTML Code
            </button>
            <button
              onClick={() => setActiveTab("css")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "css"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <FileCode size={16} className="inline mr-1" />
              WordPress CSS
            </button>
            <button
              onClick={() => setActiveTab("complete")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "complete"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Globe size={16} className="inline mr-1" />
              Complete HTML
            </button>
            <button
              onClick={() => setActiveTab("custom")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "custom"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Settings size={16} className="inline mr-1" />
              Custom Copy
            </button>
            <button
              onClick={() => setActiveTab("edit")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "edit"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Edit size={16} className="inline mr-1" />
              Edit HTML
            </button>
            <button
              onClick={() => setActiveTab("save")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "save"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Save size={16} className="inline mr-1" />
              Save Page
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-4 min-h-0">
            {activeTab === "preview" ? (
              // Preview Tab
              <div className="h-full flex flex-col">
                <div className="mb-3 flex justify-end gap-2">
                  <button
                    onClick={handleCopyHtml}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                      copied
                        ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                        : "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300"
                    }`}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy HTML
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCopyHtmlNoBullets}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                      copiedNoBullets
                        ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                        : "bg-orange-100 hover:bg-orange-200 dark:bg-orange-900 dark:hover:bg-orange-800 text-orange-700 dark:text-orange-300"
                    }`}
                  >
                    {copiedNoBullets ? (
                      <>
                        <CheckCircle2 size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy HTML No Bullet Styles
                      </>
                    )}
                  </button>
                </div>
                <iframe
                  srcDoc={getCurrentHtmlContent()}
                  className="flex-1 w-full min-h-0 border border-gray-300 dark:border-gray-600 rounded-md"
                  sandbox="allow-scripts"
                  title="HTML Preview"
                  style={{ colorScheme: "light", background: "white" }}
                />
              </div>
            ) : activeTab === "html" ? (
              // HTML Code Tab
              <div className="h-full flex flex-col">
                <div className="mb-3 flex gap-2 flex-wrap">
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleCopyHtml}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                      copied
                        ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                        : "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300"
                    }`}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy HTML
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCopyHtmlNoBullets}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                      copiedNoBullets
                        ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                        : "bg-orange-100 hover:bg-orange-200 dark:bg-orange-900 dark:hover:bg-orange-800 text-orange-700 dark:text-orange-300"
                    }`}
                  >
                    {copiedNoBullets ? (
                      <>
                        <CheckCircle2 size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy HTML No Bullet Styles
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  ref={textareaRef}
                  value={extractBodyContent(getCurrentHtmlContent())}
                  readOnly
                  className="flex-1 w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-y-auto"
                />
              </div>
            ) : activeTab === "css" ? (
              // WordPress CSS Tab
              <div className="h-full flex flex-col">
                <div className="mb-3 flex justify-between items-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Copy this CSS to your WordPress theme to style the HTML
                    content
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSelectAllCSS}
                      className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={handleCopyCSS}
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                        copiedCSS
                          ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                          : "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300"
                      }`}
                    >
                      {copiedCSS ? (
                        <>
                          <CheckCircle2 size={16} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <FileCode size={16} />
                          Copy CSS
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  ref={cssTextareaRef}
                  value={wordPressCSS}
                  readOnly
                  className="flex-1 w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-y-auto"
                  placeholder="Loading CSS..."
                />
              </div>
            ) : activeTab === "custom" ? (
              // Custom Copy Tab
              <div className="h-full flex flex-col justify-center items-center">
                <div className="max-w-md w-full space-y-6">
                  <div className="text-center">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Custom Copy Options
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Select which elements to include in your copied HTML
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                    <div className="space-y-4">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={includeBulletStyles}
                          onCheckedChange={(checked) =>
                            setIncludeBulletStyles(checked === true)
                          }
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Include Bullet Styles
                          </span>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Keep custom bullet point styling in lists
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={includeDecorativeLineBreaks}
                          onCheckedChange={(checked) =>
                            setIncludeDecorativeLineBreaks(checked === true)
                          }
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Include Decorative Line Breaks
                          </span>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Keep horizontal rule separators (hr elements)
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={handleCopyCustom}
                      className={`inline-flex items-center gap-3 px-6 py-3 text-sm font-medium rounded-lg transition-colors ${
                        copiedCustom
                          ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      {copiedCustom ? (
                        <>
                          <CheckCircle2 size={18} />
                          Copied to Clipboard!
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copy Custom HTML
                        </>
                      )}
                    </button>

                    {!includeBulletStyles && !includeDecorativeLineBreaks && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        All styling options are disabled
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : activeTab === "edit" ? (
              // Edit HTML Tab
              <div className="h-full flex flex-col">
                <div className="mb-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Edit the complete HTML document. Changes will be reflected
                      in the preview and saved versions.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const completeHtml = getCurrentHtmlContent();
                        navigator.clipboard.writeText(completeHtml);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                    >
                      <Copy size={16} />
                      Copy
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                  <SmallCodeEditor
                    language="html"
                    initialCode={getCurrentHtmlContent()}
                    onChange={(newCode) => {
                      if (newCode) {
                        setEditedCompleteHtml(newCode);
                      }
                    }}
                  />
                </div>
              </div>
            ) : activeTab === "save" ? (
              // Save Page Tab
              <div className="h-full flex flex-col">
                {savedPage ? (
                  // Side-by-side layout when page is saved
                  <div className="h-full flex gap-6">
                    {/* Left side - Form and details */}
                    <div className="w-1/3 flex flex-col space-y-6 overflow-y-auto pr-4">
                      <div className="text-center">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                          Save Page
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Save to Create Public Page
                        </p>
                      </div>

                      {/* User Info */}
                      {user && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                          <div className="flex items-center gap-3">
                            <div className="text-blue-600 dark:text-blue-400 text-sm">
                              <strong>Logged in as:</strong> {user.email}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Save Form */}
                      <div className="space-y-4">
                        {/* Page Title */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Page Title *
                          </label>
                          <input
                            type="text"
                            value={pageTitle}
                            onChange={(e) => setPageTitle(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter page title"
                            disabled={!user}
                          />
                          <div className="flex justify-between items-center mt-1">
                            <span
                              className={`text-xs ${getCharacterCountStatus(pageTitle, 50, 60).color}`}
                            >
                              {pageTitle.length}/60 characters
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {getSEORecommendation(pageTitle, "title")}
                            </span>
                          </div>
                        </div>

                        {/* Page Description */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Description (optional)
                          </label>
                          <textarea
                            value={pageDescription}
                            onChange={(e) => setPageDescription(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            placeholder="Brief description (optional)"
                            rows={3}
                            disabled={!user}
                          />
                          <div className="flex justify-between items-center mt-1">
                            <span
                              className={`text-xs ${getCharacterCountStatus(pageDescription, 140, 160).color}`}
                            >
                              {pageDescription.length}/160 characters
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {getSEORecommendation(
                                pageDescription,
                                "description",
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Advanced Meta Options Toggle */}
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setShowAdvancedMeta(!showAdvancedMeta)
                            }
                            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                          >
                            {showAdvancedMeta ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronRight size={16} />
                            )}
                            Advanced SEO Options
                          </button>
                        </div>

                        {/* Advanced Meta Fields */}
                        {showAdvancedMeta && (
                          <div className="space-y-4 border-t border-border pt-4">
                            {/* Meta Title */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                SEO Meta Title
                              </label>
                              <input
                                type="text"
                                value={metaTitle}
                                onChange={(e) => setMetaTitle(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Will use page title if empty"
                                disabled={!user}
                              />
                              <div className="flex justify-between items-center mt-1">
                                <span
                                  className={`text-xs ${getCharacterCountStatus(metaTitle, 50, 60).color}`}
                                >
                                  {metaTitle.length}/60 characters
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {getSEORecommendation(metaTitle, "metaTitle")}
                                </span>
                              </div>
                            </div>

                            {/* Meta Description */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                SEO Meta Description
                              </label>
                              <textarea
                                value={metaDescription}
                                onChange={(e) =>
                                  setMetaDescription(e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                placeholder="Will use page description if empty"
                                rows={3}
                                disabled={!user}
                              />
                              <div className="flex justify-between items-center mt-1">
                                <span
                                  className={`text-xs ${getCharacterCountStatus(metaDescription, 140, 160).color}`}
                                >
                                  {metaDescription.length}/160 characters
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {getSEORecommendation(
                                    metaDescription,
                                    "metaDescription",
                                  )}
                                </span>
                              </div>
                            </div>

                            {/* Meta Keywords */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Meta Keywords (optional)
                              </label>
                              <input
                                type="text"
                                value={metaKeywords}
                                onChange={(e) =>
                                  setMetaKeywords(e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="keyword1, keyword2, keyword3"
                                disabled={!user}
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Comma-separated keywords (less important for
                                modern SEO)
                              </p>
                            </div>

                            {/* Social Share Image — drop ONE image, get 4 auto-generated sizes */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Social Share Image (optional)
                              </label>
                              <ImageAssetUploader
                                preset="social"
                                folder={CloudFolders.HTML_PAGES_OG}
                                currentUrl={ogImage || null}
                                currentVariants={{
                                  og_image_url: ogImage || null,
                                }}
                                onComplete={(result) =>
                                  setOgImage(
                                    result?.og_image_url ??
                                      result?.primary_url ??
                                      "",
                                  )
                                }
                                disabled={!user}
                                label="Social Share Image"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Drop one image — auto-generates a 1200×630 OG
                                card, 1080² square, portrait, story, and
                                YouTube thumbnail.
                              </p>
                            </div>

                            {/* Canonical URL */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Canonical URL (optional)
                              </label>
                              <input
                                type="url"
                                value={canonicalUrl}
                                onChange={(e) =>
                                  setCanonicalUrl(e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="https://example.com/canonical-page"
                                disabled={!user}
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Preferred URL for this content (prevents
                                duplicate content issues)
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Error Display */}
                      {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <div className="text-red-600 dark:text-red-400 text-sm">
                              <strong>Error:</strong> {error}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Save Button */}
                      <div>
                        <button
                          onClick={handleSavePage}
                          disabled={isCreating || !pageTitle.trim() || !user}
                          className={`w-full inline-flex items-center justify-center gap-3 px-6 py-3 text-sm font-medium rounded-lg transition-colors ${
                            isCreating || !pageTitle.trim() || !user
                              ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                              : "bg-blue-600 hover:bg-blue-700 text-white"
                          }`}
                        >
                          {isCreating ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save size={18} />
                              Save Page
                            </>
                          )}
                        </button>
                      </div>

                      {/* Saved Page Details */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 space-y-4">
                        <div className="text-center">
                          <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-3">
                            Page Published Successfully
                          </h4>

                          <div className="flex flex-col gap-3">
                            <a
                              href={savedPage.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                            >
                              <ExternalLink size={16} />
                              View Live Page
                            </a>

                            <button
                              onClick={() => handleCopyUrl(savedPage.url)}
                              className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
                                copiedUrl
                                  ? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                  : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border-border"
                              }`}
                            >
                              {copiedUrl ? (
                                <>
                                  <CheckCircle2 size={16} />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy size={16} />
                                  Copy URL
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right side - Full width preview */}
                    <div className="flex-1 flex flex-col">
                      <h5 className="font-medium text-gray-800 dark:text-gray-300 mb-3 text-center">
                        Live Preview
                      </h5>
                      <div className="flex-1 border border-border rounded-lg overflow-hidden bg-white">
                        <iframe
                          src={savedPage.url}
                          className="w-full h-full min-h-[600px]"
                          title={savedPage.title}
                          sandbox="allow-scripts allow-same-origin"
                          style={{ colorScheme: "light" }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  // Centered layout when no page is saved yet
                  <div className="max-w-2xl mx-auto w-full space-y-6 px-4">
                    <div className="text-center">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Save Page
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Save to Create Public Page
                      </p>
                    </div>

                    {/* User Info */}
                    {user && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <div className="text-blue-600 dark:text-blue-400 text-sm">
                            <strong>Logged in as:</strong> {user.email}
                          </div>
                        </div>
                      </div>
                    )}

                    {!user && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                        <div className="text-yellow-800 dark:text-yellow-300 text-sm">
                          <strong>Note:</strong> You must be logged in to save
                          HTML pages.
                        </div>
                      </div>
                    )}

                    {/* Save Form */}
                    <div className="space-y-4">
                      {/* Page Title */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Page Title *
                        </label>
                        <input
                          type="text"
                          value={pageTitle}
                          onChange={(e) => setPageTitle(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Enter page title"
                          disabled={!user}
                        />
                        <div className="flex justify-between items-center mt-1">
                          <span
                            className={`text-xs ${getCharacterCountStatus(pageTitle, 50, 60).color}`}
                          >
                            {pageTitle.length}/60 characters
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {getSEORecommendation(pageTitle, "title")}
                          </span>
                        </div>
                      </div>

                      {/* Page Description */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Description (optional)
                        </label>
                        <textarea
                          value={pageDescription}
                          onChange={(e) => setPageDescription(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          placeholder="Brief description (optional)"
                          rows={3}
                          disabled={!user}
                        />
                        <div className="flex justify-between items-center mt-1">
                          <span
                            className={`text-xs ${getCharacterCountStatus(pageDescription, 140, 160).color}`}
                          >
                            {pageDescription.length}/160 characters
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {getSEORecommendation(
                              pageDescription,
                              "description",
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Advanced Meta Options Toggle */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowAdvancedMeta(!showAdvancedMeta)}
                          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        >
                          {showAdvancedMeta ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                          Advanced SEO Options
                        </button>
                      </div>

                      {/* Advanced Meta Fields */}
                      {showAdvancedMeta && (
                        <div className="space-y-4 border-t border-border pt-4">
                          {/* Meta Title */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              SEO Meta Title
                            </label>
                            <input
                              type="text"
                              value={metaTitle}
                              onChange={(e) => setMetaTitle(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Will use page title if empty"
                              disabled={!user}
                            />
                            <div className="flex justify-between items-center mt-1">
                              <span
                                className={`text-xs ${getCharacterCountStatus(metaTitle, 50, 60).color}`}
                              >
                                {metaTitle.length}/60 characters
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {getSEORecommendation(metaTitle, "metaTitle")}
                              </span>
                            </div>
                          </div>

                          {/* Meta Description */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              SEO Meta Description
                            </label>
                            <textarea
                              value={metaDescription}
                              onChange={(e) =>
                                setMetaDescription(e.target.value)
                              }
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                              placeholder="Will use page description if empty"
                              rows={3}
                              disabled={!user}
                            />
                            <div className="flex justify-between items-center mt-1">
                              <span
                                className={`text-xs ${getCharacterCountStatus(metaDescription, 140, 160).color}`}
                              >
                                {metaDescription.length}/160 characters
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {getSEORecommendation(
                                  metaDescription,
                                  "metaDescription",
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Meta Keywords */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Meta Keywords (optional)
                            </label>
                            <input
                              type="text"
                              value={metaKeywords}
                              onChange={(e) => setMetaKeywords(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="keyword1, keyword2, keyword3"
                              disabled={!user}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Comma-separated keywords (less important for
                              modern SEO)
                            </p>
                          </div>

                          {/* OG Image */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Open Graph Image URL (optional)
                            </label>
                            <input
                              type="url"
                              value={ogImage}
                              onChange={(e) => setOgImage(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="https://example.com/image.jpg"
                              disabled={!user}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Image shown when shared on social media
                              (1200x630px recommended)
                            </p>
                          </div>

                          {/* Canonical URL */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Canonical URL (optional)
                            </label>
                            <input
                              type="url"
                              value={canonicalUrl}
                              onChange={(e) => setCanonicalUrl(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="https://example.com/canonical-page"
                              disabled={!user}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Preferred URL for this content (prevents duplicate
                              content issues)
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Error Display */}
                    {error && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <div className="text-red-600 dark:text-red-400 text-sm">
                            <strong>Error:</strong> {error}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Save Button */}
                    <div>
                      <button
                        onClick={handleSavePage}
                        disabled={isCreating || !pageTitle.trim() || !user}
                        className={`w-full inline-flex items-center justify-center gap-3 px-6 py-3 text-sm font-medium rounded-lg transition-colors ${
                          isCreating || !pageTitle.trim() || !user
                            ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                      >
                        {isCreating ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save size={18} />
                            Save Page
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Complete HTML Tab
              <div className="h-full flex flex-col">
                <div className="mb-3 flex justify-between items-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Complete HTML page with embedded CSS - ready to save as
                    .html file
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSelectAllComplete}
                      className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={handleCopyComplete}
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                        copiedComplete
                          ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                          : "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300"
                      }`}
                    >
                      {copiedComplete ? (
                        <>
                          <CheckCircle2 size={16} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Globe size={16} />
                          Copy Complete HTML
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  ref={completeTextareaRef}
                  value={getCurrentHtmlContent()}
                  readOnly
                  className="flex-1 w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-y-auto"
                  placeholder="Loading complete HTML..."
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Header button that saves the current HTML to the user's code library and
 * opens it in the `/code` editor. Split into its own sub-component so the
 * `useSaveAndOpenInCodeEditor` hook (which touches Redux + the Next router)
 * never mounts when the modal is rendered outside a Redux provider.
 */
function OpenInCodeEditorButton({
  getContent,
  title,
  onOpened,
}: {
  getContent: () => string;
  title: string;
  onOpened?: () => void;
}) {
  const saveAndOpen = useSaveAndOpenInCodeEditor();
  const [saving, setSaving] = useState(false);

  const handleClick = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const content = getContent();
      const safeName = (title || "Untitled").trim().replace(/[^\w\- .]/g, "_");
      const name = safeName.toLowerCase().endsWith(".html")
        ? safeName
        : `${safeName}.html`;
      await saveAndOpen({
        name,
        language: "html",
        content,
        folderName: CHAT_CAPTURES_FOLDER_NAME,
        tags: ["html-preview"],
        metadata: {
          source: "html-preview-modal",
          savedAt: new Date().toISOString(),
        },
      });
      onOpened?.();
    } catch (err) {
      console.error("[HtmlPreviewModal] open-in-editor failed", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={saving}
      title="Save to code library and open in the editor"
      className="inline-flex items-center gap-2 rounded-md border border-border bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      {saving ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Code2 size={14} />
      )}
      Open in editor
    </button>
  );
}
