import { siteConfig } from '@/config/extras/site'
import { EDU_ORIGIN } from '@/features/education/constants'
import { getEducationSitemapPaths } from '@/features/education/publishing/sitemap'
import { MODULE_LANDING_DIRECTORY } from '@/features/auth/components/module-landing/landings/directory'
import { MARKETING_PUBLIC_TOOLS } from '@/features/marketing/lib/marketing-nav'
import { listSearchEngineIndexedRecords } from '@/lib/seo/search-engine-indexed.server'
import { getScriptSupabaseClient } from '@/utils/supabase/getScriptClient'

/**
 * THE INDEXED SWITCH (access ladder T-12): every published record in the sitemap comes from
 * `platform.search_engine_indexed_records`, which returns only records that are published to
 * the web AND indexed (the creator's choice, else the type knob). A record switched off
 * leaves the sitemap on the next read. Anyone-link and secure-link pages never appear.
 */
async function getIndexedRecordUrls(baseUrl: string) {
  const [episodes, shows, articles, apps, canvases, flashcards, notes, templates] =
    await Promise.all([
      listSearchEngineIndexedRecords('pc_episode'),
      listSearchEngineIndexedRecords('pc_show'),
      listSearchEngineIndexedRecords('pc_article'),
      listSearchEngineIndexedRecords('app'),
      listSearchEngineIndexedRecords('shared_canvas_item'),
      listSearchEngineIndexedRecords('fc_set'),
      listSearchEngineIndexedRecords('note'),
      listSearchEngineIndexedRecords('message_template'),
    ])
  const out: { loc: string; changefreq: string; priority: string }[] = []
  for (const r of [...shows, ...episodes]) {
    out.push({ loc: `${baseUrl}/podcast/${encodeURIComponent(r.slug ?? r.id)}`, changefreq: 'weekly', priority: '0.7' })
  }
  // A blog post lives at its episode's address: /podcast/<episode slug>/blog.
  if (articles.length) {
    const sb = getScriptSupabaseClient()
    const { data: arts, error } = await sb
      .schema('podcast')
      .from('pc_articles')
      .select('id,episode_id,kind')
      .in('id', articles.map((a) => a.id))
      .eq('kind', 'blog')
    if (error) throw new Error(`[sitemap] blog posts: ${error.message}`)
    const episodeIds = [...new Set((arts ?? []).map((a) => a.episode_id).filter(Boolean))] as string[]
    if (episodeIds.length) {
      const { data: eps, error: epErr } = await sb
        .schema('podcast')
        .from('pc_episodes')
        .select('id,slug')
        .in('id', episodeIds)
        .eq('is_published', true)
        .is('deleted_at', null)
      if (epErr) throw new Error(`[sitemap] blog episodes: ${epErr.message}`)
      for (const e of eps ?? []) {
        out.push({ loc: `${baseUrl}/podcast/${encodeURIComponent(e.slug ?? e.id)}/blog`, changefreq: 'monthly', priority: '0.6' })
      }
    }
  }
  for (const r of apps) out.push({ loc: `${baseUrl}/p/${encodeURIComponent(r.slug ?? r.id)}`, changefreq: 'monthly', priority: '0.5' })
  for (const r of canvases) out.push({ loc: `${baseUrl}/canvas/shared/${r.id}`, changefreq: 'monthly', priority: '0.5' })
  for (const [type, rows] of [['fc_set', flashcards], ['note', notes], ['message_template', templates]] as const) {
    for (const r of rows) out.push({ loc: `${baseUrl}/p/e/${type}/${r.id}`, changefreq: 'monthly', priority: '0.4' })
  }
  return out
}

// Revalidate hourly; a learn-doc publish busts the education reads via tag.
export const revalidate = 3600

// The sitemap includes live database-backed education content. Keep that read
// out of the production build so a temporary database or network outage cannot
// fail an otherwise healthy deployment; the route remains hourly cached.
export const dynamic = 'force-dynamic'

export async function GET() {
  const baseUrl = siteConfig.url

  const staticUrls = [
    { loc: baseUrl, changefreq: 'weekly', priority: '1.0' },
    { loc: `${baseUrl}/login`, changefreq: 'monthly', priority: '0.9' },
    { loc: `${baseUrl}/sign-up`, changefreq: 'monthly', priority: '0.9' },
    { loc: `${baseUrl}/contact`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${baseUrl}/how-it-works`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${baseUrl}/why-ai-matrx`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${baseUrl}/how-we-prove-it`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${baseUrl}/the-landscape`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${baseUrl}/privacy-policy`, changefreq: 'yearly', priority: '0.5' },
    { loc: `${baseUrl}/terms-of-service`, changefreq: 'yearly', priority: '0.5' },
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

  // Module landings — every public feature front door, derived from the ONE
  // directory that also drives /features. A landing registered there is
  // crawlable the moment it ships; nothing to remember to add here.
  const moduleLandingUrls = MODULE_LANDING_DIRECTORY.map((entry) => ({
    loc: `${baseUrl}${entry.href}`,
    changefreq: 'weekly',
    priority: '0.8',
  }))

  // Public SEO tool suite — the free anonymous utilities on /seo/*. Derived
  // from MARKETING_PUBLIC_TOOLS, the same declaration that drives /seo and
  // /marketing/tools, so a tool is crawlable the moment it ships and a
  // reserved ("coming-soon") route can never leak into the sitemap. These are
  // the flagship utility-tool growth surfaces — see
  // common-docs/systems/marketing/ai-matrx-internal-seo/VISION.md.
  const seoToolUrls = MARKETING_PUBLIC_TOOLS.filter((tool) =>
    tool.href.startsWith('/seo/')
  ).map((tool) => ({
    loc: `${baseUrl}${tool.href}`,
    changefreq: 'monthly',
    priority: '0.8',
  }))

  const recordUrls = await getIndexedRecordUrls(baseUrl)

  const urls = [
    ...staticUrls,
    { loc: `${baseUrl}/features`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${baseUrl}/seo`, changefreq: 'weekly', priority: '0.8' },
    ...seoToolUrls,
    ...moduleLandingUrls,
    ...educationUrls,
    ...recordUrls,
  ]
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
