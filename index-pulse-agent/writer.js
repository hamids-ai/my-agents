import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, 'reports');

/**
 * Prints the report to the terminal and saves it to reports/indexpulse-YYYY-MM-DD.txt.
 * @param {string} report
 */
export async function writeReport(report) {
  console.log(report);

  const date = new Date().toISOString().slice(0, 10);
  const filename = `indexpulse-${date}.txt`;

  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(join(REPORTS_DIR, filename), report, 'utf-8');
}
