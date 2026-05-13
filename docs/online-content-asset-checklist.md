# Complete Asset Checklist for Online Content

Everything you need before publishing a blog post, podcast episode, or similar online resource. If you have all of this, you're set.

---

## 🖼️ Images & Visuals

### Featured / Hero Image
- **Dimensions:** 1920×1080px (1080p) or 1200×675px minimum (16:9)
- **Format:** WebP primary, with JPEG fallback
- **File size:** Under 200KB after compression
- **Use:** Main image at top of post; also drives social previews if no OG image is set

### Open Graph Image (Facebook, LinkedIn, Slack, iMessage previews)
- **Dimensions:** 1200×630px exactly (1.91:1 ratio)
- **Format:** JPEG or PNG (avoid WebP — some platforms don't render it)
- **File size:** Under 1MB, ideally 200–500KB
- **Tip:** Any text on the image must be readable at thumbnail size

### Twitter / X Card Image
- **Dimensions:** 1200×675px (16:9, for "summary_large_image" card)
- **Format:** JPEG or PNG
- **File size:** Under 5MB
- **Note:** The OG image often works here too if dimensions overlap

### Favicon Set
- **favicon.ico** — bundled 16×16, 32×32, 48×48
- **192×192px PNG** — Android home screen
- **512×512px PNG** — PWA/manifest
- **180×180px PNG** — Apple touch icon
- **favicon.svg** — optional, for modern browsers (scales perfectly)

### Logo
- **Primary:** SVG (vector, infinitely scalable, tiny file size)
- **Fallback:** PNG with transparency, at least 500px wide
- **Variants:** Light version (for dark backgrounds) and dark version

### Author Headshot / Avatar
- **Dimensions:** 400×400px minimum, square
- **Format:** JPEG or WebP
- **Use:** Byline, comments, schema markup, author page

### In-Content Images
- **Max width:** 1200px (matches most content column widths)
- **Format:** WebP with JPEG/PNG fallback
- **File size:** Under 150KB each
- **Always include:** Descriptive alt text (not "image1.jpg")

---

## 📝 Text & Metadata

### Title Tag
- 50–60 characters
- Primary keyword near the start
- Unique per page (no duplicates across the site)

### Meta Description
- 150–160 characters
- Compelling, with the primary keyword woven in naturally
- This is your SERP (Google search result) snippet

### URL Slug
- Lowercase, hyphens between words
- 3–5 words ideal
- Include the primary keyword
- Drop stop words ("the," "a," "of") when possible

### Heading Structure
- Exactly one H1 per page
- Logical H2 → H3 → H4 hierarchy (don't skip levels)

### Alt Text
- Every image needs descriptive alt text (≤125 characters)
- Describes what's *in* the image, not "photo of"

### Open Graph Tags
- `og:title`, `og:description`, `og:image`, `og:url`, `og:type`

### Twitter Card Tags
- `twitter:card` (use "summary_large_image"), `twitter:title`, `twitter:description`, `twitter:image`

### Schema Markup (JSON-LD)
- Article schema for blog posts
- PodcastEpisode schema for podcasts
- Include author, datePublished, dateModified, image, headline

### Canonical URL
- `<link rel="canonical">` tag to prevent duplicate-content issues

### Excerpt / Summary
- 1–2 sentence summary for feeds, previews, and category pages

### Author Bio
- Short version (1–2 sentences) for bylines
- Long version for dedicated author page

---

## 🎙️ Audio (Podcast Episodes)

### Audio File
- **Format:** MP3
- **Bitrate:** 128 kbps stereo (music/heavy production) or 96 kbps mono (pure spoken word)
- **Sample rate:** 44.1 kHz
- **Loudness:** -16 LUFS stereo / -19 LUFS mono (Apple Podcasts standard)
- **ID3 tags:** Title, Artist, Album, Track #, Year, Genre, cover art embedded

### Episode Artwork
- **Dimensions:** 3000×3000px (Apple max); 1400×1400px minimum
- **Format:** JPEG or PNG, RGB color space (not CMYK)
- **File size:** Under 500KB
- **Design:** Square, readable at thumbnail (40×40px) size

### Transcript
- Full text of the episode (massive SEO and accessibility win)
- Timestamps if possible
- Speaker labels for interviews

### Show Notes
- Episode summary (2–3 paragraphs)
- Timestamped chapter markers
- Guest bios with links
- All resources, books, tools, and URLs mentioned

---

## 🎬 Video (if applicable)

### Video File
- **Format:** MP4 (H.264 video + AAC audio)
- **Resolution:** 1080p minimum, 4K for premium
- **Bitrate:** 5–8 Mbps for 1080p, 35–45 Mbps for 4K

### Video Thumbnail
- **Dimensions:** 1280×720px (16:9)
- **Format:** JPEG, under 2MB
- **Design:** High contrast, readable text, clear focal point

### Captions / Subtitles
- **Format:** VTT (web) or SRT (universal)
- Boosts accessibility, SEO, and watch time

---

## ⚙️ Technical / Site-Wide

- **XML sitemap entry** — auto-generated for each new piece of content
- **RSS feed** — auto-updated (essential for podcasts)
- **Responsive images** — use `srcset` to serve right size per device
- **Lazy loading** — for any image below the fold
- **Page weight** — keep total under 1.5MB ideal, 3MB max
- **HTTPS** — non-negotiable for SEO and trust
- **Structured internal links** — link to 2–3 related pieces of your own content

---

## 🎯 Quick Pre-Publish Checklist

Before you hit publish, confirm:

- [ ] Hero image + OG image + Twitter image all sized correctly
- [ ] Title tag and meta description written (not auto-generated)
- [ ] URL slug is clean and keyword-aware
- [ ] All images have alt text
- [ ] Schema markup in place
- [ ] Canonical URL set
- [ ] Excerpt written
- [ ] Author bio attached
- [ ] (Podcast) Transcript + show notes done
- [ ] (Video) Captions uploaded
- [ ] Mobile preview checked
- [ ] Loads in under 3 seconds
