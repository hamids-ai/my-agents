import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

/**
 * Fetches adjusted closing prices for each ticker from Dec 31 of prior year → today.
 * @param {Array<{symbol: string, name: string}>} tickers
 * @returns {Map<string, Array<{date: Date, adjClose: number}>>}
 */
export async function fetchPrices(tickers) {
  const today = new Date();
  const priorYear = today.getFullYear() - 1;
  const startDate = new Date(`${priorYear}-12-31`);

  const results = new Map();

  for (const { symbol } of tickers) {
    try {
      const data = await yahooFinance.historical(symbol, {
        period1: startDate,
        period2: today,
        interval: '1d',
      });
      results.set(symbol, data.map(d => ({ date: d.date, adjClose: d.adjClose })));
    } catch {
      results.set(symbol, null);
    }
  }

  return results;
}
