# AI Matrx Widget Architecture Spec

## Iframe-Isolated Micro-App System for AI-Generated Interactive Content

**Version:** 1.0  
**Date:** March 18, 2026  
**Author:** Arman / AI Matrx Team  
**Status:** Technical Specification — Ready for Team Review

---

## 1. Background & Inspiration

### 1.1 What We Observed

Anthropic's Claude chat interface renders rich interactive content (charts, diagrams, interactive explainers) inside **sandboxed iframes** rather than inline React components. The key artifact is an iframe pointing to a content-addressed subdomain:

```
https://{content-hash}.claudemcpcontent.com/mcp_apps?connect-src=...&resource-src=...&dev=true
```

This pattern solves a problem we've been working through in our own streaming block/constitution system: **how do you let AI-generated code render rich, interactive UIs without compromising the parent application?**

### 1.2 Why This Matters for AI Matrx

Our current architecture renders AI-generated structured blocks (timeline, flashcards, quiz, diagrams, etc.) inline within the React component tree. This works but has limitations:

- AI-generated code runs in the same context as the parent app
- Every new block type requires a new React component in Matrx Admin's bundle
- Interactive blocks (flip animations, state management, games) add complexity to the parent app
- No isolation — a bug in widget code can crash the parent

The iframe widget pattern eliminates all of these issues.

---

## 2. Reverse-Engineering: How Anthropic Does It

### 2.1 The Domain Pattern

```
https://{hash}.claudemcpcontent.com/mcp_apps
```

Each widget gets a **unique content-addressed subdomain**. The hash is likely derived from the widget code itself (SHA-256 or similar). This means:

- Every widget runs on its own **origin** (browser same-origin policy isolation)
- One widget can never access another widget's DOM, cookies, or storage
- Identical widget code produces the same hash (deduplication + caching for free)

### 2.2 Iframe Sandbox Attributes

```html
<iframe
  sandbox="allow-scripts allow-same-origin allow-forms"
  allow="fullscreen *; clipboard-write *"
  src="..."
/>
```

**What's allowed:**

| Permission | Purpose |
|---|---|
| `allow-scripts` | Widget JS can execute |
| `allow-same-origin` | Widget can use localStorage, cookies (within its isolated origin) |
| `allow-forms` | Form submissions work (quiz inputs, etc.) |
| `fullscreen` | Widget can go fullscreen (immersive experiences) |
| `clipboard-write` | "Copy to clipboard" buttons work inside widgets |

**What's blocked (by omission):**

| Blocked | Effect |
|---|---|
| `allow-top-navigation` | Widget cannot redirect the parent page |
| `allow-popups` | Widget cannot open new windows/tabs |
| `allow-modals` | Widget cannot trigger `alert()`, `confirm()`, `prompt()` |
| `allow-pointer-lock` | Widget cannot capture the mouse |

### 2.3 Content Security Policy via Query Parameters

```
?connect-src=esm.sh+cdnjs.cloudflare.com+cdn.jsdelivr.net+unpkg.com
&resource-src=esm.sh+cdnjs.cloudflare.com+cdn.jsdelivr.net+unpkg.com+assets.claude.ai
```

The widget host server reads these query params and sets actual CSP response headers. This creates a **whitelist of allowed external resources** — the widget can import libraries from esm.sh, load Chart.js from cdnjs, etc., but cannot fetch from arbitrary servers.

This is a brilliant pattern: **the parent controls what the child can access, enforced at the HTTP level.**

### 2.4 Container & Lifecycle Pattern

```html
<!-- Placeholder: zero height, reserves space during streaming -->
<div id="mcp-app-placeholder-toolu_{id}" style="height: 0px;"></div>

<!-- Container: holds the iframe once ready -->
<div id="mcp-app-container-toolu_{id}">
  <iframe ... style="height: 1017px;"></iframe>
</div>
```

- The `toolu_` prefix ties the widget to a specific tool invocation in the AI response
- The placeholder div is for streaming UIs — space is reserved before content is ready
- The iframe height (`1017px`) comes from a `postMessage` resize event fired by the widget

### 2.5 Dev Mode

The `dev=true` query parameter likely toggles:

- Error overlays / stack traces inside the widget
- Relaxed CSP for debugging
- Source maps
- Verbose console logging

---

## 3. Full Architecture Flow (Reverse-Engineered)

```
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│  AI Model   │───▶│  Platform    │───▶│  Widget Host     │
│  generates  │    │  hashes code │    │  stores & serves  │
│  widget code│    │  returns URL │    │  with CSP headers │
└─────────────┘    └──────────────┘    └──────────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  Frontend    │
                   │  renders     │
                   │  <iframe>    │
                   └──────┬───────┘
                          │
                   postMessage ↕
                          │
                   ┌──────┴───────┐
                   │  Widget      │
                   │  (isolated)  │
                   └──────────────┘
```

1. **AI Dream generates widget code** (HTML/JS/CSS) as part of a structured block
2. **The platform hashes the code** and stores it on the Widget Host Service
3. **The Widget Host** serves the code at `https://widgets.aimatrx.com/w/{hash}` with CSP headers
4. **The frontend** (Matrx Admin, Matrx Local, Matrx Mobile) renders the appropriate container (iframe, WebView, etc.)
5. **The widget communicates** with the parent via postMessage for resizing, actions, and data

---

## 4. Platform Compatibility Matrix

### 4.1 Where It Works

| Environment | iframe Support | Communication | Offline Mode | Performance |
|---|---|---|---|---|
| **Next.js (Matrx Admin)** | Native `<iframe>` | `postMessage` | N/A (always online) | Excellent |
| **Vite/React (Matrx Local)** | Native `<iframe>` in webview | `postMessage` | Local FastAPI host on localhost | Excellent |
| **React Native (Matrx Mobile)** | Via `react-native-webview` | `onMessage` / `injectJavaScript` | Cache HTML bundles | Good (see 4.2) |
| **Plain HTML (embeds)** | Native `<iframe>` | `postMessage` | N/A | Excellent |

### 4.2 React Native — Specific Considerations

React Native doesn't have `<iframe>`. Instead, use `react-native-webview`:

```jsx
<WebView
  source={{ uri: 'https://widgets.aimatrx.com/w/{hash}' }}
  javaScriptEnabled={true}
  originWhitelist={['*']}
  onMessage={(event) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'resize') setHeight(data.height);
  }}
  style={{ height: widgetHeight }}
/>
```

**Performance note:** Each WebView is expensive on mobile. However, in practice, **you'd almost never have more than 1-2 widgets visible in a single session**, so this is a non-issue for real-world usage. If edge cases arise, virtualize — only mount WebViews for widgets in the viewport.

**Gesture handling:** Scrolling inside a WebView vs. the parent ScrollView can conflict. Set `scrollEnabled={false}` on the WebView if the widget content fits without scrolling, or manage `nestedScrollEnabled` on the parent.

**Theme injection:** No shared CSS variables across the native/web boundary. Pass theme data as query params or inject via `injectJavaScript`:

```javascript
webViewRef.current.injectJavaScript(`
  document.documentElement.style.setProperty('--bg-color', '${theme.bg}');
  document.documentElement.style.setProperty('--text-color', '${theme.text}');
`);
```

---

## 5. Key Use Cases & How They Work

### 5.1 Animation & Interactivity (Flashcards That Flip)

Flashcards with flip animations are a perfect widget use case. The widget is self-contained HTML/CSS/JS:

```html
<!-- Served by Widget Host as a standalone page -->
<style>
  .card { perspective: 1000px; cursor: pointer; }
  .card-inner {
    transition: transform 0.6s;
    transform-style: preserve-3d;
  }
  .card.flipped .card-inner { transform: rotateY(180deg); }
  .card-front, .card-back {
    backface-visibility: hidden;
    position: absolute;
    width: 100%; height: 100%;
  }
  .card-back { transform: rotateY(180deg); }
</style>

<div class="card" onclick="this.classList.toggle('flipped')">
  <div class="card-inner">
    <div class="card-front">Question: What is HTTP/2?</div>
    <div class="card-back">Answer: A major revision of HTTP...</div>
  </div>
</div>
```

This runs entirely inside the iframe. The parent app doesn't need to know anything about CSS 3D transforms or flip animations. **Any animation library works** — GSAP, Framer Motion (if you bundle it), pure CSS, Three.js, whatever the AI decides to use.

### 5.2 Modal Pop-Out

**Yes — a modal can absolutely be another widget wrapping inner content.**

Two approaches:

**Approach A: Modal inside the widget (simpler)**

The widget itself contains a "full view" button that expands its content within the iframe. Since the iframe has `allow="fullscreen *"`, the widget can request fullscreen:

```javascript
document.getElementById('expand-btn').addEventListener('click', () => {
  document.documentElement.requestFullscreen();
});
```

This gives you a true fullscreen modal experience without any parent coordination.

**Approach B: Modal managed by the parent (more control)**

The widget sends a postMessage to the parent requesting a modal:

```javascript
// Inside widget
window.parent.postMessage({
  type: 'request-modal',
  widgetHash: 'abc123',  // or inline HTML
  title: 'Full Quiz View'
}, '*');
```

The parent app (Matrx Admin) receives this, opens its own modal component, and renders a **new iframe** inside it pointing to the same (or different) widget hash. The modal wrapper is a parent-side concern; the widget content is still isolated.

**Approach C: Nested widget (most flexible)**

Create a "modal widget" that accepts another widget hash as a parameter:

```
https://widgets.aimatrx.com/w/{modal-widget-hash}?inner={content-widget-hash}
```

The modal widget renders chrome (close button, backdrop, title bar) and embeds the inner widget in its own sub-iframe. This is widget composition — widgets containing widgets.

**Recommendation:** Start with Approach B. It gives the parent app control over modal behavior (animation, backdrop, close-on-escape, etc.) while keeping widget content isolated. The parent already has a modal system — reuse it.

### 5.3 Data Persistence (Quiz Scores, Progress Tracking)

This is where `allow-same-origin` in the sandbox becomes critical. Because each widget runs on its own origin (`{hash}.widgets.aimatrx.com`), it **can use localStorage and sessionStorage** within that origin.

However, for real persistence (quiz scores that survive across sessions, progress tracking), you have three options:

**Option 1: Widget calls your API directly**

The widget's CSP whitelist includes your API domain:

```
?connect-src=api.aimatrx.com+esm.sh+cdnjs.cloudflare.com
```

The widget makes fetch calls to AI Dream:

```javascript
// Inside widget
const response = await fetch('https://api.aimatrx.com/v1/widget-data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}` // passed via query param or postMessage
  },
  body: JSON.stringify({
    widget_id: 'quiz-abc123',
    user_id: userId,
    data: { score: 8, total: 10, completed_at: new Date().toISOString() }
  })
});
```

**Option 2: Widget sends data to parent via postMessage, parent persists**

```javascript
// Inside widget
window.parent.postMessage({
  type: 'persist-data',
  key: 'quiz-results',
  data: { score: 8, total: 10 }
}, '*');

// Parent app (Matrx Admin)
window.addEventListener('message', (event) => {
  if (event.data.type === 'persist-data') {
    // Save to Supabase, local state, wherever
    supabase.from('widget_data').upsert({
      widget_key: event.data.key,
      user_id: currentUser.id,
      data: event.data.data
    });
  }
});
```

**Option 3: Anthropic's approach — key-value storage API**

Anthropic exposes `window.storage` as a bridge injected into the iframe. We can do the same:

```javascript
// Parent injects a storage bridge into the iframe via postMessage protocol
// Widget uses it like:
const result = await window.storage.get('quiz:progress');
await window.storage.set('quiz:progress', JSON.stringify({ score: 8 }));
```

Under the hood, every `.get()` and `.set()` call sends a postMessage to the parent, which handles the actual persistence (Supabase, localStorage, whatever).

**Recommendation:** Use Option 2 for the initial implementation — it's the simplest and keeps all persistence logic in the parent app where you already have Supabase wired up. Graduate to Option 3 (injected storage API) when you want a cleaner DX for widget authors.

---

## 6. Widget Host Service — Technical Design

### 6.1 Technology Choice

**Recommendation: Python / FastAPI (part of AI Dream or a lightweight standalone service)**

Reasoning:

- Consistent with AI Matrx's backend stack
- FastAPI is already your core server framework
- Lightweight — this service is essentially a key-value store with HTTP
- Can be deployed as a route group within AI Dream or as a standalone Coolify service
- For Matrx Local offline mode, the same code runs on the local Python backend

**Alternatively**, if you want maximum simplicity and edge performance, a **Cloudflare Worker** is ideal — you already use Cloudflare, and Workers KV is a perfect fit for content-addressed storage. The worker reads the hash, fetches the HTML from KV, injects CSP headers, and returns it. Sub-10ms globally.

**The widget content itself is plain HTML/JS/CSS.** No framework on the server side. The AI generates a single self-contained HTML file, and the host serves it. The HTML can import anything from the CDN whitelist (React from esm.sh, Chart.js from cdnjs, etc.).

### 6.2 API Surface

```
POST   /api/widgets          — Store widget code, returns hash
GET    /api/widgets/{hash}   — Serve widget HTML with CSP headers
DELETE /api/widgets/{hash}   — Optional: cleanup
GET    /api/widgets/{hash}/meta — Optional: metadata (created_at, size, etc.)
```

### 6.3 Storage Backend Options

| Option | Pros | Cons |
|---|---|---|
| **S3** | Already in stack, durable, cheap | Latency without CDN |
| **S3 + CloudFront** | Fast globally, cache-friendly | Slightly more setup |
| **Cloudflare KV** | Edge-native, sub-10ms, simple | Separate from main infra |
| **deprecated file backend** | Already in stack | Not ideal for serving HTML |
| **Redis / Valkey** | Ultra-fast, good for hot cache | Need persistence layer behind it |

**Recommendation:** S3 as the durable store + a CDN or edge cache in front. Content-addressed means infinite cache TTL — the hash never changes for the same content.

### 6.4 CSP Header Generation

The Widget Host reads query parameters and generates response headers:

```python
@app.get("/w/{hash}")
async def serve_widget(hash: str, request: Request):
    # Fetch widget HTML from storage
    html = await storage.get(hash)
    if not html:
        raise HTTPException(404)
    
    # Build CSP from query params + defaults
    connect_src = request.query_params.get("connect-src", "")
    allowed_connects = connect_src.replace("+", " ") if connect_src else ""
    
    csp = (
        f"default-src 'self'; "
        f"script-src 'self' 'unsafe-inline' 'unsafe-eval' {allowed_connects}; "
        f"connect-src 'self' {allowed_connects}; "
        f"style-src 'self' 'unsafe-inline' {allowed_connects}; "
        f"img-src 'self' data: blob: {allowed_connects}; "
        f"font-src 'self' {allowed_connects}; "
    )
    
    return HTMLResponse(
        content=html,
        headers={
            "Content-Security-Policy": csp,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "SAMEORIGIN",  # or specific parent origins
            "Cache-Control": "public, max-age=31536000, immutable",  # content-addressed = forever cache
        }
    )
```

### 6.5 Content Hashing

```python
import hashlib

def hash_widget(html_content: str) -> str:
    return hashlib.sha256(html_content.encode('utf-8')).hexdigest()
```

The hash becomes both the storage key and the URL identifier. Same content always produces the same hash — deduplication is automatic.

---

## 7. Frontend Widget Container — Implementation

### 7.1 React Component (Matrx Admin & Matrx Local)

```tsx
import { useRef, useState, useEffect, useCallback } from 'react';

interface WidgetFrameProps {
  hash: string;
  hostUrl?: string;  // defaults to production widget host
  allowedCdns?: string[];
  onAction?: (payload: any) => void;
  onPersist?: (key: string, data: any) => void;
  theme?: Record<string, string>;
}

export function WidgetFrame({
  hash,
  hostUrl = 'https://widgets.aimatrx.com',
  allowedCdns = ['esm.sh', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'],
  onAction,
  onPersist,
  theme,
}: WidgetFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200); // default min height
  const [loaded, setLoaded] = useState(false);

  // Build the widget URL with CSP params
  const connectSrc = allowedCdns.join('+');
  const src = `${hostUrl}/w/${hash}?connect-src=${connectSrc}&resource-src=${connectSrc}`;

  // Listen for postMessage from widget
  const handleMessage = useCallback((event: MessageEvent) => {
    // Verify origin matches our widget host
    if (!event.origin.includes('aimatrx.com')) return;

    const { type, ...payload } = event.data;

    switch (type) {
      case 'resize':
        setHeight(payload.height);
        break;
      case 'loaded':
        setLoaded(true);
        break;
      case 'action':
        onAction?.(payload);
        break;
      case 'persist-data':
        onPersist?.(payload.key, payload.data);
        break;
      case 'request-modal':
        // Handle modal opening in parent
        break;
    }
  }, [onAction, onPersist]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Push theme variables into widget
  useEffect(() => {
    if (loaded && theme && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'theme', vars: theme },
        '*'
      );
    }
  }, [loaded, theme]);

  return (
    <div className="widget-container" style={{ minHeight: 40 }}>
      {!loaded && <div className="widget-skeleton" />}
      <iframe
        ref={iframeRef}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-forms"
        allow="fullscreen *; clipboard-write *"
        style={{
          width: '100%',
          height: `${height}px`,
          border: 'none',
          backgroundColor: 'transparent',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.2s ease-out',
        }}
      />
    </div>
  );
}
```

### 7.2 React Native Component (Matrx Mobile)

```tsx
import { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import WebView from 'react-native-webview';

interface WidgetWebViewProps {
  hash: string;
  hostUrl?: string;
  onAction?: (payload: any) => void;
  onPersist?: (key: string, data: any) => void;
}

export function WidgetWebView({
  hash,
  hostUrl = 'https://widgets.aimatrx.com',
  onAction,
  onPersist,
}: WidgetWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [height, setHeight] = useState(200);
  const [loading, setLoading] = useState(true);

  const uri = `${hostUrl}/w/${hash}`;

  // Inject height reporter into widget
  const injectedJS = `
    (function() {
      const sendHeight = () => {
        const h = document.documentElement.scrollHeight;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'resize', height: h
        }));
      };
      new ResizeObserver(sendHeight).observe(document.body);
      sendHeight();
    })();
    true;
  `;

  const handleMessage = useCallback((event: any) => {
    const data = JSON.parse(event.nativeEvent.data);
    switch (data.type) {
      case 'resize':
        setHeight(data.height);
        break;
      case 'action':
        onAction?.(data);
        break;
      case 'persist-data':
        onPersist?.(data.key, data.data);
        break;
    }
  }, [onAction, onPersist]);

  return (
    <View style={[styles.container, { height }]}>  
      {loading && <ActivityIndicator style={styles.loader} />}
      <WebView
        ref={webViewRef}
        source={{ uri }}
        javaScriptEnabled
        originWhitelist={['*']}
        injectedJavaScript={injectedJS}
        onMessage={handleMessage}
        onLoadEnd={() => setLoading(false)}
        scrollEnabled={false}
        style={{ height, opacity: loading ? 0 : 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden' },
  loader: { position: 'absolute', top: '50%', alignSelf: 'center' },
});
```

---

## 8. The Bridge Protocol

A simple, versioned postMessage protocol between widgets and their parent containers.

### 8.1 Widget → Parent Messages

```typescript
// Widget reports its rendered height
{ type: 'resize', height: number }

// Widget finished loading
{ type: 'loaded' }

// Widget triggers a parent-side action
{ type: 'action', action: string, payload: any }

// Widget requests data persistence
{ type: 'persist-data', key: string, data: any }

// Widget requests to read persisted data
{ type: 'read-data', key: string, requestId: string }

// Widget requests modal display
{ type: 'request-modal', widgetHash?: string, html?: string, title?: string }

// Widget requests clipboard write (fallback if permissions API fails)
{ type: 'clipboard-write', text: string }
```

### 8.2 Parent → Widget Messages

```typescript
// Parent pushes theme/CSS variables
{ type: 'theme', vars: Record<string, string> }

// Parent responds to a data read request
{ type: 'data-response', requestId: string, data: any }

// Parent signals the widget to reset/clear state
{ type: 'reset' }

// Parent passes initial configuration
{ type: 'init', config: Record<string, any> }
```

### 8.3 Widget-Side Boilerplate

Every widget served by the host should include a small bridge script (injected by the host server):

```javascript
// Auto-injected by Widget Host into every widget
(function() {
  // Report height changes
  const reportHeight = () => {
    window.parent.postMessage({
      type: 'resize',
      height: document.documentElement.scrollHeight
    }, '*');
  };
  new ResizeObserver(reportHeight).observe(document.body);

  // Listen for parent messages
  window.addEventListener('message', (event) => {
    if (event.data.type === 'theme') {
      Object.entries(event.data.vars).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
    }
    if (event.data.type === 'data-response') {
      window.__pendingReads?.[event.data.requestId]?.(event.data.data);
    }
  });

  // Expose storage-like API
  window.widgetBridge = {
    sendAction: (action, payload) => {
      window.parent.postMessage({ type: 'action', action, payload }, '*');
    },
    persist: (key, data) => {
      window.parent.postMessage({ type: 'persist-data', key, data }, '*');
    },
    read: (key) => {
      return new Promise((resolve) => {
        const requestId = Math.random().toString(36).slice(2);
        window.__pendingReads = window.__pendingReads || {};
        window.__pendingReads[requestId] = resolve;
        window.parent.postMessage({ type: 'read-data', key, requestId }, '*');
      });
    },
    requestModal: (opts) => {
      window.parent.postMessage({ type: 'request-modal', ...opts }, '*');
    }
  };

  // Signal ready
  window.parent.postMessage({ type: 'loaded' }, '*');
})();
```

Widget authors (or AI Dream) can then use `window.widgetBridge.persist(...)` etc. without knowing anything about postMessage.

---

## 9. Block Constitution Integration

### 9.1 Render Strategy Per Block Type

The existing block constitution gets a `renderStrategy` field that determines how each block type renders per platform:

```typescript
type RenderStrategy = 'inline-react' | 'native-component' | 'iframe-widget' | 'webview-widget';

interface BlockTypeConfig {
  kind: string;
  renderStrategy: {
    web: RenderStrategy;
    mobile: RenderStrategy;
    desktop: RenderStrategy;  // Matrx Local
  };
  // ... existing constitution fields
}

const blockConfigs: Record<string, BlockTypeConfig> = {
  'text': {
    kind: 'text',
    renderStrategy: {
      web: 'inline-react',
      mobile: 'native-component',
      desktop: 'inline-react',
    },
  },
  'flashcard-deck': {
    kind: 'flashcard-deck',
    renderStrategy: {
      web: 'iframe-widget',       // flip animations in iframe
      mobile: 'webview-widget',   // WebView on mobile
      desktop: 'iframe-widget',
    },
  },
  'interactive-quiz': {
    kind: 'interactive-quiz',
    renderStrategy: {
      web: 'iframe-widget',
      mobile: 'webview-widget',
      desktop: 'iframe-widget',
    },
  },
  'timeline': {
    kind: 'timeline',
    renderStrategy: {
      web: 'inline-react',        // simple enough inline
      mobile: 'native-component', // native RN component
      desktop: 'inline-react',
    },
  },
  'chart': {
    kind: 'chart',
    renderStrategy: {
      web: 'iframe-widget',       // Chart.js in iframe
      mobile: 'webview-widget',
      desktop: 'iframe-widget',
    },
  },
  'code-playground': {
    kind: 'code-playground',
    renderStrategy: {
      web: 'iframe-widget',
      mobile: 'webview-widget',
      desktop: 'iframe-widget',
    },
  },
};
```

### 9.2 Decision Criteria

**Use `inline-react` / `native-component` when:**

- The block is primarily text/layout (timeline, card, list)
- No complex animations or interactivity
- No third-party library dependencies
- The block needs tight integration with parent scroll/gesture behavior

**Use `iframe-widget` / `webview-widget` when:**

- The block has animations (flip, slide, morph)
- The block needs interactivity (click handlers, state, forms)
- The block uses third-party libraries (Chart.js, D3, Three.js, GSAP)
- The block manages its own state (quiz scores, progress)
- The block's complexity would bloat the parent bundle
- The AI needs freedom to generate arbitrary HTML/JS

---

## 10. Implementation Roadmap

### Phase 1: Widget Host MVP (Week 1-2)

- [ ] FastAPI route group in AI Dream (or standalone Coolify service)
- [ ] `POST /api/widgets` — accept HTML, hash, store to S3
- [ ] `GET /w/{hash}` — serve HTML with CSP headers
- [ ] Content hashing with SHA-256
- [ ] Bridge script auto-injection
- [ ] Basic CSP query param parsing

### Phase 2: Frontend Container (Week 2-3)

- [ ] `<WidgetFrame>` React component for Matrx Admin
- [ ] postMessage listener with bridge protocol
- [ ] Height auto-resize
- [ ] Theme variable injection
- [ ] Skeleton/loading state
- [ ] Modal integration (Approach B — parent-managed modal with iframe inside)

### Phase 3: AI Dream Integration (Week 3-4)

- [ ] Block constitution `renderStrategy` field
- [ ] AI Dream streaming: detect widget-eligible blocks → store on Widget Host → return hash in block data
- [ ] Fallback: if Widget Host is down, render inline (graceful degradation)
- [ ] Widget template system (pre-built templates for common types: flashcards, quiz, chart)

### Phase 4: Mobile (Week 4-5)

- [ ] `<WidgetWebView>` React Native component for Matrx Mobile
- [ ] `onMessage` bridge implementation
- [ ] Height management with injected JS
- [ ] Theme injection via `injectJavaScript`
- [ ] Test on iOS and Android

### Phase 5: Data Persistence (Week 5-6)

- [ ] Parent-side persist/read handler (Supabase `widget_data` table)
- [ ] `widgetBridge.persist()` and `widgetBridge.read()` in bridge script
- [ ] Quiz score tracking end-to-end demo
- [ ] User-scoped data isolation

### Phase 6: Polish & Production (Week 6-8)

- [ ] Cloudflare CDN in front of Widget Host
- [ ] Error boundary in widgets (widget crash doesn't affect parent)
- [ ] Widget analytics (load time, interaction events)
- [ ] Matrx Local offline mode (local widget host on Python backend)
- [ ] Security audit: CSP strictness, origin validation, sanitization

---

## 11. Database Schema (widget_data)

For persisting widget state (quiz scores, progress, etc.):

```sql
CREATE TABLE widget_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  widget_hash TEXT NOT NULL,       -- the content-addressed widget hash
  data_key TEXT NOT NULL,          -- namespaced key (e.g., 'quiz:progress')
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, widget_hash, data_key)
);

-- Index for fast lookups
CREATE INDEX idx_widget_data_lookup 
  ON widget_data(user_id, widget_hash, data_key);

-- RLS: users can only access their own widget data
ALTER TABLE widget_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own widget data"
  ON widget_data FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## 12. Security Checklist

- [ ] **Iframe sandbox:** `allow-scripts allow-same-origin allow-forms` — no navigation, no popups
- [ ] **CSP headers:** Whitelist only known CDNs, block all other connect/resource sources
- [ ] **Origin validation:** Parent only accepts postMessages from known widget host origins
- [ ] **Content hashing:** SHA-256, content-addressed — no URL manipulation attacks
- [ ] **Auth token handling:** Never pass full auth tokens in URLs; use short-lived, widget-scoped tokens if widgets need API access
- [ ] **HTML sanitization:** While the iframe isolates execution, sanitize stored HTML to prevent stored XSS if widgets are ever rendered outside iframes
- [ ] **Rate limiting:** Widget creation endpoint should be rate-limited to prevent abuse
- [ ] **Max size:** Cap widget HTML at a reasonable size (e.g., 1MB) to prevent storage abuse

---

## 13. Key Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Widget Host technology | Python/FastAPI (or Cloudflare Worker) | Stack consistency; Worker for edge perf |
| Widget content format | Plain HTML/JS/CSS (single file) | Maximum flexibility; AI can generate anything |
| Storage backend | S3 + CDN | Durable, cheap, infinitely cacheable |
| Communication protocol | postMessage / onMessage | Native browser/WebView API, no dependencies |
| Data persistence | Parent-managed via bridge | Keeps auth/Supabase logic in parent app |
| Modal approach | Parent-managed modal with iframe inside | Reuses existing modal system, consistent UX |
| Simple blocks | Still render inline | No overhead for text/layout blocks |
| Complex blocks | iframe widget | Full isolation, any library, any animation |

---

## 14. What This Unlocks

Once this system is in place:

1. **AI Dream can generate arbitrary interactive UIs** — games, simulations, visualizations, tools — without any new code in Matrx Admin
2. **Widgets are embeddable anywhere** — blog posts, docs, external sites, email
3. **Third-party widget marketplace** — other developers could create widgets for the AI Matrx ecosystem
4. **A/B testing widget variants** — same block type, different widget implementations, tracked by hash
5. **Widget versioning** — content-addressed means old widgets never break; new content = new hash
6. **Cross-platform parity** — same widget renders on web, desktop, and mobile with platform-appropriate containers
