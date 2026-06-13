"use client";
import React, { useState } from "react";
import {
  Download,
  FileText,
  FileDown,
  Presentation as PresentationIcon,
  Loader2,
  Mail,
} from "lucide-react";
import {
  exportToPDF,
  exportToHTML,
  exportToPowerPoint,
  exportToGoogleSlides,
  getExportCapabilities,
  GOOGLE_SLIDES_SCOPE,
} from "./presentation-export";
import { PresentationData } from "./Slideshow";
import { useGoogleAPIOptional } from "@/providers/google-provider/GoogleApiProvider";
import { PresentationPublishModal } from "./PresentationPublishModal";
import { useHTMLPages } from "@/features/html-pages/hooks/useHTMLPages";
import { generatePresentationHTML } from "./presentation-html-generator";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { toast } from "sonner";

interface PresentationExportMenuProps {
  presentationData: PresentationData;
  presentationTitle?: string;
  slideContainerRef: React.RefObject<HTMLDivElement>;
  slides: any[];
}

const PresentationExportMenu: React.FC<PresentationExportMenuProps> = ({
  presentationData,
  presentationTitle = "presentation",
  slideContainerRef,
  slides,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // HTML Publishing state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // User and HTML Pages
  const user = useAppSelector(selectUser);
  const { createHTMLPage } = useHTMLPages(user?.id);

  // Google OAuth integration — optional. The Slideshow (and therefore this
  // export menu) renders anywhere a `presentation` JSON block appears, which
  // is NOT always inside a GoogleAPIProvider (e.g. the admin markdown-tester).
  // Degrade the Google Slides export gracefully instead of crashing the whole
  // presentation when the provider is absent.
  const googleApi = useGoogleAPIOptional();
  const isAuthenticated = googleApi?.isAuthenticated ?? false;
  const token = googleApi?.token ?? null;
  const signIn = googleApi?.signIn;
  const hasSlideScope =
    googleApi?.getGrantedScopes().includes(GOOGLE_SLIDES_SCOPE) ?? false;

  const baseCapabilities = getExportCapabilities();
  // Google Slides requires the Google provider; force-disable it when absent.
  const capabilities = {
    ...baseCapabilities,
    googleSlides: {
      ...baseCapabilities.googleSlides,
      available: baseCapabilities.googleSlides.available && !!googleApi,
    },
  };

  // Email presentation link handler
  const handleEmailLink = async () => {
    if (!user?.email) {
      toast.error("Please sign in to email presentations");
      return;
    }

    setIsExporting(true);
    setExportStatus("Sending email...");

    try {
      // If already published, use existing URL
      if (publishedUrl) {
        const response = await fetch("/api/sharing/email-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resourceType: "Presentation",
            resourceName: presentationTitle || "Presentation",
            shareUrl: publishedUrl,
            message: `${presentationData.slides.length} slides`,
          }),
        });

        const data = await response.json();

        if (data.success) {
          toast.success("Email sent!", {
            description: "Link has been emailed to you",
          });
          setIsOpen(false);
        } else {
          throw new Error(data.msg || "Failed to send email");
        }
      } else {
        // First publish, then email
        setExportStatus("Publishing presentation...");
        const completeHtml = generatePresentationHTML(presentationData);

        const publishResult = await createHTMLPage(
          completeHtml,
          presentationTitle || "Presentation",
          `Interactive presentation with ${presentationData.slides.length} slides`,
          {
            metaTitle: presentationTitle || "Presentation",
            metaDescription: `Interactive presentation with ${presentationData.slides.length} slides`,
            metaKeywords: "presentation, slides, interactive",
            ogImage: "",
            canonicalUrl: "",
          },
        );

        setPublishedUrl(publishResult.url);
        setExportStatus("Sending email...");

        const response = await fetch("/api/sharing/email-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resourceType: "Presentation",
            resourceName: presentationTitle || "Presentation",
            shareUrl: publishResult.url,
            message: `${presentationData.slides.length} slides`,
          }),
        });

        const data = await response.json();

        if (data.success) {
          toast.success("Email sent!", {
            description: "Link has been emailed to you",
          });
          setIsOpen(false);
        } else {
          throw new Error(data.msg || "Failed to send email");
        }
      }
    } catch (error) {
      console.error("Email failed:", error);
      toast.error("Failed to send email", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsExporting(false);
      setExportStatus(null);
    }
  };

  const handleExport = async (
    type: "pdf" | "html" | "powerpoint" | "googleSlides",
  ) => {
    setIsExporting(true);
    setExportStatus(null);

    try {
      let result;

      switch (type) {
        case "pdf":
          // For PDF, we need to render all slides temporarily
          result = await exportPDFWithAllSlides();
          break;
        case "html":
          if (!user) {
            setExportStatus("Please sign in to publish presentations");
            setIsExporting(false);
            return;
          }

          try {
            setExportStatus("Generating interactive presentation...");

            // Generate complete standalone HTML presentation
            const completeHtml = generatePresentationHTML(presentationData);

            setExportStatus("Publishing to web...");
            setIsPublishing(true);
            setIsPublishModalOpen(true);
            setIsOpen(false); // Close export menu

            // Publish to database
            const publishResult = await createHTMLPage(
              completeHtml,
              presentationTitle || "Presentation",
              `Interactive presentation with ${presentationData.slides.length} slides`,
              {
                metaTitle: presentationTitle || "Presentation",
                metaDescription: `Interactive presentation with ${presentationData.slides.length} slides`,
                metaKeywords: "presentation, slides, interactive",
                ogImage: "",
                canonicalUrl: "",
              },
            );

            setPublishedUrl(publishResult.url);
            setIsPublishing(false);
            result = {
              success: true,
              message: "Presentation published successfully!",
            };
          } catch (error) {
            console.error("HTML publish failed:", error);
            setIsPublishing(false);
            setIsPublishModalOpen(false);
            result = {
              success: false,
              message: "Failed to publish presentation",
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
          break;
        case "powerpoint":
          result = await exportToPowerPoint(presentationData, {
            filename: presentationTitle,
          });
          break;
        case "googleSlides":
          let authToken = token;

          // Check if authenticated and has correct scope
          if (!isAuthenticated || !hasSlideScope) {
            if (!signIn) {
              setExportStatus("Google integration unavailable here.");
              setIsExporting(false);
              return;
            }
            setExportStatus("Authenticating with Google...");
            const success = await signIn([GOOGLE_SLIDES_SCOPE]);
            if (!success) {
              setExportStatus(
                "Google authentication required. Please sign in.",
              );
              setIsExporting(false);
              return;
            }

            // After successful sign-in, wait for the context to update
            // and get the fresh token from localStorage
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Get the fresh token that was just saved
            const savedToken = localStorage.getItem("google_auth_token");
            if (savedToken) {
              authToken = savedToken;
            }

            setExportStatus("Creating presentation...");
          }

          if (!authToken) {
            setExportStatus(
              "Authentication token not available. Please try again.",
            );
            setIsExporting(false);
            return;
          }

          result = await exportToGoogleSlides(presentationData, authToken, {
            filename: presentationTitle,
          });
          break;
      }

      if (result) {
        setExportStatus(result.message);
        if (result.success) {
          setTimeout(() => {
            setIsOpen(false);
            setExportStatus(null);
          }, 2000);
        }
      }
    } catch (error) {
      setExportStatus("Export failed. Please try again.");
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper to convert markdown bold to HTML
  const parseMarkdownToHTML = (text: string): string => {
    // Replace **text** with <strong>text</strong>
    return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  };

  const exportPDFWithAllSlides = async () => {
    // Create a temporary container to render all slides
    const tempContainer = document.createElement("div");
    tempContainer.style.position = "fixed";
    tempContainer.style.left = "-9999px";
    tempContainer.style.top = "0";
    tempContainer.style.width = "1024px";
    tempContainer.style.height = "768px";
    document.body.appendChild(tempContainer);

    const slideElements: HTMLElement[] = [];

    try {
      // Render each slide to the temp container
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const slideDiv = document.createElement("div");
        slideDiv.style.width = "1024px";
        slideDiv.style.height = "768px";
        slideDiv.style.padding = "48px";
        slideDiv.style.backgroundColor = "white";
        slideDiv.style.display = "flex";
        slideDiv.style.flexDirection = "column";
        slideDiv.style.justifyContent = "center";

        if (slide.type === "intro") {
          slideDiv.innerHTML = `
                        <div style="text-align: center;">
                            <h1 style="font-size: 48px; font-weight: bold; color: ${presentationData.theme.primaryColor}; margin-bottom: 24px;">
                                ${parseMarkdownToHTML(slide.title)}
                            </h1>
                            <p style="font-size: 24px; color: #4B5563;">
                                ${parseMarkdownToHTML(slide.subtitle)}
                            </p>
                        </div>
                    `;
        } else {
          const bulletsHTML = slide.bullets
            .map(
              (bullet: string) => `
                        <div style="display: flex; gap: 12px; padding: 12px; margin-bottom: 8px; background: #F9FAFB; border-radius: 8px;">
                            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${presentationData.theme.primaryColor}; margin-top: 8px;"></div>
                            <p style="font-size: 18px; color: #1F2937;">${parseMarkdownToHTML(bullet)}</p>
                        </div>
                    `,
            )
            .join("");

          slideDiv.innerHTML = `
                        <div>
                            <h2 style="font-size: 36px; font-weight: bold; color: ${presentationData.theme.primaryColor}; margin-bottom: 16px;">
                                ${parseMarkdownToHTML(slide.title)}
                            </h2>
                            <p style="font-size: 20px; color: #6B7280; margin-bottom: 24px;">
                                ${parseMarkdownToHTML(slide.description)}
                            </p>
                            <div>
                                ${bulletsHTML}
                            </div>
                        </div>
                    `;
        }

        tempContainer.appendChild(slideDiv);
        slideElements.push(slideDiv);
      }

      // Wait a bit for rendering
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Export to PDF
      const result = await exportToPDF(slideElements, presentationTitle, {
        quality: 2,
      });

      return result;
    } finally {
      // Clean up
      document.body.removeChild(tempContainer);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium transition-all shadow-sm disabled:opacity-50"
      >
        {isExporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        <span>Export</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Menu */}
          <div className="absolute right-0 top-full mt-2 w-96 z-50 bg-textured rounded-lg shadow-xl border-border overflow-hidden">
            {exportStatus && (
              <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  {exportStatus}
                </p>
              </div>
            )}

            {/* PDF Export */}
            <button
              onClick={() => handleExport("pdf")}
              disabled={isExporting || !capabilities.pdf.available}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-start gap-3"
            >
              <FileText className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Export as PDF
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {capabilities.pdf.description}
                </p>
              </div>
            </button>

            {/* HTML Export */}
            <button
              onClick={() => handleExport("html")}
              disabled={isExporting || !capabilities.html.available}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-start gap-3 border-t border-gray-100 dark:border-gray-700"
            >
              <FileDown className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Save as Webpage
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {capabilities.html.description}
                </p>
              </div>
            </button>

            {/* PowerPoint Export */}
            <button
              onClick={() => handleExport("powerpoint")}
              disabled={isExporting || !capabilities.powerpoint.available}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-start gap-3 border-t border-gray-100 dark:border-gray-700"
            >
              <PresentationIcon className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Export to PowerPoint
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {capabilities.powerpoint.description}
                </p>
              </div>
            </button>

            {/* Google Slides Export */}
            <button
              onClick={() => handleExport("googleSlides")}
              disabled={isExporting || !capabilities.googleSlides.available}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-start gap-3 border-t border-gray-100 dark:border-gray-700"
            >
              <svg
                className="h-5 w-5 flex-shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <rect width="24" height="24" rx="4" fill="#F4B400" />
                <path
                  d="M8 8h8v2H8V8zm0 3h8v2H8v-2zm0 3h5v2H8v-2z"
                  fill="white"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Create Google Slides
                  </p>
                  {!capabilities.googleSlides.available ? (
                    <span className="px-1.5 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                      Coming Soon
                    </span>
                  ) : isAuthenticated && hasSlideScope ? (
                    <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                      Ready
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                      Sign In
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {capabilities.googleSlides.description}
                </p>
              </div>
            </button>

            {/* Email Link */}
            <button
              onClick={handleEmailLink}
              disabled={isExporting || !user}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-start gap-3 border-t border-gray-100 dark:border-gray-700"
            >
              <Mail className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Email to Me
                  </p>
                  {!user && (
                    <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                      Sign In
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Email a link to this presentation
                </p>
              </div>
            </button>
          </div>
        </>
      )}

      {/* Publish Modal */}
      <PresentationPublishModal
        isOpen={isPublishModalOpen}
        onClose={() => {
          setIsPublishModalOpen(false);
          setPublishedUrl(null);
        }}
        publishedUrl={publishedUrl}
        isPublishing={isPublishing}
      />
    </div>
  );
};

export default PresentationExportMenu;
