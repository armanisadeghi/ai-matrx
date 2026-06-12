/**
 * Generate standalone interactive presentation HTML
 * Creates a self-contained HTML page with embedded CSS and JavaScript for navigation
 */

import { PresentationData } from './Slideshow';

/**
 * Generates a complete standalone HTML page with an interactive presentation
 */
export function generatePresentationHTML(presentationData: PresentationData): string {
    const { slides, theme } = presentationData;
    
    // Generate slide HTML
    const slidesHTML = slides.map((slide, index) => {
        if (slide.type === 'intro') {
            return `
                <div class="slide" data-slide="${index}">
                    <div class="slide-content intro-slide">
                        <h1 class="slide-title" style="color: ${theme.primaryColor};">
                            ${parseMarkdownAndEscape(slide.title)}
                        </h1>
                        ${slide.subtitle ? `<p class="slide-subtitle">${parseMarkdownAndEscape(slide.subtitle)}</p>` : ''}
                    </div>
                </div>
            `;
        } else {
            const bulletsHTML = slide.bullets && slide.bullets.length > 0
                ? `
                    <div class="bullets-container">
                        ${slide.bullets.map(bullet => `
                            <div class="bullet-item">
                                <div class="bullet-dot" style="background-color: ${theme.primaryColor};"></div>
                                <div class="bullet-text">${parseMarkdownAndEscape(bullet)}</div>
                            </div>
                        `).join('')}
                    </div>
                `
                : '';
            
            return `
                <div class="slide" data-slide="${index}">
                    <div class="slide-content">
                        <h2 class="slide-heading" style="color: ${theme.primaryColor};">
                            ${parseMarkdownAndEscape(slide.title)}
                        </h2>
                        ${slide.description ? `<p class="slide-description">${parseMarkdownAndEscape(slide.description)}</p>` : ''}
                        ${bulletsHTML}
                    </div>
                </div>
            `;
        }
    }).join('');

    // Generate complete HTML document
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(slides[0]?.title || 'Presentation')}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, ${theme.backgroundColor} 0%, ${adjustBrightness(theme.backgroundColor, -10)} 100%);
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .presentation-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            max-width: 1400px;
            width: 100%;
            margin: 0 auto;
            padding: 2rem;
            min-height: 0; /* Allow flex shrinking */
        }

        .slides-wrapper {
            position: relative;
            background: white;
            border-radius: 1rem;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            /* Fixed height on desktop to prevent layout shifts */
            height: 600px;
            min-height: 600px;
        }

        .slide {
            display: none;
            width: 100%;
            height: 100%;
            padding: 4rem;
            animation: fadeIn 0.5s ease-in-out;
        }

        .slide.active {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .slide-content {
            width: 100%;
            max-width: 900px;
        }

        .intro-slide {
            text-align: center;
        }

        .slide-title {
            font-size: 4rem;
            font-weight: 700;
            margin-bottom: 1.5rem;
            line-height: 1.2;
        }

        .slide-subtitle {
            font-size: 1.75rem;
            color: #6B7280;
            line-height: 1.5;
        }

        .slide-heading {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 1rem;
            line-height: 1.2;
        }

        .slide-description {
            font-size: 1.5rem;
            color: #6B7280;
            margin-bottom: 2rem;
            line-height: 1.6;
        }

        .bullets-container {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .bullet-item {
            display: flex;
            align-items: flex-start;
            gap: 1rem;
            padding: 1rem;
            background: #F9FAFB;
            border-radius: 0.5rem;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .bullet-item:hover {
            transform: translateX(8px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .bullet-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-top: 0.625rem;
            flex-shrink: 0;
        }

        .bullet-text {
            font-size: 1.25rem;
            color: #1F2937;
            line-height: 1.6;
        }

        .navigation {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2rem;
            padding: 2rem 0 1rem;
        }

        .nav-button {
            background: white;
            border: none;
            width: 3rem;
            height: 3rem;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .nav-button:hover:not(:disabled) {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .nav-button:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }

        .nav-button svg {
            width: 1.25rem;
            height: 1.25rem;
            fill: #1F2937;
        }

        .slide-indicator {
            font-size: 1rem;
            color: white;
            font-weight: 500;
            background: rgba(0, 0, 0, 0.2);
            padding: 0.5rem 1.25rem;
            border-radius: 2rem;
            backdrop-filter: blur(10px);
        }

        /* Responsive design */
        @media (max-width: 768px) {
            body {
                overflow: auto; /* Allow scrolling on mobile if needed */
            }

            .presentation-container {
                padding: 0;
                min-height: 100dvh;
            }

            .slides-wrapper {
                /* Full viewport on mobile, no fixed height */
                height: auto;
                min-height: calc(100dvh - 100px); /* Leave room for navigation */
                border-radius: 0;
                flex: 1;
            }

            .slide {
                padding: 2rem 1.5rem;
                min-height: calc(100dvh - 100px);
            }

            .slide-title {
                font-size: 2.5rem;
            }

            .slide-subtitle {
                font-size: 1.25rem;
            }

            .slide-heading {
                font-size: 2rem;
            }

            .slide-description {
                font-size: 1.125rem;
            }

            .bullet-text {
                font-size: 1rem;
            }

            .bullet-dot {
                margin-top: 0.425rem;
            }

            .navigation {
                padding: 1rem 0;
                background: ${theme.backgroundColor};
                position: sticky;
                bottom: 0;
                z-index: 10;
            }
        }

        /* Tablet and larger - stable height */
        @media (min-width: 769px) {
            .slides-wrapper {
                /* Increase height on larger screens */
                height: calc(100dvh - 180px);
                min-height: 600px;
                max-height: 800px;
            }
        }

        /* Extra large screens */
        @media (min-width: 1400px) {
            .slides-wrapper {
                height: calc(100dvh - 200px);
                max-height: 900px;
            }
        }

        /* Print styles */
        @media print {
            body {
                background: white;
            }

            .slide {
                display: block !important;
                page-break-after: always;
                height: auto;
                min-height: 100dvh;
            }

            .navigation {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="presentation-container">
        <div class="slides-wrapper">
            ${slidesHTML}
        </div>
        
        <div class="navigation">
            <button class="nav-button" id="prevBtn" onclick="previousSlide()">
                <svg viewBox="0 0 24 24">
                    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                </svg>
            </button>
            
            <div class="slide-indicator">
                <span id="currentSlide">1</span> / <span id="totalSlides">${slides.length}</span>
            </div>
            
            <button class="nav-button" id="nextBtn" onclick="nextSlide()">
                <svg viewBox="0 0 24 24">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
            </button>
        </div>
    </div>

    <script>
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        const totalSlides = slides.length;
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const currentSlideSpan = document.getElementById('currentSlide');

        function showSlide(index) {
            slides.forEach(slide => slide.classList.remove('active'));
            slides[index].classList.add('active');
            currentSlideSpan.textContent = index + 1;
            
            prevBtn.disabled = index === 0;
            nextBtn.disabled = index === totalSlides - 1;
        }

        function nextSlide() {
            if (currentSlide < totalSlides - 1) {
                currentSlide++;
                showSlide(currentSlide);
            }
        }

        function previousSlide() {
            if (currentSlide > 0) {
                currentSlide--;
                showSlide(currentSlide);
            }
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                nextSlide();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                previousSlide();
            } else if (e.key === 'Home') {
                e.preventDefault();
                currentSlide = 0;
                showSlide(currentSlide);
            } else if (e.key === 'End') {
                e.preventDefault();
                currentSlide = totalSlides - 1;
                showSlide(currentSlide);
            }
        });

        // Touch/swipe support
        let touchStartX = 0;
        let touchEndX = 0;

        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });

        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        });

        function handleSwipe() {
            if (touchEndX < touchStartX - 50) {
                nextSlide();
            }
            if (touchEndX > touchStartX + 50) {
                previousSlide();
            }
        }

        // Initialize
        showSlide(0);
    </script>
</body>
</html>`;
}

/**
 * Helper to parse markdown and escape HTML
 * Converts **bold** to <strong>bold</strong> and escapes other HTML
 */
function parseMarkdownAndEscape(text: string): string {
    // First escape HTML special characters
    const escaped = text.replace(/[&<>"']/g, (m) => {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return map[m];
    });
    
    // Then convert markdown bold to HTML strong tags
    return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Helper to escape HTML special characters (deprecated - use parseMarkdownAndEscape)
 */
function escapeHtml(text: string): string {
    return parseMarkdownAndEscape(text);
}

/**
 * Helper to adjust color brightness
 */
function adjustBrightness(color: string, percent: number): string {
    // Simple hex color brightness adjustment
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
}

