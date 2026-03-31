/**
 * Determines each quarter's status and computes cumulative YTD return.
 * @param {Array<{symbol: string, name: string}>} tickers
 * @param {Map<string, Array<{date: Date, adjClose: number}> | null>} priceData
 * @returns {Map<string, Array<QuarterResult>>}
 */
export function calculateReturns(tickers, priceData) {
  const today = new Date();
  const year = today.getFullYear();
  const quarters = getQuarters(year, today);
  const results = new Map();

  for (const { symbol } of tickers) {
    const prices = priceData.get(symbol);

    if (!prices || prices.length === 0) {
      results.set(symbol, quarters.map(q => ({ ...q, ytdReturn: null, error: true })));
      continue;
    }

    const baseline = findPriceOnOrBefore(prices, new Date(`${year - 1}-12-31`));

    if (baseline === null) {
      results.set(symbol, quarters.map(q => ({ ...q, ytdReturn: null, error: true })));
      continue;
    }

    results.set(symbol, quarters.map(q => {
      if (q.status === 'future') return { ...q, ytdReturn: null, error: false };
      if (q.status === 'in_progress') return { ...q, ytdReturn: null, error: false };

      const endPrice = findPriceOnOrBefore(prices, q.endDate);
      if (endPrice === null) return { ...q, ytdReturn: null, error: true };

      const ytdReturn = ((endPrice - baseline) / baseline) * 100;
      return { ...q, ytdReturn, error: false };
    }));
  }

  return results;
}

/**
 * Returns quarter definitions with status for the given year and run date.
 */
function getQuarters(year, today) {
  const defs = [
    { quarter: 'Q1', endDate: new Date(`${year}-03-31`), startMonth: 0 },
    { quarter: 'Q2', endDate: new Date(`${year}-06-30`), startMonth: 3 },
    { quarter: 'Q3', endDate: new Date(`${year}-09-30`), startMonth: 6 },
    { quarter: 'Q4', endDate: new Date(`${year}-12-31`), startMonth: 9 },
  ];

  return defs.map(({ quarter, endDate, startMonth }) => {
    const startDate = new Date(year, startMonth, 1);
    let status;
    if (today > endDate) {
      status = 'complete';
    } else if (today >= startDate) {
      status = 'in_progress';
    } else {
      status = 'future';
    }
    return { quarter, year, endDate, status };
  });
}

/**
 * Finds the most recent adjClose price on or before the target date (compared by calendar date).
 * Returns null if none found.
 */
function findPriceOnOrBefore(prices, targetDate) {
  const target = toDateString(targetDate);
  let best = null;

  for (const { date, adjClose } of prices) {
    const d = toDateString(date);
    if (d <= target) {
      if (best === null || d > toDateString(best.date)) {
        best = { date, adjClose };
      }
    }
  }

  return best ? best.adjClose : null;
}

/** Returns 'YYYY-MM-DD' string for date comparison independent of time/timezone. */
function toDateString(date) {
  return date.toISOString().slice(0, 10);
}
