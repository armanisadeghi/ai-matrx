# 🔐 API Key Setup Checklist

## Immediate Action Required

**Your API key was shared in chat and needs to be secured!**

### Option 1: Restrict Current Key (Quick)

1. ✅ Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. ✅ Click the API key used by this demo. The previously embedded value was
   removed from this checklist on 2026-08-08.
3. ✅ Under "API restrictions":
   - Select "Restrict key"
   - Enable ONLY: ☑️ PageSpeed Insights API
   - Disable all others
4. ✅ Under "Application restrictions":
   - Select "HTTP referrers"
   - Add your domains:
     ```
     localhost:*/*
     127.0.0.1:*/*
     https://yourdomain.com/*
     ```
5. ✅ Click "Save"

### Option 2: Create New Keys (Recommended)

#### Development Key
1. Create new API key
2. Name it: "PageSpeed API - Development"
3. Restrict to PageSpeed Insights API only
4. Allow localhost
5. Add to `.env.local`:
   ```env
   NEXT_PUBLIC_GOOGLE_API_KEY=your_new_dev_key
   ```

#### Production Key
1. Create another new API key
2. Name it: "PageSpeed API - Production"
3. Restrict to PageSpeed Insights API only
4. Allow ONLY your production domain(s)
5. Add to Vercel/hosting environment variables

### After Setting Restrictions

Delete or regenerate the exposed key from chat:
- The previously embedded key (fingerprint `3f6c5e3d9598`) must be rotated if
  its owning Google project is recovered; never put a key value in this file.

## Production Deployment

### Vercel Setup
```bash
# Set environment variable in Vercel
vercel env add NEXT_PUBLIC_GOOGLE_API_KEY production
# Paste your production key when prompted
```

Or via Vercel Dashboard:
1. Project Settings → Environment Variables
2. Add `NEXT_PUBLIC_GOOGLE_API_KEY`
3. Select "Production" environment
4. Save and redeploy

### Other Hosting Platforms
- **Netlify**: Site settings → Environment variables
- **AWS Amplify**: App settings → Environment variables
- **Railway**: Variables tab

## Verification

Test your setup:
1. ✅ Key is not in git/public code
2. ✅ API restrictions enabled
3. ✅ HTTP referrer restrictions set
4. ✅ `.env.local` in `.gitignore`
5. ✅ Production key in hosting platform
6. ✅ Test API calls work locally
7. ✅ Test API calls work in production

## Rate Limits

- With API Key: 25,000 queries/day
- Monitor at: [API Dashboard](https://console.cloud.google.com/apis/dashboard)

## Need Help?

See `SECURITY.md` for detailed security guide.
