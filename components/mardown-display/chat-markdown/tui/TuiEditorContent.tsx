"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { Editor as TuiEditorReactComp } from "@toast-ui/react-editor";
import { useAppSelector } from "@/lib/redux/hooks";
import EditorLoading from "../../text-block/editorLoading";

// Import the Toast UI Editor CSS
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/theme/toastui-editor-dark.css";
import "./TuiEditorContent.css";

const TuiEditor = dynamic(() => import("@toast-ui/react-editor").then((mod) => mod.Editor), {
    ssr: false,
    loading: () => <EditorLoading />,
});

// Safer dynamic import for color syntax plugin
const loadColorSyntaxPlugin = () => {
    try {
        return import("@toast-ui/editor-plugin-color-syntax").then((mod) => mod.default);
    } catch (error) {
        console.warn("Color syntax plugin not available:", error);
        return Promise.resolve(null);
    }
};

interface TuiEditorContentProps {
    content: string;
    onChange?: (content: string) => void;
    isActive?: boolean;
    className?: string;
    editMode?: "markdown" | "wysiwyg";
}

interface TuiEditorContentRef {
    getCurrentMarkdown: () => string;
    getInstance: () => any;
    getRootElement: () => HTMLElement | null;
}

// Toast UI Editor's recommended pattern for widgets
// Pattern: [@uuid](display-name)
const MATRX_WIDGET_PATTERN = /\[(@[a-f0-9-]+)\]\(([^)]+)\)/;

// Simple widget rules using Toast UI's official pattern
const createMatrxWidgetRules = () => {
    return [
        {
            rule: MATRX_WIDGET_PATTERN,
            toDOM(text: string) {
                try {
                    const match = text.match(MATRX_WIDGET_PATTERN);
                    if (!match) {
                        return document.createTextNode(text);
                    }
                    
                    const uuid = match[1]?.substring(1); // Remove @ prefix
                    const displayName = match[2];
                    
                    if (!uuid || !displayName) {
                        return document.createTextNode(text);
                    }
                    
                    // Create professional blue pill
                    const pill = document.createElement('span');
                    pill.className = 'matrx-pill';
                    pill.textContent = displayName;
                    pill.title = `MATRX: ${displayName} (ID: ${uuid})`;
                    
                    // Store data as attributes safely
                    try {
                        pill.setAttribute('data-matrx-id', uuid);
                        pill.setAttribute('data-matrx-name', displayName);
                        pill.setAttribute('data-matrx-original', text);
                    } catch (attrError) {
                        console.warn('Failed to set attributes:', attrError);
                    }
                    
                    // Professional blue pill styling - no !important overrides
                    try {
                        pill.style.cssText = `
                            background: #3b82f6;
                            color: white;
                            padding: 2px 8px;
                            border-radius: 12px;
                            font-size: 16px;
                            font-weight: 500;
                            display: inline-block;
                            margin: 0 2px;
                            cursor: pointer;
                            user-select: none;
                            vertical-align: middle;
                            white-space: nowrap;
                            max-width: 200px;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            border: 1px solid rgba(59, 130, 246, 0.3);
                            transition: background-color 0.2s ease;
                            line-height: 1.2;
                        `;
                    } catch (styleError) {
                        console.warn('Failed to apply styles:', styleError);
                    }
                    
                    // Add event handlers with error protection
                    try {
                        // Simple hover effect
                        pill.addEventListener('mouseenter', function() {
                            try {
                                this.style.backgroundColor = '#2563eb';
                            } catch (e) {
                                console.warn('Hover effect failed:', e);
                            }
                        });
                        
                        pill.addEventListener('mouseleave', function() {
                            try {
                                this.style.backgroundColor = '#3b82f6';
                            } catch (e) {
                                console.warn('Hover effect failed:', e);
                            }
                        });
                        
                        // Click handler
                        pill.addEventListener('click', function(e) {
                            try {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                const customEvent = new CustomEvent('matrxWidgetClick', {
                                    detail: { id: uuid, name: displayName },
                                    bubbles: true
                                });
                                this.dispatchEvent(customEvent);
                            } catch (clickError) {
                                console.warn('Click handler failed:', clickError);
                            }
                        });
                    } catch (eventError) {
                        console.warn('Failed to add event listeners:', eventError);
                    }
                    
                    return pill;
                    
                } catch (error) {
                    console.error('Error in MATRX widget toDOM:', error);
                    // Always return a safe fallback
                    try {
                        const fallback = document.createElement('span');
                        fallback.textContent = text;
                        return fallback;
                    } catch (fallbackError) {
                        console.error('Even fallback failed:', fallbackError);
                        return document.createTextNode(text);
                    }
                }
            }
        }
    ];
};


// Helper function to convert your existing MATRX patterns to Toast UI format
const convertToToastUIPattern = (content: string): string => {
    const MATRX_PATTERN = /<<<MATRX_START>>>(.*?)<<<MATRX_END>>>/gs;
    const MATRX_ID_PATTERN = /<ID>(.*?)<ID_END>/;
    const MATRX_NAME_PATTERN = /<NAME>(.*?)<NAME_END>/;
    
    return content.replace(MATRX_PATTERN, (match, innerContent) => {
        try {
            
            const idMatch = innerContent.match(MATRX_ID_PATTERN);
            const nameMatch = innerContent.match(MATRX_NAME_PATTERN);
            
            if (idMatch && nameMatch) {
                const id = idMatch[1];
                const name = nameMatch[1];
                return `[@${id}](${name})`;
            }
        } catch (error) {
            console.error('Error converting pattern:', error);
        }
        return match; // Return original if conversion fails
    });
};

// Helper function to convert Toast UI pattern back to your original format
const convertFromToastUIPattern = (content: string): string => {
    return content.replace(MATRX_WIDGET_PATTERN, (match, uuid, name) => {
        const cleanUuid = uuid.substring(1); // Remove @ prefix
        return `<<<MATRX_START>>><ID>${cleanUuid}<ID_END><NAME>${name}<NAME_END><<<MATRX_END>>>`;
    });
};


const TuiEditorContent = React.forwardRef<TuiEditorContentRef, TuiEditorContentProps>(({
    content,
    onChange,
    isActive = true,
    className = "w-full h-full tui-editor-wrapper",
    editMode = "wysiwyg"
 }, ref) => {
    const editorRef = useRef<TuiEditorReactComp>(null);
    const mode = useAppSelector((s) => s.theme.mode);
    const [colorSyntaxPlugin, setColorSyntaxPlugin] = useState<any>(null);
    const [isClient, setIsClient] = useState(false);
    const [widgetRules, setWidgetRules] = useState<any[]>([]);
    const [convertedContent, setConvertedContent] = useState<string>("");
    const [isThemeReady, setIsThemeReady] = useState(false);
    const hasAppliedInitialTheme = useRef(false);
    const endKeyCleanupRef = useRef<(() => void) | null>(null);
 
    // Convert incoming content from your format to Toast UI format
    useEffect(() => {
        const converted = convertToToastUIPattern(content);
        setConvertedContent(converted);
    }, [content]);
    
    // Reset theme application flag when editor key changes (remounts)
    useEffect(() => {
        hasAppliedInitialTheme.current = false;
        setIsThemeReady(false);
    }, [mode, isActive, editMode]);
    
    // Helper function to apply theme - extracted for reuse
    const applyTheme = useCallback((editorElement: any) => {
        try {
            const editorContainer = editorElement?.querySelector?.(".toastui-editor-defaultUI");
            if (editorContainer) {
                if (mode === "dark") {
                    editorContainer.classList.add("toastui-editor-dark");
                } else {
                    editorContainer.classList.remove("toastui-editor-dark");
                }
                return true;
            }
        } catch (e) {
            console.error("Error applying theme to editor:", e);
        }
        return false;
    }, [mode]);
 
    // Apply dark mode class to editor when mode changes
    useEffect(() => {
        if (editorRef.current && isClient) {
            const editorEl = editorRef.current.getRootElement();
            applyTheme(editorEl);
        }
    }, [mode, isClient, applyTheme]);
 
    useEffect(() => {
        setIsClient(true);
        // Load color syntax plugin with error handling
        loadColorSyntaxPlugin()
            .then((plugin) => {
                if (plugin) {
                    setColorSyntaxPlugin(() => plugin);
                } else {
                    console.warn('Color syntax plugin not available');
                }
            })
            .catch((error) => {
                console.warn('Failed to load color syntax plugin:', error);
            });
    }, []);
 
    // Initialize widget rules after client is ready
    useEffect(() => {
        if (isClient) {
            try {
                const rules = createMatrxWidgetRules();
                setWidgetRules(rules);
            } catch (error) {
                console.error('Error initializing widget rules:', error);
                setWidgetRules([]);
            }
        }
    }, [isClient]);
 
    // Update the editor content when converted content changes
    useEffect(() => {
        if (isActive && editorRef.current && isClient && convertedContent) {
            try {
                const instance = editorRef.current.getInstance();
                if (instance) {
                    const currentMarkdownInTui = instance.getMarkdown();
                    if (currentMarkdownInTui !== convertedContent) {
                        instance.setMarkdown(convertedContent, false);
                    }
                }
            } catch (e) {
                console.error("Error updating TUI editor with converted content:", e);
            }
        }
    }, [convertedContent, isActive, isClient]);
 
    const handleTuiChange = useCallback(() => {
        if (editorRef.current && isActive && onChange) {
            try {
                const instance = editorRef.current.getInstance();
                if (instance) {
                    const currentMarkdown = instance.getMarkdown();
                    // Convert back to your original format before sending to parent
                    const originalFormat = convertFromToastUIPattern(currentMarkdown);
                    onChange(originalFormat);
                }
            } catch (e) {
                console.error("Error getting markdown from TUI change:", e);
            }
        }
    }, [isActive, onChange]);
 
    // Sync content when becoming active
    useEffect(() => {
        if (isActive && editorRef.current && isClient && convertedContent) {
            // Ensure editor is visible when switching back to this tab
            setIsThemeReady(true);
            
            queueMicrotask(() => {
                if (editorRef.current) {
                    try {
                        const instance = editorRef.current.getInstance();
                        if (instance) {
                            const currentMarkdownInTui = instance.getMarkdown();
                            if (currentMarkdownInTui !== convertedContent) {
                                instance.setMarkdown(convertedContent, false);
                            }
                        }
                        
                        // Ensure theme is applied when becoming active
                        const editorEl = editorRef.current.getRootElement();
                        applyTheme(editorEl);
                    } catch (e) {
                        console.error("Error setting markdown when becoming active:", e);
                    }
                }
            });
        }
    }, [isActive, convertedContent, isClient, applyTheme]);
 
    const handleImageUpload = async (blob: File | Blob, callback: (url: string, altText?: string) => void) => {
        console.warn("Image upload not implemented.");
        alert("Image upload not configured. See console for details.");
    };
 
    // Only include plugins that are successfully loaded
    const editorPlugins: NonNullable<typeof colorSyntaxPlugin>[] = [];
    if (isClient && colorSyntaxPlugin) {
        editorPlugins.push(colorSyntaxPlugin);
    }
 
    // Get current markdown content and convert back to original format
    const getCurrentMarkdown = useCallback(() => {
        if (editorRef.current) {
            try {
                const instance = editorRef.current.getInstance();
                const currentMarkdown = instance ? instance.getMarkdown() : convertedContent;
                return convertFromToastUIPattern(currentMarkdown);
            } catch (e) {
                console.error("Error getting current markdown:", e);
                return content;
            }
        }
        return content;
    }, [content, convertedContent]);
 
    // Ref callback to apply theme immediately on mount
    // MUST be defined before any conditional returns (Rules of Hooks)
    const handleEditorRef = useCallback((instance: TuiEditorReactComp | null) => {
        // Clean up previous End/Home key handler
        if (endKeyCleanupRef.current) {
            endKeyCleanupRef.current();
            endKeyCleanupRef.current = null;
        }

        editorRef.current = instance;
        
        // Apply theme immediately when editor mounts
        if (instance && !hasAppliedInitialTheme.current) {
            // Apply theme synchronously first, then reveal editor
            const editorEl = instance.getRootElement();
            if (applyTheme(editorEl)) {
                hasAppliedInitialTheme.current = true;
                // Brief delay to ensure theme CSS has been applied before revealing
                setTimeout(() => {
                    setIsThemeReady(true);
                }, 50);
            }
        }

        // Fix End/Home key behavior — move to visual line boundary, not document boundary
        if (instance) {
            setTimeout(() => {
                const editorEl = instance.getRootElement();
                if (!editorEl) return;

                // Target the WYSIWYG contenteditable area (ProseMirror)
                const contentArea = editorEl.querySelector('[contenteditable="true"]');
                if (!contentArea) return;

                const handleEndHomeKey = (e: Event) => {
                    const keyEvent = e as KeyboardEvent;
                    // Only intercept End/Home without Ctrl/Cmd (those should still go to document start/end)
                    if (
                        (keyEvent.key === 'End' || keyEvent.key === 'Home') &&
                        !keyEvent.ctrlKey &&
                        !keyEvent.metaKey
                    ) {
                        const selection = window.getSelection();
                        if (!selection || selection.rangeCount === 0) return;

                        keyEvent.preventDefault();

                        const direction = keyEvent.key === 'End' ? 'forward' : 'backward';
                        const alter = keyEvent.shiftKey ? 'extend' : 'move';

                        // Selection.modify is non-standard but widely supported in all modern browsers
                        // It correctly handles visual line boundaries in contenteditable elements
                        (selection as unknown as { modify: (alter: string, direction: string, granularity: string) => void })
                            .modify(alter, direction, 'lineboundary');
                    }
                };

                contentArea.addEventListener('keydown', handleEndHomeKey, true);
                endKeyCleanupRef.current = () => {
                    contentArea.removeEventListener('keydown', handleEndHomeKey, true);
                };
            }, 100);
        }
    }, [applyTheme]);

    // Expose methods via ref
    React.useImperativeHandle(ref, () => ({
        getCurrentMarkdown,
        getInstance: () => editorRef.current?.getInstance(),
        getRootElement: () => editorRef.current?.getRootElement() ?? null,
    }));
 
    // Don't render editor until client is ready and content is converted
    if (!isClient || !convertedContent) {
        return <EditorLoading />;
    }

    return (
        <div 
            className={className}
            style={{
                backgroundColor: mode === "dark" ? "#1e1e1e" : "#ffffff",
                transition: "opacity 150ms ease-in-out",
                opacity: isThemeReady ? 1 : 0
            }}
        >
            <TuiEditor
                ref={handleEditorRef}
                key={`tui-editor-${mode}-${isActive}-${editMode}`}
                initialValue={convertedContent}
                initialEditType={editMode}
                previewStyle={editMode === "markdown" ? "vertical" : "tab"}
                height="100%"
                usageStatistics={false}
                plugins={editorPlugins}
                widgetRules={widgetRules}
                hooks={{
                    addImageBlobHook: handleImageUpload,
                }}
                onChange={handleTuiChange}
                hideModeSwitch={editMode === "markdown"}
            />
        </div>
    );
});

TuiEditorContent.displayName = "TuiEditorContent";

export default TuiEditorContent;
export type { TuiEditorContentProps, TuiEditorContentRef };

// Helper function to add event listener for MATRX widget clicks
export const addMatrxWidgetListener = (callback: (data: { id: string, name: string }) => void) => {
    const handleMatrxClick = (event: any) => {
        if (event.detail) {
            callback(event.detail);
        }
    };
    
    window.addEventListener('matrxWidgetClick', handleMatrxClick);
    
    return () => {
        window.removeEventListener('matrxWidgetClick', handleMatrxClick);
    };
};

