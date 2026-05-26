# Security & Production Setup Guide

## ⚠️ IMPORTANT: API Key Security

### Development vs Production Keys

**Best Practice: Use separate API keys for development and production.**

### Setting Up API Key Restrictions

#### For Development Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your API key
3. Under "API restrictions":
   - ✅ Select "Restrict key"
   - ✅ Enable only: **PageSpeed Insights API**
4. Under "Application restrictions":
   - For local development: Select "HTTP referrers (web sites)"
   - Add: `localhost:*` and `127.0.0.1:*`
   - Or use "None" for development (less secure but easier)

#### For Production Key
1. Create a **new API key** (separate from dev)
2. Under "API restrictions":
   - ✅ Select "Restrict key"
   - ✅ Enable only: **PageSpeed Insights API**
3. Under "Application restrictions":
   - ✅ Select "HTTP referrers (web sites)"
   - ✅ Add your production domain: `https://yourdomain.com/*`
   - ✅ Add your preview domains if using Vercel: `https://*.vercel.app/*`

### Environment Variables

#### Development (`.env.local`)
```env
NEXT_PUBLIC_GOOGLE_API_KEY=your_dev_key_here
```

#### Production (Vercel/Hosting Platform)
```env
NEXT_PUBLIC_GOOGLE_API_KEY=your_production_key_here
```

**Set this in your hosting platform's environment variables, NOT in your code.**

### Rate Limits

- **Without API Key**: 400 queries/minute, 25,000 queries/day
- **With API Key**: 25,000 queries/day (higher limit)

### 🔒 Security Checklist

- [ ] Create separate API keys for dev and prod
- [ ] Enable API restrictions (only PageSpeed Insights API)
- [ ] Enable application restrictions (HTTP referrers)
- [ ] Add only your actual domains to allowed referrers
- [ ] Never commit API keys to git
- [ ] Add `.env.local` to `.gitignore`
- [ ] Rotate keys if exposed
- [ ] Monitor usage in Google Cloud Console

### Current Setup

Your hook automatically uses the API key if available:

```typescript
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
if (apiKey) {
    params.append("key", apiKey);
}
```

### 🚨 Key Rotation Required

**NOTE**: The API key you shared in chat is now exposed and should be rotated immediately:

1. Go to Google Cloud Console
2. Delete or regenerate the exposed key
3. Create a new key with proper restrictions
4. Update your `.env.local` file

### Monitoring Usage

1. Go to [Google Cloud Console → APIs & Services → Dashboard](https://console.cloud.google.com/apis/dashboard)
2. Click on "PageSpeed Insights API"
3. View your usage metrics and quotas
4. Set up budget alerts to avoid unexpected charges (PageSpeed API is free, but good practice)

### Alternative: Server-Side API Calls

For better security, you could move the API call to a Next.js API route:

**Pros:**
- API key stays server-side (not exposed to client)
- Better security
- Can add rate limiting

**Cons:**
- Extra server hop
- Slightly more complex

Would you like me to implement a server-side version?

