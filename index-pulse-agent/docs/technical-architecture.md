# IndexPulse — Technical Architecture

**Version:** 1.0
**Date:** 2026-03-31
**Status:** Draft

---

## 1. File Structure

```
/Agents
├── package.json                        # Root workspace config (adds "indexpulse" script)
│
└── index-pulse-agent/
    ├── package.json                    # Agent dependencies + "start" script
    ├── index.js                        # Entry point — orchestrates the run
    ├── fetcher.js                      # Fetches historical prices via yahoo-finance2
    ├── calculator.js                   # Computes YTD returns per quarter
    ├── formatter.js                    # Formats the report string
    ├── writer.js                       # Saves report to reports/ folder
    ├── reports/                        # Output folder (gitignored except .gitkeep)
    │   └── .gitkeep
    └── docs/
        ├── product-spec.md
        └── technical-architecture.md  ← this file
```

---

## 2. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `yahoo-finance2` | latest | Fetch adjusted closing prices by date range |

No other runtime dependencies. No API key required.

---

## 3. Data Flow

```
index.js
  │
  ├─▶ fetcher.js
  │     • Determines date range: Dec 31 of prior year (after market close) → today
  │     • Calls yahoo-finance2.historical() for each of the 8 tickers to fetch adjusted closing prices by date range
  │     • Returns: Map<ticker, { date: Date, adjClose: number }[]>
  │
  ├─▶ calculator.js
  │     • Receives historical price arrays
  │     • Looks up Dec 31 baseline price for each ticker
  │     • Looks up quarter-end price for Q1, Q2, Q3, Q4
  │       (uses last available trading day on or before each quarter-end date)
  │     • Applies quarter status logic (Complete / In Progress / Future)
  │     • Returns: Map<ticker, QuarterResult[]>
  │
  ├─▶ formatter.js
  │     • Receives ticker results + run metadata (date, time)
  │     • Builds the formatted report string (see product-spec §5.1)
  │     • Returns: string
  │
  └─▶ writer.js
        • Prints report string to console
        • Saves report string to reports/indexpulse-YYYY-MM-DD.txt
```

---

## 4. Key Data Structures

### `QuarterResult`
```js
{
  quarter: "Q1" | "Q2" | "Q3" | "Q4",
  year: number,          // e.g. 2026
  status: "complete" | "in_progress" | "future",
  ytdReturn: number | null   // null when status is not "complete"
}
```

### Ticker list (constant in `index.js`)
```js
const TICKERS = [
  { symbol: "SPY",  name: "S&P 500" },
  { symbol: "DIA",  name: "Dow Jones" },
  { symbol: "QQQ",  name: "Nasdaq-100" },
  { symbol: "VTI",  name: "Vanguard Total Market" },
  { symbol: "VXUS", name: "Vanguard Total International" },
  { symbol: "VEA",  name: "Vanguard Developed Markets" },
  { symbol: "VWO",  name: "Vanguard Emerging Markets" },
  { symbol: "BND",  name: "Vanguard Total Bond Market" },
];
```

---

## 5. Quarter Status Logic

At runtime, the current date determines each quarter's status:

| Quarter | End Date    | Status if today is...                        |
|---------|-------------|----------------------------------------------|
| Q1      | Mar 31      | `complete` if today > Mar 31; else `in_progress` |
| Q2      | Jun 30      | `complete` if today > Jun 30; else `in_progress` if today >= Apr 1; else `future` |
| Q3      | Sep 30      | `complete` if today > Sep 30; else `in_progress` if today >= Jul 1; else `future` |
| Q4      | Dec 31      | `complete` if today > Dec 31; else `in_progress` if today >= Oct 1; else `future` |

> For a `complete` quarter, the price used is the last available trading day **on or before** the quarter-end date.

---

## 6. npm Script Wiring

### `index-pulse-agent/package.json`
```json
{
  "name": "index-pulse-agent",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "yahoo-finance2": "^2.x.x"
  }
}
```

### Root `/Agents/package.json` addition
```json
{
  "scripts": {
    "indexpulse": "npm run start --workspace=index-pulse-agent"
  }
}
```

Run from the root:
```bash
npm run indexpulse
```

---

## 7. Error Handling

All errors are surfaced **in the report output** (both terminal and file) rather than silently logged or crashing. The report is always generated; error states replace the value for the affected row.

| Scenario | Display in Report |
|----------|-------------------|
| Network failure | All ticker rows show `Error`; a note at the bottom explains the connection failed |
| Ticker returns no data | That ticker's affected quarter(s) show `Error` |
| Missing baseline (Dec 31) price | That ticker's all quarters show `Error`; note indicates baseline unavailable |
| `reports/` folder missing | Created automatically before writing — not user-visible |

---

## 8. Output File

- Path: `index-pulse-agent/reports/indexpulse-YYYY-MM-DD.txt`
- Encoding: UTF-8
- Overwrite if same-day file exists
- The `reports/` folder is gitignored (except `.gitkeep`)
