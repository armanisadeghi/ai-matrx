---
description: How to log in and test the app in a browser
---

# Browser Testing Workflow

## Test Credentials

Use these credentials to log into the application at `http://localhost:3000/login`:

- **Email:** `admin@admin.com`
- **Password:** `Password1234#`

## Login Steps

1. Navigate to `http://localhost:3000/login`
2. Enter email: `admin@admin.com`
3. Enter password: `Password1234#`
4. Click the "Sign in" button
5. You should be redirected to the dashboard or the page specified in `?redirectTo=`

## Notes

- The dev server runs on `http://localhost:3000` by default
- After login, the session persists across page navigations
- The SSR chat route is at `/demos/chat`
- Mobile testing can be done by resizing the browser to 390x844 (iPhone 14) or similar
