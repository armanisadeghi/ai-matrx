import { siteConfig } from '@/config/extras/site'

export function GET() {
  const body = `User-agent: *
Allow: /
Allow: /contact
Allow: /privacy-policy
Allow: /terms-of-service
Allow: /terms-and-conditions
Allow: /appointment-reminder
Allow: /education
Allow: /canvas
Allow: /free
Disallow: /api/
Disallow: /auth/
Disallow: /dashboard
Disallow: /admin
Disallow: /settings
Disallow: /tasks
Disallow: /notes
Disallow: /files
Disallow: /chat
Disallow: /apps
Disallow: /workflows

Sitemap: ${siteConfig.url}/sitemap.xml
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}
