# API Test Configuration System

Centralized server selection and authentication for all API test pages.

## Architecture

**Ownership model:** The hook (`useApiTestConfig`) and its panel (`ApiTestConfigPanel`) jointly own server selection and validation. Pages provide a `defaultServerType` for instant render, but they NEVER perform their own health checks or override the config. All validation is handled at the header/panel level.

### How it works

1. Hook initializes with `defaultServerType` for zero-delay first paint
2. Hook immediately pings `{localUrl}/health` to validate localhost
3. If localhost is unreachable, auto-falls back to production
4. Panel disables the localhost toggle when server is unavailable
5. Manual toggle re-checks before switching

## Usage

```tsx
import { useApiTestConfig, ApiTestConfigPanel } from '@/components/api-test-config';

export default function MyTestPage() {
  const apiConfig = useApiTestConfig({
    defaultServerType: 'local',
    requireToken: true,
  });

  return (
    <div>
      <ApiTestConfigPanel config={apiConfig} />

      <button onClick={async () => {
        const response = await fetch(`${apiConfig.baseUrl}/ai/chat`, {
          headers: { 'Authorization': `Bearer ${apiConfig.authToken}` }
        });
      }}>
        Test API
      </button>
    </div>
  );
}
```

## Hook Options

```typescript
interface UseApiTestConfigOptions {
  defaultServerType?: 'local' | 'production';  // Default: 'production'
  defaultAuthToken?: string;                    // Fallback if no cookie stored
  localUrl?: string;         // Default: NEXT_PUBLIC_LOCAL_SOCKET_URL || 'http://localhost:8000'
  productionUrl?: string;    // Default: NEXT_PUBLIC_BACKEND_URL (from BACKEND_URLS.production)
  requireToken?: boolean;    // Default: true
}
```

## Hook Return Values

```typescript
interface UseApiTestConfigReturn {
  serverType: 'local' | 'production';
  authToken: string;
  baseUrl: string;
  setServerType: (type: ServerType) => void;
  setAuthToken: (token: string) => void;
  isCheckingLocalhost: boolean;
  isLocalhostAvailable: boolean;
  hasToken: boolean;
}
```

## Panel Props

```typescript
interface ApiTestConfigPanelProps {
  config: UseApiTestConfigReturn;
  className?: string;
  showAuthToken?: boolean;   // Default: true
  compact?: boolean;         // Default: false
  title?: React.ReactNode;
  actions?: React.ReactNode;
}
```

## Localhost Validation Flow

1. **On mount** — always pings `/health` with 2s timeout. Any HTTP response = available, network error = unavailable.
2. **Manual switch to localhost** — re-checks before committing. If unavailable, shows error toast and stays on production.
3. **Manual switch to production** — immediate, no check needed.
4. **Panel UI** — localhost toggle is disabled + dimmed when unavailable. Spinner shown during checks.

## Cookie Storage

Tokens are stored in browser cookies via `@/utils/api-test-auth`:
- Cookie: `api_test_admin_token`
- Max age: 1 year
- Path: `/`
- SameSite: `Lax`
- Secure on HTTPS

## Files

```
components/api-test-config/
├── index.ts                  # Barrel exports
├── useApiTestConfig.ts       # Hook — single source of truth
├── ApiTestConfigPanel.tsx    # UI — server toggle, token management
└── README.md

utils/
└── api-test-auth.ts          # Cookie read/write/clear utilities
```

## Consuming Pages

- `/demos/api-tests/unified-chat`
- `/demos/api-tests/chat`
- `/demos/api-tests/agent`
- `/demos/api-tests/pdf-extract`
- `/demos/api-tests/health`
