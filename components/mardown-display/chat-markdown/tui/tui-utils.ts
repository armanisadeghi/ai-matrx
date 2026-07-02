// Import your existing utilities
import { parseMatrxMetadata, MATRX_PATTERN, type MatrxMetadata } from '@/features/rich-text-editor/utils/patternUtils'; // adjust import path
import type { WidgetRule } from '@toast-ui/editor';

// Create a widget-specific pattern WITHOUT 'gs' flags (Toast UI needs this)
const WIDGET_MATRX_PATTERN = /<<<MATRX_START>>>(.*?)<<<MATRX_END>>>/;

export const matrxWidgetRules: WidgetRule[] = [
    {
        // Use the pattern without 'gs' flags for widget rules
        rule: WIDGET_MATRX_PATTERN,
        toDOM(text: string) {
            try {
                console.log('MATRX Widget processing:', text);
                
                // Use your existing pattern matching logic
                const match = text.match(WIDGET_MATRX_PATTERN);
                if (!match || !match[1]) {
                    console.warn('No MATRX match found');
                    return document.createTextNode(text);
                }
                
                const content = match[1];
                console.log('MATRX content:', content);
                
                // Use YOUR existing parseMatrxMetadata function
                const metadata = parseMatrxMetadata(content);
                console.log('Parsed metadata:', metadata);
                
                // Determine display text using your metadata structure
                const displayText = metadata.name || metadata.id || metadata.matrxRecordId || 'MATRX';
                
                // Create the widget container
                const container = document.createElement('span');
                container.className = 'matrx-widget-container';
                container.style.cssText = 'display: inline-block; vertical-align: middle;';
                
                // Store all the metadata as data attributes
                if (metadata.id) container.setAttribute('data-matrx-id', metadata.id);
                if (metadata.name) container.setAttribute('data-matrx-name', metadata.name);
                if (metadata.matrxRecordId) container.setAttribute('data-matrx-record-id', metadata.matrxRecordId);
                if (metadata.defaultValue) container.setAttribute('data-matrx-default-value', metadata.defaultValue);
                if (metadata.status) container.setAttribute('data-matrx-status', metadata.status);
                if (metadata.color) container.setAttribute('data-matrx-color', metadata.color);
                if (metadata.defaultComponent) container.setAttribute('data-matrx-component', metadata.defaultComponent);
                if (metadata.dataType) container.setAttribute('data-matrx-data-type', metadata.dataType);
                
                // Store the full content
                container.setAttribute('data-matrx-full-content', content);
                
                // Create the pill
                const pill = document.createElement('span');
                pill.className = 'matrx-pill';
                pill.textContent = `🔧 ${displayText}`;
                
                // Build tooltip with all available info
                const tooltipParts = [`MATRX: ${displayText}`];
                if (metadata.id && metadata.id !== displayText) tooltipParts.push(`ID: ${metadata.id}`);
                if (metadata.matrxRecordId) tooltipParts.push(`Record: ${metadata.matrxRecordId}`);
                if (metadata.status) tooltipParts.push(`Status: ${metadata.status}`);
                if (metadata.dataType) tooltipParts.push(`Type: ${metadata.dataType}`);
                
                pill.title = tooltipParts.join(' | ');
                
                // Apply styling based on status or use default
                const baseColor = metadata.color || '#4f46e5';
                const statusColors: Record<string, string> = {
                    'new': '#10b981',
                    'active': '#3b82f6',
                    'disconnected': '#f59e0b',
                    'deleted': '#ef4444'
                };

                const bgColor = statusColors[metadata.status] || baseColor;
                
                pill.style.cssText = `
                    background: ${bgColor} !important;
                    color: white !important;
                    padding: 3px 8px !important;
                    border-radius: 12px !important;
                    font-size: 11px !important;
                    font-weight: 500 !important;
                    display: inline-block !important;
                    margin: 0 2px !important;
                    cursor: pointer !important;
                    user-select: none !important;
                    vertical-align: middle !important;
                    white-space: nowrap !important;
                    max-width: 200px !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    border: 1px solid rgba(255,255,255,0.3) !important;
                    opacity: 1 !important;
                    transition: opacity 0.2s ease !important;
                `;
                
                // Simple hover effect
                pill.addEventListener('mouseenter', function() {
                    this.style.opacity = '0.8';
                });
                
                pill.addEventListener('mouseleave', function() {
                    this.style.opacity = '1';
                });
                
                // Click handler with all your metadata
                pill.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('MATRX Widget clicked:', metadata);
                    
                    // You can add custom click behavior here
                    // For example: trigger a callback, open a modal, etc.
                    
                    // Dispatch a custom event with the metadata
                    const customEvent = new CustomEvent('matrxWidgetClick', {
                        detail: metadata,
                        bubbles: true
                    });
                    this.dispatchEvent(customEvent);
                });
                
                container.appendChild(pill);
                console.log('MATRX Widget created successfully with metadata:', metadata);
                return container;
                
            } catch (error) {
                console.error('Error in MATRX widget toDOM:', error);
                // Simple fallback
                const fallback = document.createElement('span');
                fallback.textContent = '🔧 MATRX';
                fallback.style.cssText = `
                    background: #ef4444 !important;
                    color: white !important;
                    padding: 2px 6px !important;
                    border-radius: 6px !important;
                    font-size: 10px !important;
                    display: inline-block !important;
                `;
                return fallback;
            }
        }
    }
];

// Optional: Event listener you can add to listen for widget clicks
export const addMatrxWidgetListener = (callback: (metadata: MatrxMetadata) => void) => {
    document.addEventListener('matrxWidgetClick', (event: Event) => {
        callback((event as CustomEvent<MatrxMetadata>).detail); // event.detail contains your metadata
    });
};

// Example usage:
// addMatrxWidgetListener((metadata) => {
//     console.log('Widget clicked with metadata:', metadata);
//     // Handle the click - open modal, navigate, etc.
// });