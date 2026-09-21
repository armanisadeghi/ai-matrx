// utils/headers.js

exports.getHeaders = () => [
    // THE ACTION-REQUEST LINK'S TOKEN MUST NOT LEAK.
    //
    // `/q/<token>` is a one-tap link texted to a person; the token in that path
    // is the capability. Without `no-referrer`, every outbound request the page
    // makes — and every link a person follows off it — hands the whole URL,
    // token included, to somebody else's server and access log. `noindex` is
    // belt-and-braces beside the page's own `robots` metadata: a header also
    // covers a crawler that never parses the HTML.
    {
        source: "/q/:token",
        headers: [
            {
                key: "Referrer-Policy",
                value: "no-referrer",
            },
            {
                key: "X-Robots-Tag",
                value: "noindex",
            },
        ],
    },
    {
        source: "/:path*.wasm",
        headers: [
            {
                key: "Content-Type",
                value: "application/wasm",
            },
        ],
    },
    {
        source: "/:path*.mjs",
        headers: [
            {
                key: "Content-Type",
                value: "text/javascript",
            },
        ],
    },
    {
        source: "/:path*.onnx",
        headers: [
            {
                key: "Content-Type",
                value: "application/octet-stream",
            },
        ],
    },
    {
        source: "/:all*(svg|jpg|png)",
        headers: [
            {
                key: "Cache-Control",
                value: "public, max-age=31536000, immutable",
            },
        ],
    },
];


// exports.getHeaders = () => [
//     {
//         source: "/(.*)",
//         headers: [
//             {
//                 key: "Cross-Origin-Opener-Policy",
//                 value: "same-origin",
//             },
//             {
//                 key: "Cross-Origin-Embedder-Policy",
//                 value: "credentialless",
//             },
//             {
//                 key: "Cross-Origin-Resource-Policy",
//                 value: "cross-origin", // Allows Google Fonts and CDN
//             },
//         ],
//     },
//     {
//         source: "/:path*.wasm",
//         headers: [
//             {
//                 key: "Content-Type",
//                 value: "application/wasm",
//             },
//         ],
//     },
//     {
//         source: "/:path*.mjs",
//         headers: [
//             {
//                 key: "Content-Type",
//                 value: "text/javascript",
//             },
//         ],
//     },
//     {
//         source: "/:path*.onnx",
//         headers: [
//             {
//                 key: "Content-Type",
//                 value: "application/octet-stream",
//             },
//         ],
//     },
//     {
//         source: "/:all*(svg|jpg|png)",
//         headers: [
//             {
//                 key: "Cache-Control",
//                 value: "public, max-age=31536000, immutable",
//             },
//         ],
//     },
// ];
