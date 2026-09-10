// Safe serialization for JSON-LD embedded via dangerouslySetInnerHTML.
//
// JSON.stringify does NOT escape `<`, `>`, `&`, or the JS line terminators
// U+2028/U+2029, so any user-controlled string in the graph (a listing title,
// a review body) can break out of the <script> element — e.g. a title
// containing `</script><script>…` — and execute. Escaping those characters as
// unicode sequences keeps the output valid JSON (JSON.parse still restores the
// original) while making script-breakout impossible.

// Character class of everything unsafe to leave raw inside a <script>: the
// HTML-significant chars plus U+2028/U+2029 (built via fromCharCode so no raw
// line-separator bytes live in this source file).
const UNSAFE = new RegExp("[<>&" + String.fromCharCode(0x2028, 0x2029) + "]", "g");

export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(
    UNSAFE,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
