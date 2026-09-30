// Minimal XLSX writer (Office Open XML, zipped with fflate). Values only: inline strings, numbers,
// booleans and a handful of number formats — enough for the model export, a few KB of code instead of
// a full spreadsheet library. Numbers are stored rounded to 0.001 of the unit shown (see roundStored).
import { strToU8, zipSync } from "fflate";

export type Style = "text" | "bold" | "int" | "dec2" | "pct" | "date" | "title" | "dec3";
export type CellValue = string | number | boolean | null | undefined;
export interface Cell {
  v: CellValue;
  s?: Style;
}
export type Row = (Cell | CellValue)[];
export interface Sheet {
  name: string;
  rows: Row[];
  widths?: number[];
}

// cellXfs order in styles.xml
const STYLE_INDEX: Record<Style, number> = { text: 0, bold: 1, int: 2, dec2: 3, pct: 4, date: 5, title: 6, dec3: 7 };

/**
 * The value written to the file: rounded to three decimals of the unit the cell shows — so a fraction
 * shown as a percentage keeps five (3.012 %). Rounds half away from zero, like Excel's ROUND.
 */
export function roundStored(v: number, s?: Style): number {
  const f = s === "pct" ? 1e5 : 1e3;
  const r = (Math.sign(v) * Math.round(Math.abs(v) * f)) / f;
  return r === 0 ? 0 : r; // no negative zero
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

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

function cellXml(ref: string, c: Cell): string {
  const s = STYLE_INDEX[c.s ?? "text"];
  const sAttr = s ? ` s="${s}"` : "";
  const v = c.v;
  if (v === null || v === undefined || v === "") return sAttr ? `<c r="${ref}"${sAttr}/>` : "";
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${sAttr}><v>${roundStored(v, c.s)}</v></c>` : "";
  if (typeof v === "boolean") return `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((raw, c) => cellXml(`${colName(c)}${r + 1}`, raw !== null && typeof raw === "object" ? raw : { v: raw }))
        .join("");
      return cells ? `<row r="${r + 1}">${cells}</row>` : "";
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="5"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00"/>` +
  `<numFmt numFmtId="166" formatCode="0.00%"/><numFmt numFmtId="167" formatCode="yyyy-mm-dd"/>` +
  `<numFmt numFmtId="168" formatCode="#,##0.000"/></numFmts>` +
  `<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="14"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="8">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheets.map((s) => esc(s.name.slice(0, 31)));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets
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
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))));
  return zipSync(files, { level: 6 });
}
