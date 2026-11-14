// The name rule shared by project, milestone and needs_me (contract/api.md 4.1). Both sets are
// explicit lists of code points, never a regex \s or \S class, because engines disagree on \s:
// Python's leaves out U+FEFF, ECMA-262's includes it, and Go's is ASCII-only.
//
// Every member of both sets is a BMP code point outside the surrogate range, so checking UTF-16
// units gives the same verdict as checking code points: a surrogate unit is never in either set,
// whether it is half of a pair or alone, and JSON Schema accepts lone surrogates.

/** Every Unicode White_Space code point plus U+FEFF: refused at a name's first and last character. */
function isEdgeWhitespace(unit: number): boolean {
  return (
    (unit >= 0x09 && unit <= 0x0d) ||
    unit === 0x20 ||
    unit === 0x85 ||
    unit === 0xa0 ||
    unit === 0x16_80 ||
    (unit >= 0x20_00 && unit <= 0x20_0a) ||
    unit === 0x20_28 ||
    unit === 0x20_29 ||
    unit === 0x20_2f ||
    unit === 0x20_5f ||
    unit === 0x30_00 ||
    unit === 0xfe_ff
  );
}

/** Controls and line breaks: refused anywhere in a name. */
function isControl(unit: number): boolean {
  return unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f) || unit === 0x20_28 || unit === 0x20_29;
}

/** Length in Unicode code points, as JSON Schema's minLength and maxLength count it. */
function codePointLength(text: string): number {
  let length = 0;
  for (const _ of text) {
    length += 1;
  }
  return length;
}

/** True when the first or last character is in the whitespace set. */
function hasEdgeWhitespace(text: string): boolean {
  return isEdgeWhitespace(text.charCodeAt(0)) || isEdgeWhitespace(text.charCodeAt(text.length - 1));
}

/** The first control character or line break in the text, as "U+XXXX", or null. */
function firstControl(text: string): string | null {
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (isControl(unit)) {
      return `U+${unit.toString(16).toUpperCase().padStart(4, "0")}`;
    }
  }
  return null;
}

export { codePointLength, firstControl, hasEdgeWhitespace };
