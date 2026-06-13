/** A term→spoken-form substitution applied before any other speech parsing. */
export interface SpeechPronunciation {
  from: string;
  to: string;
}

export interface ParseMarkdownToTextOptions {
  /**
   * Custom Dictionary pronunciation substitutions. Applied FIRST — before the
   * built-in abbreviation/number expansion — so a user term like "AI" wins over
   * the generic "AI → Artificial Intelligence" expansion. Pairs should be sorted
   * longest-first by the caller so multi-word terms replace before substrings.
   */
  pronunciations?: SpeechPronunciation[];
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Apply dictionary pronunciation substitutions, whole-word & case-insensitive. */
function applyPronunciations(text: string, pairs: SpeechPronunciation[]): string {
  let out = text;
  for (const { from, to } of pairs) {
    const term = from.trim();
    if (!term || !to) continue;
    // \b only anchors on word chars; for terms with leading/trailing non-word
    // chars fall back to a lookaround on whitespace/boundaries.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, to);
  }
  return out;
}

export function parseMarkdownToText(
  markdown: string,
  options?: ParseMarkdownToTextOptions,
): string {
  if (!markdown || typeof markdown !== "string") return "";

  const numberToWords = (num: string): string => {
    const ones = [
      "zero",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
      "eleven",
      "twelve",
      "thirteen",
      "fourteen",
      "fifteen",
      "sixteen",
      "seventeen",
      "eighteen",
      "nineteen",
    ];
    const tens = [
      "",
      "",
      "twenty",
      "thirty",
      "forty",
      "fifty",
      "sixty",
      "seventy",
      "eighty",
      "ninety",
    ];
    const numInt = parseInt(num, 10);
    if (numInt < 20) return ones[numInt];
    if (numInt < 100) {
      const t = Math.floor(numInt / 10);
      const o = numInt % 10;
      return o === 0 ? tens[t] : `${tens[t]}-${ones[o]}`;
    }
    if (numInt < 1000) {
      const h = Math.floor(numInt / 100);
      const remainder = numInt % 100;
      return remainder === 0
        ? `${ones[h]} hundred`
        : `${ones[h]} hundred ${numberToWords(String(remainder))}`;
    }
    return String(numInt);
  };

  const emojiMap: { [key: string]: string } = {
    "😊": "smiling face",
    "😂": "laughing face",
    "❤️": "heart",
    "👍": "thumbs up",
    "👎": "thumbs down",
    "🔥": "fire",
    "⭐": "star",
    "✅": "check mark",
    "❌": "cross mark",
    "⚠️": "warning",
    "🚀": "rocket",
    "💡": "light bulb",
    "🎯": "target",
    "📱": "mobile phone",
    "💻": "laptop",
    "🌟": "glowing star",
    "🔗": "link",
    "📧": "email",
    "📄": "document",
    "📊": "chart",
    "🛠️": "tools",
    "⚙️": "gear",
    "🔧": "wrench",
    "📈": "chart increasing",
    "📉": "chart decreasing",
    "🎉": "party popper",
    "💪": "flexed biceps",
    "🤔": "thinking face",
    "💭": "thought bubble",
    "👀": "eyes",
    "👋": "waving hand",
    "✨": "sparkles",
    "🔍": "magnifying mx-glass",
    "📝": "memo",
    "📋": "clipboard",
    "📅": "calendar",
    "⏰": "alarm clock",
    "🔒": "locked",
    "🔓": "unlocked",
    "🏆": "trophy",
    "🎖️": "military medal",
    "🎗️": "reminder ribbon",
    "🏅": "sports medal",
    "🥇": "first place medal",
    "🥈": "second place medal",
    "🥉": "third place medal",
  };

  const commonAbbreviations: { [key: string]: string } = {
    AI: "Artificial Intelligence",
    API: "Application Programming Interface",
    HTTP: "Hypertext Transfer Protocol",
    HTTPS: "Hypertext Transfer Protocol Secure",
    URL: "Uniform Resource Locator",
    URI: "Uniform Resource Identifier",
    JSON: "JavaScript Object Notation",
    XML: "eXtensible Markup Language",
    CSS: "Cascading Style Sheets",
    HTML: "Hypertext Markup Language",
    JS: "JavaScript",
    TS: "TypeScript",
    SQL: "Structured Query Language",
    DB: "Database",
    UI: "User Interface",
    UX: "User Experience",
    SEO: "Search Engine Optimization",
    SDK: "Software Development Kit",
    CLI: "Command Line Interface",
    IDE: "Integrated Development Environment",
    JWT: "JSON Web Token",
    OAuth: "Open Authorization",
    REST: "Representational State Transfer",
    CRUD: "Create Read Update Delete",
    MVC: "Model View Controller",
    SPA: "Single Page Application",
    SSR: "Server Side Rendering",
    CSR: "Client Side Rendering",
    PWA: "Progressive Web App",
    DOM: "Document Object Model",
    BOM: "Browser Object Model",
    CDN: "Content Delivery Network",
    CMS: "Content Management System",
    ERP: "Enterprise Resource Planning",
    CRM: "Customer Relationship Management",
    SaaS: "Software as a Service",
    PaaS: "Platform as a Service",
    IaaS: "Infrastructure as a Service",
    VPN: "Virtual Private Network",
    LAN: "Local Area Network",
    WAN: "Wide Area Network",
    TCP: "Transmission Control Protocol",
    UDP: "User Datagram Protocol",
    IP: "Internet Protocol",
    DNS: "Domain Name System",
    FTP: "File Transfer Protocol",
    SMTP: "Simple Mail Transfer Protocol",
    POP3: "Post Office Protocol version 3",
    IMAP: "Internet Message Access Protocol",
  };

  const measurementUnits: { [key: string]: string } = {
    // Weight
    lbs: "pound", // Changed from 'pounds'
    lb: "pound",
    oz: "ounce", // Changed from 'ounces'
    kg: "kilogram", // Changed from 'kilograms'
    gm: "gram", // Changed from 'grams'
    mg: "milligram", // Changed from 'milligrams'
    // Distance/Length
    km: "kilometer", // Changed from 'kilometers'
    cm: "centimeter", // Changed from 'centimeters'
    mm: "millimeter", // Changed from 'millimeters'
    ft: "foot", // Changed from 'feet' (Irregular plural)
    mi: "mile", // Changed from 'miles'
    // Speed
    mph: "mile per hour", // Changed from 'miles per hour'
    kph: "kilometer per hour", // Changed from 'kilometers per hour'
    kmh: "kilometer per hour", // Changed from 'kilometers per hour'
    // Volume
    ml: "milliliter", // Changed from 'milliliters'
    mL: "milliliter", // Changed from 'milliliters'
    gal: "gallon", // Changed from 'gallons'
    qt: "quart", // Changed from 'quarts'
    tbsp: "tablespoon", // Changed from 'tablespoons'
    tsp: "teaspoon", // Changed from 'teaspoons'
    // Area
    sqft: "square foot", // Changed from 'square feet' (Irregular plural)
    sqm: "square meter", // Changed from 'square meters'
    // Time
    sec: "second", // Changed from 'seconds'
    min: "minute", // Changed from 'minutes'
    hr: "hour", // Changed from 'hours'
    hrs: "hour", // Changed from 'hours'
    ms: "millisecond", // Changed from 'milliseconds'
    // Other common units
    psi: "pound per square inch", // Changed from 'pounds per square inch'
    rpm: "revolution per minute", // Changed from 'revolutions per minute'
    bpm: "beat per minute", // Changed from 'beats per minute'
  };

  const stripReasoningTags = (input: string): string => {
    // Remove <thinking>...</thinking> and <reasoning>...</reasoning> blocks entirely,
    // including multi-line content. Also removes any stray unclosed opening tags.
    return input
      .replace(/<(thinking|reasoning|think|reason)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/?(?:thinking|reasoning|think|reason)\b[^>]*>/gi, "");
  };

  const stripLeadingMarkdown = (input: string): string => {
    let text = input.replace(/^\uFEFF/, "").replace(/^[ \t]*\r?\n/, "");
    // Strip a single leading markdown marker at the very start so the first
    // line reads naturally (e.g. "## Important notice" -> "Important notice").
    // Only strips ONE marker — later occurrences are handled normally below.
    text = text.replace(
      /^[ \t]*(?:#{1,6}[ \t]+|>[ \t]*|[-*+][ \t]+|\d+\.[ \t]+|-[ \t]*\[[ xX]\][ \t]+)/,
      "",
    );
    return text;
  };

  // Custom Dictionary substitutions run FIRST so the spoken form is locked in
  // before built-in abbreviation/number expansion can touch the same tokens.
  const source = options?.pronunciations?.length
    ? applyPronunciations(markdown, options.pronunciations)
    : markdown;

  let result = stripLeadingMarkdown(stripReasoningTags(source))
    // Handle Mermaid diagrams first (before other processing)
    .replace(/```mermaid[\s\S]*?```/g, "Please see the diagram provided.")
    // Replace code blocks (programming languages)
    .replace(
      /```(javascript|js|typescript|ts|python|py|java|csharp|cs|cpp|c\+\+|c|go|rust|php|ruby|swift|kotlin|scala|sql|bash|shell|powershell|yaml|yml|json|xml|html|css|markdown|md)[\s\S]*?```/g,
      "Please see the $1 code provided.",
    )
    .replace(/```[\s\S]*?```/g, "Please see the code provided.")
    // Replace tables BEFORE any other processing that would corrupt pipe/dash syntax
    .replace(
      /(\|[^\n]+\|[ \t]*\n)([ \t]*\|[ \t]*[-:]+[ \t]*(?:\|[ \t]*[-:]+[ \t]*)*\|?[ \t]*\n)((?:[ \t]*\|[^\n]*\|[ \t]*\n?)*)/gm,
      (_fullMatch, headerRow, _separatorRow, dataRows) => {
        const headers = headerRow
          .split("|")
          .map((h: string) => h.trim())
          .filter((h: string) => h.length > 0);

        const rowCount = dataRows
          .split("\n")
          .filter(
            (line: string) =>
              line.trim().startsWith("|") && line.trim().length > 1,
          ).length;

        const headerText =
          headers.length > 1
            ? headers.slice(0, -1).join(", ") +
              ", and " +
              headers[headers.length - 1]
            : headers.length === 1
              ? headers[0]
              : "unlabeled columns";
        const rowText =
          rowCount === 1
            ? "one row"
            : rowCount > 0
              ? `${rowCount} rows`
              : "no rows";

        return `There is a table with ${rowText} of data provided for ${headerText}.\n`;
      },
    )
    // Replace any remaining table-like structures (fallback)
    .replace(/^\|.*\|[ \t]*$/gm, "")
    // Replace inline code
    .replace(/`([^`]+)`/g, "$1")
    // Replace numeric ranges (e.g. 0-2, 10-20) with "X to Y" before any dash stripping
    .replace(
      /\b(\d+)\s*[-–—]\s*(\d+)\b/g,
      (_match, a, b) => `${numberToWords(a)} to ${numberToWords(b)}`,
    )
    // Replace headers
    .replace(/^#{1,6}\s+(.+)$/gm, "Section: $1")
    // Remove comment markers but keep content
    .replace(/\/\/\s*/g, "") // Remove // comment markers
    .replace(/--\s*/g, "") // Remove -- comment markers
    .replace(/#\s+/g, "") // Remove # comment markers (but not headers)
    .replace(/;\s*/g, "") // Remove semicolon comment markers
    // Replace bold
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    // Replace italic
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Replace strikethrough
    .replace(/~~(.*?)~~/g, "$1")
    // Replace highlighting
    .replace(/==(.*?)==/g, "$1")
    // Replace links with descriptive text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
      // Check if URL is an email
      if (url.startsWith("mailto:")) {
        return `${text}. Email address provided.`;
      }
      // Check for common file extensions
      const fileExtensions = [
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".txt",
        ".md",
        ".json",
        ".xml",
        ".csv",
        ".zip",
      ];
      const hasFileExtension = fileExtensions.some((ext) =>
        url.toLowerCase().includes(ext),
      );
      if (hasFileExtension) {
        return `${text}. Document link provided.`;
      }
      return `${text}. Link provided.`;
    })
    // Replace images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, ($0, alt) =>
      alt ? `${alt}. Image provided.` : "Image provided.",
    )
    // Replace blockquotes
    .replace(/^>\s*(.+)$/gm, "Quote: $1")
    // Replace task lists
    .replace(/^-\s*\[x\]\s+(.+)$/gm, "Completed task: $1")
    .replace(/^-\s*\[\s*\]\s+(.+)$/gm, "Pending task: $1")
    // Replace unordered lists
    .replace(/^([-*+])\s+(.+)$/gm, "$2")
    // Replace ordered lists
    .replace(
      /^(\d+)\.\s+(.+)$/gm,
      (_match, num, content) => `Number ${numberToWords(num)}: ${content}`,
    )
    // Replace footnotes and citations
    .replace(/\[\^(\d+)\]/g, "Reference $1")
    .replace(/^\[\d+\]:\s*(.+)$/gm, "Reference: $1")
    // Replace horizontal rules
    .replace(/^(\*{3,}|-{3,}|_{3,})$/gm, "")
    // Replace mathematical expressions
    .replace(/\$([^$]+)\$/g, "Mathematical expression: $1")
    .replace(/\$\$([^$]+)\$\$/g, "Mathematical formula: $1")
    // Replace phone numbers
    .replace(
      /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      "Phone number provided.",
    )
    // Replace email addresses
    .replace(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      "Email address: $1",
    )
    // Replace currency amounts
    .replace(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g, "$1 dollars")
    .replace(/€(\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)/g, "$1 euros")
    .replace(/£(\d+(?:,\d{3})*(?:\.\d{2})?)/g, "$1 pounds")
    .replace(/¥(\d+(?:,\d{3})*(?:\.\d{2})?)/g, "$1 yen")
    // Replace dates
    .replace(
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/g,
      (_match, year, month, day) => {
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
        const monthName = monthNames[parseInt(month) - 1] || month;
        return `${monthName} ${day}, ${year}`;
      },
    )
    // Replace times
    .replace(
      /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/g,
      (_match, hour, minute, period) => {
        const hourNum = parseInt(hour);
        const periodText = period
          ? period.toUpperCase() === "AM"
            ? "A.M."
            : "P.M."
          : "";
        return `${hourNum} ${minute} ${periodText}`.trim();
      },
    )
    // Replace common emojis
    .replace(
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
      (emoji) => {
        return emojiMap[emoji] || "emoji";
      },
    )
    // Replace common abbreviations (case-insensitive, whole word)
    .replace(
      /\b(AI|API|HTTP|HTTPS|URL|URI|JSON|XML|CSS|HTML|JS|TS|SQL|DB|UI|UX|SEO|SDK|CLI|IDE|JWT|OAuth|REST|CRUD|MVC|SPA|SSR|CSR|PWA|DOM|BOM|CDN|CMS|ERP|CRM|SaaS|PaaS|IaaS|VPN|LAN|WAN|TCP|UDP|IP|DNS|FTP|SMTP|POP3|IMAP)\b/gi,
      (match) => {
        return commonAbbreviations[match.toUpperCase()] || match;
      },
    )
    // Replace measurement units (with word boundaries and optional numbers before)
    .replace(
      /(\d+(?:\.\d+)?)\s*(lbs|lb|oz|kg|gm|mg|km|cm|mm|ft|mi|mph|kph|kmh|ml|mL|gal|qt|tbsp|tsp|sqft|sqm|sec|min|hr|hrs|ms|psi|rpm|bpm)\b/gi,
      (match, number, unit) => {
        const unitLower = unit.toLowerCase();
        const unitText =
          measurementUnits[unitLower] || measurementUnits[unit] || unit;
        return `${number} ${unitText}`;
      },
    )
    // Replace standalone measurement units (when preceded by space or number)
    .replace(
      /\b(lbs|lb|oz|kg|gm|mg|km|cm|mm|mph|kph|kmh|ml|mL|gal|qt|tbsp|tsp|sqft|sqm|psi|rpm|bpm)(?=\s|$|[.,;!?])/gi,
      (match) => {
        const unitLower = match.toLowerCase();
        return measurementUnits[unitLower] || measurementUnits[match] || match;
      },
    )
    // Replace special characters and symbols
    .replace(/©/g, "copyright")
    .replace(/®/g, "registered trademark")
    .replace(/™/g, "trademark")
    .replace(/°/g, "degrees")
    .replace(/±/g, "plus or minus")
    .replace(/≈/g, "approximately")
    .replace(/≠/g, "not equal to")
    .replace(/≤/g, "less than or equal to")
    .replace(/≥/g, "greater than or equal to")
    .replace(/→/g, "arrow")
    .replace(/←/g, "left arrow")
    .replace(/↑/g, "up arrow")
    .replace(/↓/g, "down arrow")
    // Remove HTML tags, keep content
    .replace(/<\/?[^>]+(>|$)/g, "")
    // Add period before newlines that follow text without terminal punctuation (ensures TTS pause)
    .replace(/([^\s.!?,;:\-])(\n)/g, "$1.\n")
    // Clean up multiple spaces
    .replace(/\s+/g, " ")
    // Trim whitespace
    .trim();

  return result;
}
