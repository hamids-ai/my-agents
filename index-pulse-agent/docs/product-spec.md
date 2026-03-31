# IndexPulse — Product Specification

**Version:** 1.0
**Date:** 2026-03-31
**Status:** Draft

---

## 1. Overview

IndexPulse is a command-line agent that fetches and displays the year-to-date (YTD) performance of key financial indexes and ETFs, broken down by quarter. It runs on demand and prints a formatted report to the terminal and saves it to a file.

---

## 2. Goals

- Give the user a quick, accurate snapshot of how major market indexes have performed so far this year.
- Require zero manual data entry — all data is fetched automatically.
- Be simple to run: one command, immediate output.

---

## 3. Indexes Tracked

| # | Ticker | Name |
|---|--------|------|
| 1 | SPY | S&P 500 (SPDR S&P 500 ETF) |
| 2 | DIA | Dow Jones Industrial Average (SPDR Dow Jones ETF) |
| 3 | QQQ | Nasdaq-100 (Invesco QQQ ETF) |
| 4 | VTI | Vanguard Total Stock Market ETF |
| 5 | VXUS | Vanguard Total International Stock ETF |
| 6 | VEA | Vanguard Developed Markets ETF |
| 7 | VWO | Vanguard Emerging Markets ETF |
| 8 | BND | Vanguard Total Bond Market ETF |

> **Note:** The user referenced "Dow Jones index" and "Nasdaq index." DIA and QQQ are the standard ETF proxies for those indexes. These tickers will be confirmed in Milestone 2.

---

## 4. Performance Calculation

### 4.1 Baseline
- The **starting value** for all calculations is the **adjusted closing price on December 31 of the prior calendar year**.
- Example: For the 2026 reporting year, the baseline is the Dec 31, 2025 closing price.

### 4.2 Quarter-End Dates
| Quarter | Period | End Date |
|---------|--------|----------|
| Q1 | Jan 1 – Mar 31 | March 31 |
| Q2 | Jan 1 – Jun 30 | June 30 |
| Q3 | Jan 1 – Sep 30 | September 30 |
| Q4 | Jan 1 – Dec 31 | December 31 |

> If a quarter-end date falls on a weekend or market holiday, the last available market close before that date is used.

### 4.3 Performance Formula
Each quarter displays **cumulative YTD performance** measured from the Dec 31 baseline:

```
YTD Return = (Quarter-End Price − Dec 31 Baseline Price) / Dec 31 Baseline Price × 100
```

### 4.4 Quarter Status Logic
When the agent runs, each quarter falls into one of three states:

| State | Condition | Display |
|-------|-----------|---------|
| **Complete** | Quarter end date has passed and markets have closed | Calculated % (e.g., `+5.2%`) |
| **In Progress** | Current date is within the quarter | `In Progress` |
| **Future** | Quarter has not yet started | `N/A` |

---

## 5. Output

### 5.1 Terminal Output
Printed to the console when the agent is run.

```
IndexPulse — YTD Performance Report
As of: March 31, 2026
Generated: 2026-03-31 14:32:00

────────────────────────────────────────
SPY (S&P 500)
  Q1 2026:  -4.6%
  Q2 2026:  N/A
  Q3 2026:  N/A
  Q4 2026:  N/A

DIA (Dow Jones)
  Q1 2026:  -1.3%
  Q2 2026:  N/A
  Q3 2026:  N/A
  Q4 2026:  N/A

QQQ (Nasdaq-100)
  Q1 2026:  -8.0%
  Q2 2026:  N/A
  Q3 2026:  N/A
  Q4 2026:  N/A

VTI (Vanguard Total Market)
  Q1 2026:  -4.8%
  Q2 2026:  N/A
  Q3 2026:  N/A
  Q4 2026:  N/A

VXUS (Vanguard Total International)
  Q1 2026:  +5.5%
  Q2 2026:  N/A
  Q3 2026:  N/A
  Q4 2026:  N/A

VEA (Vanguard Developed Markets)
  Q1 2026:  +6.7%
  Q2 2026:  N/A
  Q3 2026:  N/A
  Q4 2026:  N/A

VWO (Vanguard Emerging Markets)
  Q1 2026:  +3.1%
  Q2 2026:  N/A
  Q3 2026:  N/A
  Q4 2026:  N/A

BND (Vanguard Total Bond Market)
  Q1 2026:  +1.2%
  Q2 2026:  N/A
  Q3 2026:  N/A
  Q4 2026:  N/A
────────────────────────────────────────
Baseline: Dec 31, 2025 closing prices | Data: Yahoo Finance
```

> **Note:** The performance values shown above are illustrative placeholders for format demonstration only.

### 5.2 File Output
- A copy of the report is saved to `index-pulse-agent/reports/` as a `.txt` file.
- Filename format: `indexpulse-YYYY-MM-DD.txt` (e.g., `indexpulse-2026-03-31.txt`)
- If a report for the same date already exists, it is overwritten.

---

## 6. Data Source

- **Provider:** Yahoo Finance
- **Library:** `yahoo-finance2` (npm package)
- **Authentication:** None required — no API key needed
- **Data fetched:** Adjusted historical closing prices for each ticker

---

## 7. Running the Agent

```bash
# From the root /Agents directory:
npm run indexpulse

# Or from within the agent folder:
npm start
```

---

## 8. Error Handling (User-Facing)

| Scenario | Behavior |
|----------|----------|
| Ticker data unavailable | Display `Error` for that ticker's affected quarters |
| No internet connection | All quarter values show `Error`; a note at the bottom of the report explains the connection failed |
| Market hasn't closed yet on a quarter-end date | Use the most recent available price and note it in the output |

---

## 9. Out of Scope (v1.0)

- No historical year comparisons (prior years)
- No email or Slack delivery
- No web UI or dashboard
- No charting or visualization
- No user configuration file for custom tickers
