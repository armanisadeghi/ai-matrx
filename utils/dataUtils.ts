const WORD_REPLACE_MAP = {
    api: "API",
    ui: "UI",
    url: "URL",
    qr: "QR",
    http: "HTTP",
    https: "HTTPS",
    id: "ID",
    json: "JSON",
    xml: "XML",
    sql: "SQL",
    css: "CSS",
    html: "HTML",
    sdk: "SDK",
    oauth: "OAuth",
    uuid: "UUID",
    db: "DB",
    aws: "AWS",
    gcp: "GCP",
    ip: "IP",
    aimatrix: "AIMatrix",
    openai: "OpenAI",
    deepseek: "DeepSeek",
};


const KEEP_LOWER_CASE = [
    "or",
    "and",
    "not",
    "if",
    "else",
    "in",
    "on",
    "to",
    "for",
    "is",
    "as",
    "try",
    "from",
    "with",
    "by",
    "at",
    "from",
    "as",
];

function isWordReplaceKey(word: string): word is keyof typeof WORD_REPLACE_MAP {
    return Object.prototype.hasOwnProperty.call(WORD_REPLACE_MAP, word);
}

const toTitleCase = (str: string | null | undefined) => {
    // Handle null, undefined, or empty string cases
    if (!str || typeof str !== 'string') {
        return '';
    }

    return str
        // Split camelCase and snake_case
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        // Split into words
        .split(/\s+/)
        // Process each word
        .map(word => {
            // Convert to lowercase for comparison
            const lowerWord = word.toLowerCase();

            // Check if word should be replaced
            if (isWordReplaceKey(lowerWord)) {
                return WORD_REPLACE_MAP[lowerWord];
            }
            
            // Check if word should stay lowercase
            if (KEEP_LOWER_CASE.includes(lowerWord)) {
                return lowerWord;
            }
            
            // Capitalize first letter
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        // Join words back together
        .join(" ");
};

export { toTitleCase };