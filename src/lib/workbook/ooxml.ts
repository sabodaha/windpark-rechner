// A small writer for Office Open XML workbooks (zipped with fflate): formulas with cached results, styles,
// column widths, frozen panes, print setup with a header and footer, defined names and document properties.
// Enough for the formula workbook, without a spreadsheet library.
import { strToU8, zipSync } from "fflate";

export type CellValue = number | string | boolean | null;

/** Visual roles, following the usual financial-model colour code. */
export type Role =
  | "text"
  | "label"
  | "unit"
  | "title"
  | "subtitle"
  | "section"
  | "header"
  | "input"
  | "calc"
  | "link"
  | "solver"
  | "snapshot"
  | "check"
  | "total"
  | "note";

/** Number formats by name. */
export type Fmt = "general" | "int" | "dec2" | "dec3" | "dec4" | "dec6" | "pct1" | "pct2" | "pct3" | "date" | "ratio" | "year" | "text";

export interface Cell {
  /** Value, or the cached result of the formula. */
  v?: CellValue;
  /** Formula without the leading "=". */
  f?: string;
  role?: Role;
  fmt?: Fmt;
  /** Wrap text in the cell. */
  wrap?: boolean;
}

export interface SheetSpec {
  name: string;
  /** rows[r][c], 0-based; sparse arrays are fine. */
  rows: (Cell | undefined)[][];
  widths?: number[];
  /** Freeze the first `rows` rows and `cols` columns. */
  freeze?: { rows: number; cols: number };
  tabColor?: string;
  landscape?: boolean;
  zoom?: number;
}

export interface WorkbookSpec {
  sheets: SheetSpec[];
  names?: { name: string; ref: string }[];
  props: { title: string; subject: string; creator: string; keywords: string; description: string; created: string };
  /** Text in the page header and footer of every sheet. */
  headerText: string;
  footerText: string;
  /** Omit the cached results of formulas (the verification copy). */
  withoutCache?: boolean;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function colName(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Excel serial date (1900 system) from "YYYY-MM-DD". */
export function excelDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000 + 25_569;
}

// ---------------------------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------------------------

const NUMFMTS: Record<Fmt, { id: number; code?: string }> = {
  general: { id: 0 },
  int: { id: 3 },
  dec2: { id: 4 },
  text: { id: 49 },
  dec3: { id: 164, code: "#,##0.000" },
  dec4: { id: 165, code: "0.0000" },
  dec6: { id: 166, code: "0.000000" },
  pct1: { id: 167, code: "0.0%" },
  pct2: { id: 10 },
  pct3: { id: 168, code: "0.000%" },
  date: { id: 169, code: "yyyy-mm-dd" },
  ratio: { id: 170, code: '0.00"x"' },
  year: { id: 1 },
};

// Fonts: 0 regular, 1 bold, 2 input blue, 3 link green, 4 white bold, 5 muted italic, 6 title, 7 bold dark
const FONTS = [
  `<font><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>`,
  `<font><b/><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>`,
  `<font><sz val="10"/><color rgb="FF0000FF"/><name val="Calibri"/><family val="2"/></font>`,
  `<font><sz val="10"/><color rgb="FF008000"/><name val="Calibri"/><family val="2"/></font>`,
  `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>`,
  `<font><i/><sz val="9"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/></font>`,
  `<font><b/><sz val="14"/><color rgb="FF1F3864"/><name val="Calibri"/><family val="2"/></font>`,
  `<font><b/><sz val="11"/><color rgb="FF1F3864"/><name val="Calibri"/><family val="2"/></font>`,
];

const solid = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
// Fills: 0 none, 1 gray125 (required), 2 input yellow, 3 solver purple, 4 header grey, 5 section navy, 6 snapshot blue-grey
const FILLS = [
  `<fill><patternFill patternType="none"/></fill>`,
  `<fill><patternFill patternType="gray125"/></fill>`,
  solid("FFFFF2CC"),
  solid("FFE4DFEC"),
  solid("FFF2F2F2"),
  solid("FF1F3864"),
  solid("FFDDEBF7"),
];

// Borders: 0 none, 1 thin bottom, 2 thin top
const BORDERS = [
  `<border><left/><right/><top/><bottom/><diagonal/></border>`,
  `<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>`,
  `<border><left/><right/><top style="thin"><color rgb="FF808080"/></top><bottom/><diagonal/></border>`,
];

const ROLE: Record<Role, { font: number; fill: number; border: number }> = {
  text: { font: 0, fill: 0, border: 0 },
  label: { font: 0, fill: 0, border: 0 },
  unit: { font: 5, fill: 0, border: 0 },
  title: { font: 6, fill: 0, border: 0 },
  subtitle: { font: 7, fill: 0, border: 0 },
  section: { font: 4, fill: 5, border: 0 },
  header: { font: 1, fill: 4, border: 1 },
  input: { font: 2, fill: 2, border: 0 },
  calc: { font: 0, fill: 0, border: 0 },
  link: { font: 3, fill: 0, border: 0 },
  solver: { font: 1, fill: 3, border: 0 },
  snapshot: { font: 0, fill: 6, border: 0 },
  check: { font: 1, fill: 0, border: 0 },
  total: { font: 1, fill: 0, border: 2 },
  note: { font: 5, fill: 0, border: 0 },
};

class StyleTable {
  private readonly keys = new Map<string, number>();
  readonly xfs: string[] = [`<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`];

  index(c: Cell): number {
    const role = ROLE[c.role ?? "calc"];
    const fmt = NUMFMTS[c.fmt ?? "general"];
    const key = `${c.role ?? "calc"}|${c.fmt ?? "general"}|${c.wrap ? 1 : 0}`;
    const hit = this.keys.get(key);
    if (hit !== undefined) return hit;
    const align = c.wrap ? `<alignment wrapText="1" vertical="top"/>` : "";
    const xf =
      `<xf numFmtId="${fmt.id}" fontId="${role.font}" fillId="${role.fill}" borderId="${role.border}" xfId="0"` +
      ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${align ? ` applyAlignment="1">${align}</xf>` : "/>"}`;
    this.xfs.push(xf);
    const i = this.xfs.length - 1;
    this.keys.set(key, i);
    return i;
  }

  xml(): string {
    const custom = Object.values(NUMFMTS).filter((f) => f.code);
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<numFmts count="${custom.length}">${custom.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${esc(f.code!)}"/>`).join("")}</numFmts>` +
      `<fonts count="${FONTS.length}">${FONTS.join("")}</fonts>` +
      `<fills count="${FILLS.length}">${FILLS.join("")}</fills>` +
      `<borders count="${BORDERS.length}">${BORDERS.join("")}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------------------------

function cellXml(ref: string, c: Cell, styles: StyleTable, withoutCache: boolean): string {
  const s = styles.index(c);
  const sAttr = s ? ` s="${s}"` : "";
  const v = c.v;
  if (c.f !== undefined) {
    const f = `<f>${esc(c.f)}</f>`;
    if (withoutCache || v === null || v === undefined) return `<c r="${ref}"${sAttr}>${f}</c>`;
    if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${sAttr}>${f}<v>${v}</v></c>` : `<c r="${ref}"${sAttr}>${f}</c>`;
    if (typeof v === "boolean") return `<c r="${ref}"${sAttr} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
    return `<c r="${ref}"${sAttr} t="str">${f}<v>${esc(v)}</v></c>`;
  }
  if (v === null || v === undefined || v === "") return sAttr ? `<c r="${ref}"${sAttr}/>` : "";
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${sAttr}><v>${v}</v></c>` : "";
  if (typeof v === "boolean") return `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(sheet: SheetSpec, styles: StyleTable, book: WorkbookSpec): string {
  const tab = sheet.tabColor ? `<tabColor rgb="${sheet.tabColor}"/>` : "";
  const sheetPr = `<sheetPr>${tab}<pageSetUpPr fitToPage="1"/></sheetPr>`;
  const fr = sheet.freeze;
  const pane =
    fr && (fr.rows > 0 || fr.cols > 0)
      ? `<pane${fr.cols ? ` xSplit="${fr.cols}"` : ""}${fr.rows ? ` ySplit="${fr.rows}"` : ""} topLeftCell="${colName(fr.cols)}${fr.rows + 1}"` +
        ` activePane="${fr.rows && fr.cols ? "bottomRight" : fr.rows ? "bottomLeft" : "topRight"}" state="frozen"/>`
      : "";
  const views = `<sheetViews><sheetView workbookViewId="0"${sheet.zoom ? ` zoomScale="${sheet.zoom}"` : ""}>${pane}</sheetView></sheetViews>`;
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  let rows = "";
  sheet.rows.forEach((row, r) => {
    if (!row) return;
    let cells = "";
    row.forEach((c, ci) => {
      if (c) cells += cellXml(`${colName(ci)}${r + 1}`, c, styles, book.withoutCache ?? false);
    });
    if (cells) rows += `<row r="${r + 1}">${cells}</row>`;
  });
  const hf =
    `<headerFooter><oddHeader>${esc(`&L&8${book.headerText}`)}</oddHeader>` +
    `<oddFooter>${esc(`&L&8${book.footerText}&R&8&A · &P / &N`)}</oddFooter></headerFooter>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `${sheetPr}${views}<sheetFormatPr defaultRowHeight="13.2"/>${cols}<sheetData>${rows}</sheetData>` +
    `<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${sheet.landscape === false ? "portrait" : "landscape"}" fitToWidth="1" fitToHeight="0"/>` +
    `${hf}</worksheet>`
  );
}

export function buildWorkbookXlsx(book: WorkbookSpec): Uint8Array {
  const styles = new StyleTable();
  const sheetFiles = book.sheets.map((s) => sheetXml(s, styles, book));
  const names = book.sheets.map((s) => esc(s.name.slice(0, 31)));
  const p = book.props;
  const definedNames = book.names?.length
    ? `<definedNames>${book.names.map((n) => `<definedName name="${esc(n.name)}">${esc(n.ref)}</definedName>`).join("")}</definedNames>`
    : "";
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
        book.sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
        `</Relationships>`,
    ),
    "docProps/core.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        `<dc:title>${esc(p.title)}</dc:title><dc:subject>${esc(p.subject)}</dc:subject><dc:creator>${esc(p.creator)}</dc:creator>` +
        `<cp:keywords>${esc(p.keywords)}</cp:keywords><dc:description>${esc(p.description)}</dc:description>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${esc(p.created)}T00:00:00Z</dcterms:created>` +
        `</cp:coreProperties>`,
    ),
    "docProps/app.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>${esc(p.title)}</Application></Properties>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<workbookPr date1904="0"/><bookViews><workbookView activeTab="0"/></bookViews>` +
        `<sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        `${definedNames}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        book.sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${book.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
  };
  sheetFiles.forEach((xml, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml)));
  files["xl/styles.xml"] = strToU8(styles.xml());
  return zipSync(files, { level: 6, mtime: new Date(Date.UTC(2026, 0, 1)) });
}
