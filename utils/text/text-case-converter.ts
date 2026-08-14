/**
 * Text formatting options
 */
export type TextCaseOption = 'title' | 'sentence' | 'normal' | 'lower' | 'upper';

export interface TextFormatterOptions {
  /**
   * Text case to apply after normalization
   * - title: First Letter Of Each Word Capitalized
   * - sentence: First letter of first word capitalized
   * - normal: No case transformation after normalization
   * - lower: all text lowercase
   * - upper: ALL TEXT UPPERCASE
   */
  textCase?: TextCaseOption;
  
  /**
   * Map of words to replace with specific formatting
   * Example: { 'api': 'API', 'ui': 'UI' }
   */
  wordReplacements?: Record<string, string>;
  
  /**
   * Whether to trim the result
   */
  trim?: boolean;
}

/**
 * Default word replacements for common acronyms and terms
 */
export type ReplacementMap = Readonly<Record<string, string>>;

export const DEFAULT_WORD_REPLACEMENTS: ReplacementMap = {
  // Acronyms & initialisms
  'api': 'API',
  'apis': 'APIs',
  'ui': 'UI',
  'ux': 'UX',
  'id': 'ID',
  'ids': 'IDs',
  'qr': 'QR',
  'ssr': 'SSR',
  'csr': 'CSR',
  'ssg': 'SSG',
  'isr': 'ISR',
  'spa': 'SPA',
  'pwa': 'PWA',
  'sdk': 'SDK',
  'sdks': 'SDKs',
  'cli': 'CLI',
  'tty': 'TTY',
  'repl': 'REPL',
  'ci': 'CI',
  'cd': 'CD',
  'cpu': 'CPU',
  'cpus': 'CPUs',
  'gpu': 'GPU',
  'gpus': 'GPUs',
  'ram': 'RAM',
  'rom': 'ROM',
  'ssd': 'SSD',
  'ssds': 'SSDs',
  'hdd': 'HDD',
  'hdds': 'HDDs',
  'kpi': 'KPI',
  'kpis': 'KPIs',
  'sla': 'SLA',
  'slas': 'SLAs',
  'slo': 'SLO',
  'slos': 'SLOs',
  'sli': 'SLI',
  'slis': 'SLIs',
  'dom': 'DOM',

  // Web, formats, protocols
  'url': 'URL',
  'urls': 'URLs',
  'uri': 'URI',
  'uris': 'URIs',
  'http': 'HTTP',
  'https': 'HTTPS',
  'html': 'HTML',
  'css': 'CSS',
  'json': 'JSON',
  'yaml': 'YAML',
  'yml': 'YML',
  'toml': 'TOML',
  'csv': 'CSV',
  'pdf': 'PDF',
  'tsv': 'TSV',
  'jpg': 'JPG',
  'jpeg': 'JPEG',
  'png': 'PNG',
  'gif': 'GIF',
  'webp': 'WebP',
  'heic': 'HEIC',
  'heif': 'HEIF',
  'bmp': 'BMP',
  'tiff': 'TIFF',
  'ico': 'ICO',
  'xml': 'XML',
  'sql': 'SQL',
  'db': 'DB',
  'dbs': 'DBs',
  'nosql': 'NoSQL',
  'graphql': 'GraphQL',
  'grpc': 'gRPC',
  'rest': 'REST',
  'restful': 'RESTful',
  'websocket': 'WebSocket',
  'websockets': 'WebSockets',
  'webrtc': 'WebRTC',

  // Networking
  'ip': 'IP',
  'ipv4': 'IPv4',
  'ipv6': 'IPv6',
  'dns': 'DNS',
  'dhcp': 'DHCP',
  'nat': 'NAT',
  'tcp': 'TCP',
  'udp': 'UDP',
  'icmp': 'ICMP',
  'ttl': 'TTL',
  'lan': 'LAN',
  'wan': 'WAN',
  'vlan': 'VLAN',
  'cdn': 'CDN',
  'ftp': 'FTP',
  'ssh': 'SSH',
  'tls': 'TLS',
  'ssl': 'SSL',

  // Security & crypto
  'jwt': 'JWT',
  'jws': 'JWS',
  'jwe': 'JWE',
  'hmac': 'HMAC',
  'rsa': 'RSA',
  'ecdsa': 'ECDSA',
  'aes': 'AES',
  'pbkdf2': 'PBKDF2',
  'argon2': 'Argon2',
  'scrypt': 'scrypt',
  'totp': 'TOTP',
  'hotp': 'HOTP',
  'mfa': 'MFA',
  '2fa': '2FA',
  'csrf': 'CSRF',
  'xss': 'XSS',
  'ssrf': 'SSRF',
  'rce': 'RCE',
  'dos': 'DoS',
  'ddos': 'DDoS',
  'mitm': 'MITM',
  'csp': 'CSP',
  'cors': 'CORS',
  'pii': 'PII',
  'phi': 'PHI',
  'gdpr': 'GDPR',
  'ccpa': 'CCPA',
  'hipaa': 'HIPAA',
  'rfc': 'RFC',

  // Platforms, langs, tools (single-token)
  'javascript': 'JavaScript',
  'typescript': 'TypeScript',
  'jsx': 'JSX',
  'tsx': 'TSX',
  'node': 'Node',           // (used when tokenized alone)
  'deno': 'Deno',
  'bun': 'Bun',
  'react': 'React',
  'nextjs': 'Next.js',      // if your tokenizer drops dots, keep this
  'nodejs': 'Node.js',
  'postgresql': 'PostgreSQL',
  'postgres': 'Postgres',
  'mysql': 'MySQL',
  'sqlite': 'SQLite',
  'redis': 'Redis',
  'supabase': 'Supabase',
  'docker': 'Docker',
  'kubernetes': 'Kubernetes',
  'k8s': 'Kubernetes',
  'helm': 'Helm',
  'npm': 'npm',
  'pnpm': 'pnpm',
  'yarn': 'Yarn',
  'eslint': 'ESLint',
  'prettier': 'Prettier',
  'vite': 'Vite',
  'webpack': 'Webpack',
  'babel': 'Babel',

  // OS & vendors
  'macos': 'macOS',
  'ios': 'iOS',
  'ipados': 'iPadOS',
  'watchos': 'watchOS',
  'tvos': 'tvOS',
  'windows': 'Windows',
  'linux': 'Linux',
  'ubuntu': 'Ubuntu',
  'github': 'GitHub',
  'gitlab': 'GitLab',
  'bitbucket': 'Bitbucket',

  // Data & analytics
  'etl': 'ETL',
  'elt': 'ELT',
  'olap': 'OLAP',
  'oltp': 'OLTP',
  'bi': 'BI',

  // Time & locales
  'utc': 'UTC',
  'gmt': 'GMT',
  'pst': 'PST',
  'pdt': 'PDT',
  'pt': 'PT',

  // Common “small words” to keep lowercase (unless first/last word)
  'or': 'or',
  'and': 'and',
  'the': 'the',
  'of': 'of',
  'in': 'in',
  'to': 'to',
  'with': 'with',
  'as': 'as',
  'by': 'by',
  'for': 'for',
  'on': 'on',
  'at': 'at',
  'up': 'up',
  'a': 'a',
  'an': 'an',
  'is': 'is',
  'are': 'are',
  'was': 'was',
  'were': 'were',
  'be': 'be',
  'but': 'but',
  'nor': 'nor',
  'so': 'so',
  'yet': 'yet',
  'per': 'per',
  'via': 'via',

  // Latin abbreviations (tokenized as words in some pipelines)
  'eg': 'e.g.',
  'ie': 'i.e.',
  'etc': 'etc.',
  'aka': 'aka',
  'vs': 'vs.',
  'v': 'v.',

  // Client abbreviations
  'CIC': 'CIC',
  'AGR': 'AGR',
  'AGER': 'AGER',
  'DD': 'DD',
  'TS': 'TS',
  'TM': 'TM',
  'arman': "Arman",
};

/**
 * Default options for text formatting
 */
const DEFAULT_OPTIONS: TextFormatterOptions = {
  textCase: 'title',
  wordReplacements: DEFAULT_WORD_REPLACEMENTS,
  trim: true,
};

/**
 * Formats text by normalizing case styles, applying case transformations,
 * and replacing specific words with custom formatting.
 * 
 * @param text The input text to format
 * @param options Formatting options
 * @returns Formatted text
 */
export function formatText(text: string, options: TextFormatterOptions = {}): string {
  // Merge provided options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Handle empty text
  if (!text) return '';
  
  // Step 1: Normalize various case styles to space-separated words
  let normalized = text
    // Convert snake_case to space-separated
    .replace(/_/g, ' ')
    // Convert kebab-case to space-separated
    .replace(/-/g, ' ')
    // Convert camelCase and PascalCase to space-separated
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Replace multiple spaces with a single space
    .replace(/\s+/g, ' ');
  
  // Step 2: Apply trim if needed
  if (opts.trim) {
    normalized = normalized.trim();
  }
  
  // Step 3: Apply the specified text case
  let caseTransformed = normalized;
  switch (opts.textCase) {
    case 'title':
      caseTransformed = normalized.replace(/\w\S*/g, (word) => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      );
      break;
    case 'sentence':
      if (normalized.length > 0) {
        caseTransformed = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
      }
      break;
    case 'lower':
      caseTransformed = normalized.toLowerCase();
      break;
    case 'upper':
      caseTransformed = normalized.toUpperCase();
      break;
    case 'normal':
    default:
      // No case transformation
      break;
  }
  
  // Step 4: Apply word replacements if provided
  let result = caseTransformed;
  if (opts.wordReplacements) {
    Object.entries(opts.wordReplacements).forEach(([key, value]) => {
      // Create a regex that matches the key as a whole word (case insensitive)
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      result = result.replace(regex, value);
    });
  }
  
  return result;
}

/**
 * Creates a pre-configured formatter function with specific options
 * 
 * @param defaultOptions Default options for the formatter
 * @returns A formatter function with the specified default options
 */
export function createFormatter(defaultOptions: TextFormatterOptions = {}) {
  return (text: string, overrideOptions: TextFormatterOptions = {}) => 
    formatText(text, { ...defaultOptions, ...overrideOptions });
}

// Some pre-configured formatters for common use cases
export const formatTitleCase = createFormatter({ textCase: 'title' });
export const formatSentenceCase = createFormatter({ textCase: 'sentence' });
export const formatNormalCase = createFormatter({ textCase: 'normal' });
export const formatUpperCase = createFormatter({ textCase: 'upper' });
export const formatLowerCase = createFormatter({ textCase: 'lower' });
export const formatWithoutReplacements = createFormatter({ wordReplacements: {} });
