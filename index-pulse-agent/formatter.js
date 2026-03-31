/**
 * Builds the formatted report string.
 * @param {Array<{symbol: string, name: string}>} tickers
 * @param {Map<string, Array<QuarterResult>>} results
 * @returns {string}
 */
export function formatReport(tickers, results) {
  const now = new Date();
  const runDate = now.toISOString().slice(0, 10);
  const runTime = now.toTimeString().slice(0, 8);
  const asOf = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const divider = '─'.repeat(44);

  const lines = [
    'IndexPulse — YTD Performance Report',
    `As of: ${asOf}`,
    `Generated: ${runDate} ${runTime}`,
    '',
    divider,
  ];

  const errors = [];

  for (const { symbol, name } of tickers) {
    lines.push(`${symbol} (${name})`);
    const quarters = results.get(symbol);

    for (const q of quarters) {
      const label = `  ${q.quarter} ${q.year}: `;
      let value;

      if (q.error) {
        value = 'Error';
        if (!errors.includes(symbol)) errors.push(symbol);
      } else if (q.status === 'future') {
        value = 'N/A';
      } else if (q.status === 'in_progress') {
        value = 'In Progress';
      } else {
        const sign = q.ytdReturn >= 0 ? '+' : '';
        value = `${sign}${q.ytdReturn.toFixed(1)}%`;
      }

      lines.push(`${label}${value}`);
    }

    lines.push('');
  }

  lines.push(divider);
  lines.push('Baseline: Dec 31 closing prices | Data: Yahoo Finance');

  if (errors.length > 0) {
    lines.push(`Note: Data unavailable for ${errors.join(', ')}`);
  }

  return lines.join('\n');
}
