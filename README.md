# Wind Farm Investment Calculator

A project-finance model of a fictional onshore wind farm in Germany — EEG 2023 market premium, KfW debt sized on
DSCR, German taxes — that runs entirely in the browser.

- **Live:** https://igorsabodakha.com/wind-farm-calculator/
- **Methodology:** https://igorsabodakha.com/wind-farm-calculator/methodology/
- **Sources:** https://igorsabodakha.com/wind-farm-calculator/sources/

> Illustrative calculation — not investment, tax or legal advice. The wind farm is fictional.

## What it models

- **Base case:** 5 × 6.3 MW in Hesse at the average award of the August 2026 tender, KfW programme 270, GmbH & Co. KG.
- **Revenue:** EEG 2023 sliding market premium on the annual market value, the § 36h correction factor, no premium
  at negative prices; market sales or a PPA after support; the two-sided premium of the EEG 2027 draft as a switch.
- **Construction:** monthly capex profiles, VAT bridge loan, fees and interest during construction; sources equal uses.
- **Debt:** sized on DSCR targets for P50 and P90 on the EEG floor with a gearing cap; linear, annuity or sculpted
  repayment; debt service reserve and lock-up.
- **Tax:** trade tax with add-backs and loss carry-forward, corporate tax and solidarity surcharge for a GmbH,
  depreciation and a decommissioning provision.
- **Results:** equity and project IRR, NPV, LCOE, DSCR, LLCR and payback; P90 and downside scenarios with the loan
  held fixed; a tornado of twelve drivers; a bid calculator; fifteen integrity checks; Excel export.

Every input has a unit, a hint and a dated public source.

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
  model and its scenarios, the bid calculator and the Excel export.
- A spreadsheet built from the written specification — not from the code — reproduces the base case in Microsoft
  Excel: all 20 key figures and twelve annual lines agree to the cent.

## Hosting

Static files on Cloudflare Pages: no server, no cookies, no tracking. The content security policy in
`public/_headers` allows requests to this site only.

## Author

Igor Sabodakha, Wiesbaden — https://igorsabodakha.com/about/

© 2026 Igor Sabodakha
