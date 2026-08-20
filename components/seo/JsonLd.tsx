/**
 * The ONE JSON-LD emitter.
 *
 * Every surface that ships schema.org structured data renders this component
 * rather than hand-writing a `<script type="application/ld+json">` tag. That
 * matters for one non-obvious reason: the payload MUST have its `<` escaped to
 * `<` or an author-controlled string (a page title, a tool description, a
 * doc slug) can close the script element and inject markup. Every hand-rolled
 * copy in this repo remembered that; the seventh one would not have.
 *
 * Pass a single object or an array of objects (multiple top-level entities on
 * one page is valid and preferred over several script tags).
 */

export interface JsonLdProps {
  /** A schema.org entity, or several. `null`/`undefined` renders nothing. */
  data: Record<string, unknown> | Record<string, unknown>[] | null | undefined;
}

export function JsonLd({ data }: JsonLdProps) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return (
    <script
      type="application/ld+json"
      // Escaping `<` is what makes this safe against a `</script>` in any
      // author-controlled value. Do not inline JSON.stringify without it.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
