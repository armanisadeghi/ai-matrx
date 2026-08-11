import { PresentationData } from "./Slideshow";
import { resolveDeckTheme } from "./presets";
import { palette } from "./SlideView";
import type { JsonObject } from "@/types/json";
import { markdownToPlainText } from "@/lib/markdown/plain-text";

// Google Slides `presentations.batchUpdate` request objects — heterogeneous
// (createSlide/createShape/insertText/updateTextStyle/...), no local type
// package for the Slides REST API; open JSON per request is the honest shape.
type SlidesBatchRequest = JsonObject;

/**
 * Central presentation export utilities
 * All export functions are client-side and non-blocking
 */

export interface ExportOptions {
    filename?: string;
    quality?: number;
    includeMetadata?: boolean;
}

export interface ExportResult {
    success: boolean;
    message: string;
    error?: string;
}

/**
 * Export presentation to PDF using html2canvas + jspdf
 * Status: ✅ READY
 */
export const exportToPDF = async (
    slideElements: HTMLElement[],
    presentationTitle: string = "presentation",
    options: ExportOptions = {}
): Promise<ExportResult> => {
    try {
        const { filename = presentationTitle, quality = 2 } = options;

        // Dynamic imports — both are large deps, only load when needed
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ]);

        // Create PDF in landscape mode (standard presentation size)
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: [297, 210] // A4 landscape
        });

        for (let i = 0; i < slideElements.length; i++) {
            const slideElement = slideElements[i];
            
            // Capture slide as canvas
            const canvas = await html2canvas(slideElement, {
                scale: quality,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            // Convert to image and add to PDF
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 297; // A4 landscape width
            const imgHeight = 210; // A4 landscape height

            if (i > 0) {
                pdf.addPage();
            }

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        }

        // Save the PDF
        pdf.save(`${filename}.pdf`);

        return {
            success: true,
            message: `PDF exported successfully: ${filename}.pdf`
        };
    } catch (error) {
        console.error('PDF export failed:', error);
        return {
            success: false,
            message: 'Failed to export PDF',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};

/**
 * Convert presentation data to markdown format
 */
function convertPresentationToMarkdown(presentationData: PresentationData): string {
    const { slides } = presentationData;
    let markdown = '';
    
    slides.forEach((slide, index) => {
        if (slide.type === 'intro') {
            // Title slide
            markdown += `# ${slide.title}\n\n`;
            if (slide.subtitle) {
                markdown += `${slide.subtitle}\n\n`;
            }
        } else if (slide.type === 'content') {
            // Content slide
            markdown += `## ${slide.title}\n\n`;
            
            if (slide.description) {
                markdown += `${slide.description}\n\n`;
            }
            
            if (slide.bullets && slide.bullets.length > 0) {
                slide.bullets.forEach((bullet: string) => {
                    markdown += `- ${bullet}\n`;
                });
                markdown += '\n';
            }
        }
        
        // Add separator between slides (except for last slide)
        if (index < slides.length - 1) {
            markdown += '---\n\n';
        }
    });
    
    return markdown;
}

/**
 * Export presentation as markdown (for HTML Pages integration)
 * Status: ✅ READY
 * 
 * Returns the markdown content that can be used with the HTML Pages system
 */
export const exportToHTML = async (
    presentationData: PresentationData,
    options: ExportOptions = {}
): Promise<ExportResult & { markdown?: string }> => {
    try {
        // Convert presentation to markdown
        const markdown = convertPresentationToMarkdown(presentationData);
        
        // Return the markdown that can be opened in HTML editor
        return {
            success: true,
            message: 'Presentation converted to markdown. Opening HTML editor...',
            markdown
        };
    } catch (error) {
        console.error('HTML export failed:', error);
        return {
            success: false,
            message: 'Failed to convert presentation',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};

/**
 * Helper to parse markdown text with bold formatting for PowerPoint
 * Returns array of text segments with formatting
 */
const parseMarkdownForPPT = (text: string | undefined): Array<{ text: string; options?: { bold?: boolean } }> => {
    const segments: Array<{ text: string; options?: { bold?: boolean } }> = [];
    const parts = (text ?? '').split(/(\*\*.*?\*\*)/g);
    
    parts.forEach(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
            segments.push({
                text: part.slice(2, -2),
                options: { bold: true }
            });
        } else if (part) {
            segments.push({ text: part });
        }
    });
    
    return segments;
};

/**
 * Export presentation to PowerPoint (PPTX) format
 * Status: ✅ READY
 */
export const exportToPowerPoint = async (
    presentationData: PresentationData,
    options: ExportOptions = {}
): Promise<ExportResult> => {
    // Ensure we're running in the browser
    if (typeof window === 'undefined') {
        return {
            success: false,
            message: 'PowerPoint export is only available in the browser',
            error: 'Server-side export not supported'
        };
    }

    try {
        // Dynamic import to avoid SSR bundling issues
        const pptxgenModule = await import('pptxgenjs');
        const pptxgen = pptxgenModule.default;
        const pptx = new pptxgen();
        
        const { filename = 'presentation' } = options;
        const { slides } = presentationData;
        const theme = palette(resolveDeckTheme(presentationData.theme));

        // Set presentation properties
        pptx.author = 'AI Matrx';
        pptx.title = slides[0]?.title || filename;
        pptx.subject = 'Presentation';
        
        // Define layout (16:9 widescreen)
        pptx.layout = 'LAYOUT_WIDE';
        
        // Process each slide
        for (const slideData of slides) {
            const slide = pptx.addSlide();
            
            // Add background color
            slide.background = { color: 'FFFFFF' };
            
            if (slideData.type === 'intro') {
                // Intro slide layout
                
                // Add "Introduction" badge
                slide.addText('Introduction', {
                    x: '35%',
                    y: '15%',
                    w: '30%',
                    h: '6%',
                    align: 'center',
                    fontSize: 14,
                    color: theme.primary.replace('#', ''),
                    fill: { color: theme.primary.replace('#', '') + '20' },
                    bold: true
                });
                
                // Add title with markdown support
                const titleSegments = parseMarkdownForPPT(slideData.title);
                slide.addText(titleSegments, {
                    x: '10%',
                    y: '30%',
                    w: '80%',
                    h: '20%',
                    align: 'center',
                    fontSize: 44,
                    color: theme.primary.replace('#', ''),
                    bold: true,
                    valign: 'middle'
                });
                
                // Add subtitle with markdown support
                const subtitleSegments = parseMarkdownForPPT(slideData.subtitle);
                slide.addText(subtitleSegments, {
                    x: '15%',
                    y: '55%',
                    w: '70%',
                    h: '15%',
                    align: 'center',
                    fontSize: 24,
                    color: '4B5563',
                    valign: 'top'
                });
            } else {
                // Content slide layout
                
                // Add title with markdown support
                const titleSegments = parseMarkdownForPPT(slideData.title);
                slide.addText(titleSegments, {
                    x: '5%',
                    y: '8%',
                    w: '90%',
                    h: '12%',
                    fontSize: 36,
                    color: theme.primary.replace('#', ''),
                    bold: true,
                    valign: 'bottom'
                });
                
                // Add description with markdown support
                const descriptionSegments = parseMarkdownForPPT(slideData.description);
                slide.addText(descriptionSegments, {
                    x: '5%',
                    y: '22%',
                    w: '90%',
                    h: '8%',
                    fontSize: 18,
                    color: '6B7280',
                    valign: 'top'
                });
                
                // Add bullets with markdown support
                const bulletPoints = (slideData.bullets ?? []).map((bullet: string) => {
                    const segments = parseMarkdownForPPT(bullet);
                    return {
                        text: markdownToPlainText(bullet), // For simple bullets
                        options: {
                            bullet: { code: '2022' }, // Bullet character
                            color: '1F2937',
                            fontSize: 18,
                            paraSpaceBefore: 8,
                            paraSpaceAfter: 8
                        }
                    };
                });
                
                slide.addText(bulletPoints, {
                    x: '5%',
                    y: '35%',
                    w: '90%',
                    h: '55%',
                    fontSize: 18,
                    color: '1F2937',
                    bullet: true,
                    valign: 'top'
                });
            }
        }
        
        // Save the presentation
        await pptx.writeFile({ fileName: `${filename}.pptx` });
        
        return {
            success: true,
            message: `PowerPoint exported successfully: ${filename}.pptx`
        };
    } catch (error) {
        console.error('PowerPoint export failed:', error);
        return {
            success: false,
            message: 'Failed to export PowerPoint',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};

/**
 * Google Slides API scope
 */
export const GOOGLE_SLIDES_SCOPE = 'https://www.googleapis.com/auth/presentations';

/**
 * Helper to convert hex color to RGB object for Google Slides
 */
const hexToRgb = (hex: string): { red: number; green: number; blue: number } => {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    return { red: r, green: g, blue: b };
};

/**
 * Create text elements with markdown bold support for Google Slides
 */
const createTextWithFormatting = (text: string | undefined, startIndex: number = 0) => {
    const boldRanges: Array<{ startIndex: number; endIndex: number }> = [];
    let plainText = text ?? '';
    let currentIndex = startIndex;
    
    // Find all **bold** patterns and their positions
    const parts = (text ?? '').split(/(\*\*.*?\*\*)/g);
    plainText = '';
    
    parts.forEach(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
            const boldText = part.slice(2, -2);
            boldRanges.push({
                startIndex: currentIndex,
                endIndex: currentIndex + boldText.length
            });
            plainText += boldText;
            currentIndex += boldText.length;
        } else if (part) {
            plainText += part;
            currentIndex += part.length;
        }
    });
    
    return { plainText, boldRanges };
};

/**
 * Export presentation to Google Slides
 * Status: ✅ READY
 */
export const exportToGoogleSlides = async (
    presentationData: PresentationData,
    accessToken: string,
    options: ExportOptions = {}
): Promise<ExportResult> => {
    // Ensure we're running in the browser
    if (typeof window === 'undefined') {
        return {
            success: false,
            message: 'Google Slides export is only available in the browser',
            error: 'Server-side export not supported'
        };
    }

    if (!accessToken) {
        return {
            success: false,
            message: 'Not authenticated with Google',
            error: 'Please sign in to Google first'
        };
    }

    try {
        const { filename = 'presentation' } = options;
        const { slides } = presentationData;
        const theme = palette(resolveDeckTheme(presentationData.theme));

        // Step 1: Create a new presentation
        const createResponse = await fetch('https://slides.googleapis.com/v1/presentations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: filename
            })
        });

        if (!createResponse.ok) {
            const errorData = await createResponse.json();
            throw new Error(errorData.error?.message || 'Failed to create presentation');
        }

        const presentation = await createResponse.json();
        const presentationId = presentation.presentationId;
        
        // Step 2: Build requests to add slides and content
        const requests: SlidesBatchRequest[] = [];
        
        // Remove the default blank slide
        if (presentation.slides && presentation.slides.length > 0) {
            requests.push({
                deleteObject: {
                    objectId: presentation.slides[0].objectId
                }
            });
        }

        // Step 3: Add all slides
        for (let i = 0; i < slides.length; i++) {
            const slide = slides[i];
            const slideId = `slide_${i}`;
            
            // Create slide
            requests.push({
                createSlide: {
                    objectId: slideId,
                    insertionIndex: i,
                    slideLayoutReference: {
                        predefinedLayout: 'BLANK'
                    }
                }
            });

            if (slide.type === 'intro') {
                // Intro slide layout
                const titleBoxId = `${slideId}_title`;
                const subtitleBoxId = `${slideId}_subtitle`;
                const badgeBoxId = `${slideId}_badge`;

                // Add badge
                requests.push({
                    createShape: {
                        objectId: badgeBoxId,
                        shapeType: 'TEXT_BOX',
                        elementProperties: {
                            pageObjectId: slideId,
                            size: {
                                width: { magnitude: 200, unit: 'PT' },
                                height: { magnitude: 40, unit: 'PT' }
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: 260,
                                translateY: 100,
                                unit: 'PT'
                            }
                        }
                    }
                });

                requests.push({
                    insertText: {
                        objectId: badgeBoxId,
                        text: 'Introduction'
                    }
                });

                // Style badge
                const primaryColor = hexToRgb(theme.primary);
                requests.push({
                    updateTextStyle: {
                        objectId: badgeBoxId,
                        style: {
                            fontSize: { magnitude: 14, unit: 'PT' },
                            bold: true,
                            foregroundColor: {
                                opaqueColor: { rgbColor: primaryColor }
                            }
                        },
                        fields: 'fontSize,bold,foregroundColor'
                    }
                });

                // Add title
                const { plainText: titleText, boldRanges: titleBoldRanges } = createTextWithFormatting(slide.title);
                requests.push({
                    createShape: {
                        objectId: titleBoxId,
                        shapeType: 'TEXT_BOX',
                        elementProperties: {
                            pageObjectId: slideId,
                            size: {
                                width: { magnitude: 600, unit: 'PT' },
                                height: { magnitude: 150, unit: 'PT' }
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: 60,
                                translateY: 200,
                                unit: 'PT'
                            }
                        }
                    }
                });

                requests.push({
                    insertText: {
                        objectId: titleBoxId,
                        text: titleText
                    }
                });

                requests.push({
                    updateTextStyle: {
                        objectId: titleBoxId,
                        style: {
                            fontSize: { magnitude: 44, unit: 'PT' },
                            bold: true,
                            foregroundColor: {
                                opaqueColor: { rgbColor: primaryColor }
                            }
                        },
                        fields: 'fontSize,bold,foregroundColor'
                    }
                });

                requests.push({
                    updateParagraphStyle: {
                        objectId: titleBoxId,
                        style: {
                            alignment: 'CENTER'
                        },
                        fields: 'alignment'
                    }
                });

                // Add subtitle
                const { plainText: subtitleText } = createTextWithFormatting(slide.subtitle);
                requests.push({
                    createShape: {
                        objectId: subtitleBoxId,
                        shapeType: 'TEXT_BOX',
                        elementProperties: {
                            pageObjectId: slideId,
                            size: {
                                width: { magnitude: 500, unit: 'PT' },
                                height: { magnitude: 100, unit: 'PT' }
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: 110,
                                translateY: 360,
                                unit: 'PT'
                            }
                        }
                    }
                });

                requests.push({
                    insertText: {
                        objectId: subtitleBoxId,
                        text: subtitleText
                    }
                });

                const grayColor = hexToRgb('#6B7280');
                requests.push({
                    updateTextStyle: {
                        objectId: subtitleBoxId,
                        style: {
                            fontSize: { magnitude: 24, unit: 'PT' },
                            foregroundColor: {
                                opaqueColor: { rgbColor: grayColor }
                            }
                        },
                        fields: 'fontSize,foregroundColor'
                    }
                });

                requests.push({
                    updateParagraphStyle: {
                        objectId: subtitleBoxId,
                        style: {
                            alignment: 'CENTER'
                        },
                        fields: 'alignment'
                    }
                });

            } else {
                // Content slide layout
                const titleBoxId = `${slideId}_title`;
                const descBoxId = `${slideId}_desc`;
                const bulletsBoxId = `${slideId}_bullets`;

                // Add title
                const { plainText: titleText } = createTextWithFormatting(slide.title);
                requests.push({
                    createShape: {
                        objectId: titleBoxId,
                        shapeType: 'TEXT_BOX',
                        elementProperties: {
                            pageObjectId: slideId,
                            size: {
                                width: { magnitude: 650, unit: 'PT' },
                                height: { magnitude: 80, unit: 'PT' }
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: 35,
                                translateY: 50,
                                unit: 'PT'
                            }
                        }
                    }
                });

                requests.push({
                    insertText: {
                        objectId: titleBoxId,
                        text: titleText
                    }
                });

                const primaryColor = hexToRgb(theme.primary);
                requests.push({
                    updateTextStyle: {
                        objectId: titleBoxId,
                        style: {
                            fontSize: { magnitude: 36, unit: 'PT' },
                            bold: true,
                            foregroundColor: {
                                opaqueColor: { rgbColor: primaryColor }
                            }
                        },
                        fields: 'fontSize,bold,foregroundColor'
                    }
                });

                // Add description
                const { plainText: descText } = createTextWithFormatting(slide.description);
                requests.push({
                    createShape: {
                        objectId: descBoxId,
                        shapeType: 'TEXT_BOX',
                        elementProperties: {
                            pageObjectId: slideId,
                            size: {
                                width: { magnitude: 650, unit: 'PT' },
                                height: { magnitude: 50, unit: 'PT' }
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: 35,
                                translateY: 140,
                                unit: 'PT'
                            }
                        }
                    }
                });

                requests.push({
                    insertText: {
                        objectId: descBoxId,
                        text: descText
                    }
                });

                const grayColor = hexToRgb('#6B7280');
                requests.push({
                    updateTextStyle: {
                        objectId: descBoxId,
                        style: {
                            fontSize: { magnitude: 18, unit: 'PT' },
                            foregroundColor: {
                                opaqueColor: { rgbColor: grayColor }
                            }
                        },
                        fields: 'fontSize,foregroundColor'
                    }
                });

                // Add bullets
                const bulletText = (slide.bullets ?? []).map((b: string) => markdownToPlainText(b)).join('\n');
                requests.push({
                    createShape: {
                        objectId: bulletsBoxId,
                        shapeType: 'TEXT_BOX',
                        elementProperties: {
                            pageObjectId: slideId,
                            size: {
                                width: { magnitude: 650, unit: 'PT' },
                                height: { magnitude: 300, unit: 'PT' }
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: 35,
                                translateY: 210,
                                unit: 'PT'
                            }
                        }
                    }
                });

                requests.push({
                    insertText: {
                        objectId: bulletsBoxId,
                        text: bulletText
                    }
                });

                const darkGrayColor = hexToRgb('#1F2937');
                requests.push({
                    updateTextStyle: {
                        objectId: bulletsBoxId,
                        style: {
                            fontSize: { magnitude: 18, unit: 'PT' },
                            foregroundColor: {
                                opaqueColor: { rgbColor: darkGrayColor }
                            }
                        },
                        fields: 'fontSize,foregroundColor'
                    }
                });

                // Apply bullet list formatting
                requests.push({
                    createParagraphBullets: {
                        objectId: bulletsBoxId,
                        bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE'
                    }
                });
            }
        }

        // Step 4: Execute all requests
        const batchResponse = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ requests })
        });

        if (!batchResponse.ok) {
            const errorData = await batchResponse.json();
            throw new Error(errorData.error?.message || 'Failed to update presentation');
        }

        // Success! Open the presentation
        const presentationUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;
        window.open(presentationUrl, '_blank');

        return {
            success: true,
            message: `Google Slides created successfully!`
        };
    } catch (error) {
        console.error('Google Slides export failed:', error);
        return {
            success: false,
            message: 'Failed to export to Google Slides',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};

/**
 * Helper function to get all slide elements from the DOM
 */
export const getAllSlideElements = (containerRef: React.RefObject<HTMLElement>): HTMLElement[] => {
    if (!containerRef.current) return [];
    
    // This will need to be adapted based on how slides are rendered
    // For now, return empty array as placeholder
    return [];
};

/**
 * Export status checker
 */
export const getExportCapabilities = () => {
    return {
        pdf: {
            available: true,
            status: 'ready',
            description: 'Export as PDF with pixel-perfect rendering'
        },
        html: {
            available: true,
            status: 'ready',
            description: 'Export as HTML webpage'
        },
        powerpoint: {
            available: true,
            status: 'ready',
            description: 'Export as editable PowerPoint presentation'
        },
        googleSlides: {
            available: false,
            status: 'needs_setup',
            description: 'Export as Google Slides'
        }
    };
};

