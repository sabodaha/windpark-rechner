// Layout of the formula workbook: sheets made of labelled rows. A period row holds one formula, copied across
// the period columns; a scalar row holds one cell. Rows are declared first and rendered afterwards, so formulas
// can refer to any row of any sheet by its id. Every formula cell carries its expected value — the cached result
// shown before a recalculation, and the reference the verification compares the spreadsheet's own result with.
import { colName, type Cell, type CellValue, type Fmt, type Role, type SheetSpec } from "./ooxml";

/** Column of the first period on period sheets (F); the column before it (E) holds opening values. */
export const FIRST = 5;
export const LABEL_COLS = { label: 0, unit: 1, value: 2, note: 3, opening: 4 } as const;

export interface Ctx {
  /** Column letter of the current period, and of the one before it. */
  col: string;
  prev: string;
  i: number;
  /** Row `id` in the current column (with the sheet name if it is on another sheet). */
  r(id: string): string;
  /** Row `id` in the previous column. */
  p(id: string): string;
  /** A single cell: a scalar row, fixed with $. */
  k(id: string): string;
  /** A period row across its columns (from the given period on), fixed with $. */
  range(id: string, from?: number): string;
  /** A column of a vertical table, fixed with $. */
  table(id: string, column: number): string;
}

type Formula = (c: Ctx) => string;

interface Base {
  id: string;
  label: string;
  unit?: string;
  fmt?: Fmt;
  role?: Role;
  note?: string;
}

export interface PeriodRow extends Base {
  kind: "period";
  /** Omit for plain values (inputs or pasted results). */
  f?: Formula;
  values: CellValue[];
  /** Opening column (E): a formula or a value. */
  open?: { f?: Formula; v: CellValue };
  /** Number of period columns of this row's sheet group. */
  n: number;
}

export interface ScalarRow extends Base {
  kind: "scalar";
  f?: Formula;
  v: CellValue;
  /** The only values the cell accepts (a list validation in the workbook). */
  list?: string[];
}

export interface TableRow {
  kind: "table";
  id: string;
  /** Header labels of the columns. */
  head: string[];
  widths?: number[];
  /** Each row: a value or a formula per column. */
  rows: { f?: Formula; v: CellValue; fmt?: Fmt; role?: Role }[][];
}

export interface TextRow {
  kind: "text";
  text: string;
  role?: Role;
  /** Extra cells after the text (e.g. a header row of years). */
  cells?: Cell[];
  startCol?: number;
}

export type Row = PeriodRow | ScalarRow | TableRow | TextRow | { kind: "blank" };

export interface SheetDef {
  name: string;
  rows: Row[];
  widths: number[];
  freeze?: { rows: number; cols: number };
  tabColor?: string;
  /** Periods of this sheet (for the header), e.g. years or month numbers. */
  periods?: CellValue[];
  periodFmt?: Fmt;
}

interface Located {
  sheet: string;
  row: number; // 0-based
  kind: "period" | "scalar" | "table";
  n: number;
  /** For tables: first data row and number of rows. */
  tableRows?: number;
}

export interface ManifestEntry {
  sheet: string;
  cell: string;
  id: string;
  expected: CellValue;
  fmt?: Fmt;
}

const quote = (sheet: string) => (/^[A-Za-z][A-Za-z0-9_]*$/.test(sheet) ? sheet : `'${sheet.replace(/'/g, "''")}'`);

export class Grid {
  private readonly sheets: SheetDef[] = [];
  private readonly where = new Map<string, Located>();

  add(sheet: SheetDef): void {
    this.sheets.push(sheet);
    // Row 0 is the title, row 1 a subtitle, row 2 empty, row 3 the period header; content starts at row 4.
    let r = 4;
    for (const row of sheet.rows) {
      if (row.kind === "period" || row.kind === "scalar") {
        if (this.where.has(row.id)) throw new Error(`Duplicate row id ${row.id}`);
        this.where.set(row.id, { sheet: sheet.name, row: r, kind: row.kind, n: row.kind === "period" ? row.n : 1 });
        r += 1;
      } else if (row.kind === "table") {
        if (this.where.has(row.id)) throw new Error(`Duplicate table id ${row.id}`);
        this.where.set(row.id, { sheet: sheet.name, row: r + 1, kind: "table", n: row.head.length, tableRows: row.rows.length });
        r += 1 + row.rows.length;
      } else r += 1;
    }
  }

  private loc(id: string): Located {
    const l = this.where.get(id);
    if (!l) throw new Error(`Unknown row id ${id}`);
    return l;
  }

  private prefix(from: string, to: string): string {
    return from === to ? "" : `${quote(to)}!`;
  }

  private ctx(sheet: string, i: number): Ctx {
    const col = colName(FIRST + i);
    const prev = colName(FIRST + i - 1);
    return {
      col,
      prev,
      i,
      r: (id) => {
        const l = this.loc(id);
        if (l.kind !== "period") throw new Error(`${id} is not a period row`);
        return `${this.prefix(sheet, l.sheet)}${col}${l.row + 1}`;
      },
      p: (id) => {
        const l = this.loc(id);
        if (l.kind !== "period") throw new Error(`${id} is not a period row`);
        return `${this.prefix(sheet, l.sheet)}${prev}${l.row + 1}`;
      },
      k: (id) => {
        const l = this.loc(id);
        if (l.kind !== "scalar") throw new Error(`${id} is not a scalar row`);
        return `${this.prefix(sheet, l.sheet)}$${colName(LABEL_COLS.value)}$${l.row + 1}`;
      },
      range: (id, from = 0) => {
        const l = this.loc(id);
        if (l.kind !== "period") throw new Error(`${id} is not a period row`);
        const a = `$${colName(FIRST + from)}$${l.row + 1}`;
        const b = `$${colName(FIRST + l.n - 1)}$${l.row + 1}`;
        return `${this.prefix(sheet, l.sheet)}${a}:${b}`;
      },
      table: (id, column) => {
        const l = this.loc(id);
        if (l.kind !== "table") throw new Error(`${id} is not a table`);
        const c = colName(LABEL_COLS.label + column);
        return `${this.prefix(sheet, l.sheet)}$${c}$${l.row + 1}:$${c}$${l.row + l.tableRows!}`;
      },
    };
  }

  /** Address of a table cell (row and column within the table), fixed with $. */
  tableCell(from: string, id: string, row: number, column: number): string {
    const l = this.loc(id);
    return `${this.prefix(from, l.sheet)}$${colName(LABEL_COLS.label + column)}$${l.row + 1 + row}`;
  }

  /** Renders every sheet and the manifest of formula cells with their expected values. */
  render(titles: Record<string, { title: string; subtitle: string }>): {
    sheets: SheetSpec[];
    manifest: ManifestEntry[];
    /** Address of every scalar row, e.g. { "in.hebesatz": "Inputs!C80" }. */
    scalars: Record<string, string>;
  } {
    const manifest: ManifestEntry[] = [];
    const scalars: Record<string, string> = {};
    for (const [id, l] of this.where) if (l.kind === "scalar") scalars[id] = `${l.sheet}!${colName(LABEL_COLS.value)}${l.row + 1}`;
    const specs = this.sheets.map((def) => {
      const rows: (Cell | undefined)[][] = [];
      const validations: { ref: string; list: string[] }[] = [];
      const set = (r: number, c: number, cell: Cell) => {
        (rows[r] ??= [])[c] = cell;
      };
      const t = titles[def.name];
      set(0, 0, { v: t?.title ?? def.name, role: "title" });
      if (t?.subtitle) set(1, 0, { v: t.subtitle, role: "note" });
      if (def.periods) {
        set(3, LABEL_COLS.label, { v: "", role: "header" });
        set(3, LABEL_COLS.unit, { v: "Unit", role: "header" });
        set(3, LABEL_COLS.value, { v: "Value", role: "header" });
        set(3, LABEL_COLS.note, { v: "", role: "header" });
        set(3, LABEL_COLS.opening, { v: "Opening", role: "header" });
        def.periods.forEach((p, i) => set(3, FIRST + i, { v: p, role: "header", fmt: def.periodFmt ?? "year" }));
      }
      let r = 4;
      for (const row of def.rows) {
        if (row.kind === "blank") {
          r += 1;
          continue;
        }
        if (row.kind === "text") {
          set(r, row.startCol ?? 0, { v: row.text, role: row.role ?? "subtitle" });
          // A section heading is a band across the whole sheet.
          if (row.role === "section") for (let c = 1; c < def.widths.length; c++) set(r, c, { v: "", role: "section" });
          row.cells?.forEach((c, i) => set(r, (row.startCol ?? 0) + 1 + i, c));
          r += 1;
          continue;
        }
        if (row.kind === "table") {
          row.head.forEach((h, c) => set(r, c, { v: h, role: "header" }));
          row.rows.forEach((cells, k) => {
            cells.forEach((cell, c) => {
              const out: Cell = { v: cell.v, fmt: cell.fmt, role: cell.role ?? (cell.f ? "calc" : "text") };
              if (cell.f) {
                out.f = cell.f(this.ctx(def.name, 0));
                manifest.push({ sheet: def.name, cell: `${colName(c)}${r + 2 + k}`, id: `${row.id}[${k}][${c}]`, expected: cell.v, fmt: cell.fmt });
              }
              set(r + 1 + k, c, out);
            });
          });
          r += 1 + row.rows.length;
          continue;
        }
        set(r, LABEL_COLS.label, { v: row.label, role: row.role === "total" ? "total" : "label" });
        if (row.unit) set(r, LABEL_COLS.unit, { v: row.unit, role: "unit" });
        if (row.note) set(r, LABEL_COLS.note, { v: row.note, role: "note" });
        if (row.kind === "scalar") {
          const cell: Cell = { v: row.v, fmt: row.fmt, role: row.role ?? (row.f ? "calc" : "input") };
          if (row.f) {
            cell.f = row.f(this.ctx(def.name, 0));
            manifest.push({ sheet: def.name, cell: `${colName(LABEL_COLS.value)}${r + 1}`, id: row.id, expected: row.v, fmt: row.fmt });
          }
          set(r, LABEL_COLS.value, cell);
          if (row.list) validations.push({ ref: `${colName(LABEL_COLS.value)}${r + 1}`, list: row.list });
        } else {
          if (row.open) {
            const cell: Cell = { v: row.open.v, fmt: row.fmt, role: row.open.f ? "calc" : (row.role ?? "input") };
            if (row.open.f) {
              cell.f = row.open.f(this.ctx(def.name, 0));
              manifest.push({ sheet: def.name, cell: `${colName(LABEL_COLS.opening)}${r + 1}`, id: `${row.id}.open`, expected: row.open.v, fmt: row.fmt });
            }
            set(r, LABEL_COLS.opening, cell);
          }
          for (let i = 0; i < row.n; i++) {
            const v = row.values[i] ?? null;
            const cell: Cell = { v, fmt: row.fmt, role: row.role ?? (row.f ? "calc" : "input") };
            if (row.f) {
              cell.f = row.f(this.ctx(def.name, i));
              manifest.push({ sheet: def.name, cell: `${colName(FIRST + i)}${r + 1}`, id: `${row.id}[${i}]`, expected: v, fmt: row.fmt });
            }
            set(r, FIRST + i, cell);
          }
        }
        r += 1;
      }
      return {
        name: def.name,
        rows,
        widths: def.widths,
        freeze: def.freeze,
        tabColor: def.tabColor,
        zoom: 85,
        validations,
        printTitles: def.periods !== undefined,
      } satisfies SheetSpec;
    });
    return { sheets: specs, manifest, scalars };
  }
}

/** Shorthand constructors. */
export const period = (
  id: string,
  label: string,
  n: number,
  f: Formula | undefined,
  values: CellValue[],
  opts: Partial<Omit<PeriodRow, "kind" | "id" | "label" | "n" | "f" | "values">> = {},
): PeriodRow => ({ kind: "period", id, label, n, f, values, ...opts });

export const scalar = (
  id: string,
  label: string,
  f: Formula | undefined,
  v: CellValue,
  opts: Partial<Omit<ScalarRow, "kind" | "id" | "label" | "f" | "v">> = {},
): ScalarRow => ({ kind: "scalar", id, label, f, v, ...opts });

export const text = (t: string, role: Role = "subtitle"): TextRow => ({ kind: "text", text: t, role });
export const blank = (): Row => ({ kind: "blank" });
