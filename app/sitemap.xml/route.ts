import { siteConfig } from '@/config/extras/site'
import { EDU_ORIGIN } from '@/features/education/constants'
import { getEducationSitemapPaths } from '@/features/education/publishing/sitemap'

// Revalidate hourly; a learn-doc publish busts the education reads via tag.
export const revalidate = 3600

export async function GET() {
  const baseUrl = siteConfig.url

  const staticUrls = [
    { loc: baseUrl, changefreq: 'weekly', priority: '1.0' },
    { loc: `${baseUrl}/login`, changefreq: 'monthly', priority: '0.9' },
    { loc: `${baseUrl}/sign-up`, changefreq: 'monthly', priority: '0.9' },
    { loc: `${baseUrl}/contact`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${baseUrl}/privacy-policy`, changefreq: 'yearly', priority: '0.5' },
    { loc: `${baseUrl}/terms-and-conditions`, changefreq: 'yearly', priority: '0.5' },
    { loc: `${baseUrl}/sms`, changefreq: 'yearly', priority: '0.5' },
    { loc: `${baseUrl}/appointment-reminder`, changefreq: 'monthly', priority: '0.7' },
    { loc: `${baseUrl}/canvas/discover`, changefreq: 'weekly', priority: '0.7' },
    { loc: `${baseUrl}/free/games/matrx-jump`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${baseUrl}/free/games/matrx-jump/character-maker`, changefreq: 'monthly', priority: '0.5' },
    { loc: `${baseUrl}/free/games/tic-tac-toe`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${baseUrl}/free/uuid/generator`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${baseUrl}/free/uuid/array`, changefreq: 'monthly', priority: '0.5' },
    { loc: `${baseUrl}/free/character-counter`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${baseUrl}/free/zip-code-heatmap`, changefreq: 'monthly', priority: '0.6' },
  ]

  // Education Hub — every axis index/entry + published learn doc + live tool
  // + public creator page (/c/<handle>). Prefixed with EDU_ORIGIN (not the
  // site's baseUrl) so these entries point at the configured public education
  // origin — aimatrx.com by default, learn.aimatrx.com once
  // NEXT_PUBLIC_EDU_ORIGIN is set. See features/education/constants.ts#EDU_ORIGIN.
  const educationUrls = (await getEducationSitemapPaths()).map((u) => ({
    loc: `${EDU_ORIGIN}${u.path}`,
    changefreq: u.changefreq,
    priority: u.priority,
  }))

  const urls = [...staticUrls, ...educationUrls]
  const now = new Date().toISOString()

  // Escape XML metacharacters — `loc` includes author-controlled doc slugs.
  const xmlEscape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${xmlEscape(url.loc)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  })
}
