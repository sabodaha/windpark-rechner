// German typography: a no-break space keeps a number with its unit ("68 %", "6,3 MW", "1.000 €", "25 Jahre") and
// a section sign or legal abbreviation with its number ("§ 36h", "Art. 6"), so a line never breaks between them.
const NBSP = " ";
const UNIT = /(\d) (?=%|€|ct\b|kWh\b|MWh\b|GWh\b|kW\b|MW\b|h\b|m\b|Mio\.|Tsd\.|Pp\.|Jahr\b|Jahre\b|Jahren\b|Monate\b|Monaten\b|Tage\b|Tagen\b)/g;
const NUMBERED = /(§§?|Art\.|Abs\.|Nr\.) (?=\d)/g;

export function nbsp(s: string): string {
  return s.replace(UNIT, `$1${NBSP}`).replace(NUMBERED, `$1${NBSP}`);
}

/** nbsp() on every string of a dictionary, including the strings its functions return. */
export function typeset<T>(value: T): T {
  if (typeof value === "string") return nbsp(value) as T;
  if (typeof value === "function") {
    const fn = value as (...args: unknown[]) => unknown;
    return ((...args: unknown[]) => typeset(fn(...args))) as T;
  }
  if (Array.isArray(value)) return value.map((v) => typeset(v)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeset(v)])) as T;
  }
  return value;
}
