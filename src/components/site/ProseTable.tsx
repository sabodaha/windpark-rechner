import type { ReactNode } from "react";

/** A table in a text page, scrolling sideways on narrow screens; `num` marks the right-aligned number columns. */
export function ProseTable({ head, rows, num: numeric = [] }: { head: string[]; rows: ReactNode[][]; num?: number[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={numeric.includes(i) ? "num" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={numeric.includes(j) ? "num" : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
