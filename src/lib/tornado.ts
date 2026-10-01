// Labels of the sensitivity analysis in the page's language: the measure of a bar and the settings of a driver.
import type { TornadoMetric, TornadoSetting } from "@/engine";
import type { Messages } from "@/messages";
import { FORMAT, type Format } from "./format";

export function formatMetric(metric: TornadoMetric, v: number, f: Format = FORMAT.en): string {
  if (metric === "minDscr") return f.ratio(v);
  if (metric === "lcoeRealCt") return f.ct(v);
  return f.pct(v, 1);
}

/** A driver's low or high setting: "60%" / "60 %", "+0.5 pp" / "+0,5 Pp.", "25 yrs" / "25 Jahre". */
export function settingLabel(s: TornadoSetting, side: "low" | "high", f: Format, units: Messages["sensitivity"]["units"]): string {
  const v = s[side];
  const sign = v > 0 ? "+" : "";
  switch (s.unit) {
    case "pct":
      return f.pct(v, s.decimals);
    case "change":
      return `${sign}${f.pct(v, s.decimals)}`;
    case "pp":
      return `${sign}${f.num(v * 100, s.decimals)} ${units.pp}`;
    case "eurMwh":
      return `${f.num(v, s.decimals)} €/MWh`;
    case "ct":
      return `${f.num(v, s.decimals)} ct`;
    case "years":
      return `${f.num(v, s.decimals)} ${units.years}`;
    case "factor":
      return f.num(v, s.decimals);
  }
}
