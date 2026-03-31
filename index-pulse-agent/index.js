import { fetchPrices } from './fetcher.js';
import { calculateReturns } from './calculator.js';
import { formatReport } from './formatter.js';
import { writeReport } from './writer.js';

const TICKERS = [
  { symbol: 'SPY',  name: 'S&P 500' },
  { symbol: 'DIA',  name: 'Dow Jones' },
  { symbol: 'QQQ',  name: 'Nasdaq-100' },
  { symbol: 'VTI',  name: 'Vanguard Total Market' },
  { symbol: 'VXUS', name: 'Vanguard Total International' },
  { symbol: 'VEA',  name: 'Vanguard Developed Markets' },
  { symbol: 'VWO',  name: 'Vanguard Emerging Markets' },
  { symbol: 'BND',  name: 'Vanguard Total Bond Market' },
];

async function run() {
  const priceData = await fetchPrices(TICKERS);
  const results = calculateReturns(TICKERS, priceData);
  const report = formatReport(TICKERS, results);
  await writeReport(report);
}

run();
