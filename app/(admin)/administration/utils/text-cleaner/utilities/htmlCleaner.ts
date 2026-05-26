export function cleanHTML(htmlText) {
    // Replace entire <svg> elements, leaving a placeholder
    htmlText = htmlText.replace(/<svg[\s\S]*?<\/svg>/gi, "<svg><!-- SVG content removed --></svg>");

    // Replace aria-* attributes and leave a trace
    htmlText = htmlText.replace(/\s(aria-[\w-]+)="[^"]*"/gi, " $1=\"[removed]\"");

    // Replace role attributes and leave a trace
    htmlText = htmlText.replace(/\srole="[^"]*"/gi, " role=\"[removed]\"");

    // Replace tabindex attributes and leave a trace
    htmlText = htmlText.replace(/\stabindex="[^"]*"/gi, " tabindex=\"[removed]\"");

    // Replace pointer-events attributes and leave a trace
    htmlText = htmlText.replace(/\spointer-events="[^"]*"/gi, " pointer-events=\"[removed]\"");

    // Replace touch-action attributes and leave a trace
    htmlText = htmlText.replace(/\stouch-action="[^"]*"/gi, " touch-action=\"[removed]\"");

    // Replace user-select attributes and leave a trace
    htmlText = htmlText.replace(/\suser-select="[^"]*"/gi, " user-select=\"[removed]\"");

    // Replace non-structural data attributes, leaving structural data attributes like `data-panel-*` intact
    htmlText = htmlText.replace(/\sdata-(?!panel|panel-group-id|panel-id)[\w-]+="[^"]*"/gi, " data-[removed]");

    // Remove styling-related classes while leaving a placeholder in the `class` attribute
    htmlText = htmlText.replace(/\sclass="([^"]*(hover:[^"]+|focus:[^"]+|text-[^"]+|bg-[^"]+)[^"]*)"/gi,
        ' class="[some classes removed]"');

    return htmlText;
}
