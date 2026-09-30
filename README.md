# Wind Farm Investment Calculator

A project-finance model of a fictional onshore wind farm in Germany — EEG 2023 market premium, KfW debt sized on
DSCR, German taxes — that runs entirely in the browser.

- **Live:** https://igorsabodakha.com/wind-farm-calculator/
- **Methodology:** https://igorsabodakha.com/wind-farm-calculator/methodology/
- **Sources:** https://igorsabodakha.com/wind-farm-calculator/sources/

> Illustrative calculation — not investment, tax or legal advice. The wind farm is fictional.

## What it models

- **Base case:** 5 × 6.3 MW in Hesse at the average award of the August 2026 tender, KfW programme 270, GmbH & Co. KG.
- **Revenue:** EEG 2023 sliding market premium on the annual market value, the § 36h correction factor and rounding,
  no premium at negative prices, the § 51a extension; advances and final settlement under § 26; market sales or a PPA
  after support; a simplified two-sided premium stress as a switch.
- **Construction:** monthly capex profiles, VAT bridge loan, fees and interest during construction, DSRA and start-up
  liquidity; sources equal uses.
- **Debt:** KfW 270 with quarterly instalments from the financial-close date; sized on DSCR targets for P50 and one-year
  P90 on the EEG floor with a gearing cap, using the same CFADS as the covenant; linear, annuity or sculpted repayment;
  debt service reserve and lock-up.
- **Tax:** trade tax with add-backs and loss carry-forward, corporate tax and solidarity surcharge for a GmbH,
  depreciation and a decommissioning provision.
- **Results:** equity and project IRR, NPV, LCOE, DSCR, LLCR and payback; the lender's one-year P90 stress, a
  ten-year P90 and a downside case with the loan held fixed and the § 36h site-quality review; a tornado of twelve
  drivers; a bid calculator that checks financeability and the tender ceiling; Excel export.
- **Validity:** every run is checked for input ranges, calculation integrity, funding, covenant and model scope;
  returns of a case that runs out of cash are shown as not meaningful.

Every input has a unit, a hint and a dated public source or a documented assumption.

## Run locally

Requires Node.js 20 or later.

```bash
npm ci
npm run dev           # development server on http://localhost:3000
npm test              # engine and interface tests (Vitest)
npm run typecheck
npm run build         # static export to out/
npm run serve         # serve out/ with the production headers from public/_headers
npm run check:launch  # fails if a page shows a placeholder or lacks the disclaimer
```

## Structure

| Path | Contents |
|---|---|
| `src/engine/` | The model: pure, deterministic TypeScript without UI — `runModel`, `runScenarios`, `tornado`, `solveAwardPrice` |
| `src/app/` | Pages (Next.js app router, static export) |
| `src/components/` | Calculator, SVG charts, site header and footer |
| `src/lib/` | Input definitions, number formats, URL state, XLSX writer, site metadata |
| `src/messages/en.ts` | All interface texts |
| `test/` | Vitest suites |
| `scripts/` | Build helpers: RSC payload names, local server with headers, image rendering, launch gate |

## Verification

- Tests check the financial maths against Microsoft's published XIRR and XNPV examples, the EEG and tax rules, the
  loan calendar and premium timing, the model and its scenarios, the bid calculator and the Excel export.
- A seeded sweep of 500 random input sets runs as a test: with the one-sided premium, the base scenario never
  breaches its covenant, never runs out of cash and passes every calculation check.
- On 30 September 2026 a spreadsheet built from the written specification — not from the code — recomputed the base
  case of the first engine in Microsoft Excel from the engine's loan and total uses (base switches only); all 20 key
  figures and twelve annual lines agreed to the cent. The engine has since been corrected after two external
  reviews; a formula workbook covering every switch is the next step.

## Hosting

Static files on Cloudflare Pages: no server, no cookies, no tracking. The content security policy in
`public/_headers` allows requests to this site only.

## Author

Igor Sabodakha, Wiesbaden — https://igorsabodakha.com/about/

© 2026 Igor Sabodakha
