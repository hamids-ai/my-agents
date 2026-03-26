#!/usr/bin/env node

/**
 * Test Mode for News Agent
 *
 * Runs the agent with sample email data instead of connecting to Gmail.
 * Useful for:
 * - Testing without Gmail OAuth setup
 * - Development and debugging
 * - Demonstrating the agent's capabilities
 *
 * Usage: node test-mode.js [--no-ai] [--no-browser]
 *
 * Options:
 *   --no-ai      Skip Claude API calls (use mock summaries)
 *   --no-browser Don't open the HTML report in browser
 */

import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { processNewsletterContent } from './content-processor.js';
import { summarizeContent } from './summarizer.js';
import { generateAndOpenReport, generateReport } from './report-generator.js';

// Load environment variables: root .env first, then local .env as fallback
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });
dotenv.config({ path: join(__dirname, '.env') });

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const SKIP_AI = args.includes('--no-ai');
const SKIP_BROWSER = args.includes('--no-browser');

// ============================================================================
// Logging (same as agent.js)
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

function log(message, type = 'info') {
  const prefix = {
    info: `${COLORS.blue}ℹ${COLORS.reset}`,
    success: `${COLORS.green}✓${COLORS.reset}`,
    warning: `${COLORS.yellow}⚠${COLORS.reset}`,
    error: `${COLORS.red}✗${COLORS.reset}`,
    step: `${COLORS.cyan}→${COLORS.reset}`,
    test: `${COLORS.magenta}🧪${COLORS.reset}`
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

function logStep(stepNum, total, message) {
  const progress = `${COLORS.dim}[${stepNum}/${total}]${COLORS.reset}`;
  console.log(`\n${progress} ${COLORS.bright}${message}${COLORS.reset}`);
}

// ============================================================================
// Mock Summarizer (for --no-ai mode)
// ============================================================================

function createMockSummary(processedContent) {
  return {
    briefingIntro: 'This is a test briefing generated without AI. The summaries below are from the original extracted content.',
    generatedAt: new Date().toISOString(),
    preferences: { tone: 'professional', depth: 'standard' },
    stats: processedContent.summary,
    trends: processedContent.trends,
    topicSummaries: Object.fromEntries(
      Object.entries(processedContent.categories)
        .filter(([_, stories]) => stories.length > 0)
        .map(([topic, stories]) => [topic, `${stories.length} stories in ${topic} today.`])
    ),
    stories: processedContent.stories.map(story => ({
      headline: story.headline,
      summary: story.summary || 'No summary available.',
      keyTakeaway: null,
      originalSummary: story.summary,
      sourceLink: story.sourceLink,
      topic: story.topic,
      urgency: story.urgency,
      sentiment: story.sentiment || 'neutral',
      keyEntities: story.keyEntities || [],
      readTimeMinutes: story.readTimeMinutes || 1,
      sources: story.sources || [story.newsletterSource],
      sourceCount: story.sourceCount || 1,
      isBreaking: story.isBreaking || false,
      trend: story.trend || { isRepeating: false, trendingEntities: [] }
    })),
    byUrgency: {
      high: processedContent.stories.filter(s => s.urgency === 'High'),
      medium: processedContent.stories.filter(s => s.urgency === 'Medium'),
      low: processedContent.stories.filter(s => s.urgency === 'Low')
    },
    byTopic: processedContent.categories
  };
}

// ============================================================================
// Load Sample Emails
// ============================================================================

async function loadSampleEmails() {
  try {
    const content = await readFile('./data/sample-emails.json', 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load sample emails: ${error.message}`);
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runTestMode() {
  const startTime = Date.now();
  const totalSteps = SKIP_AI ? 3 : 4;

  console.log(`
${COLORS.magenta}╔════════════════════════════════════════════════╗
║         🧪 News Agent TEST MODE                ║
╚════════════════════════════════════════════════╝${COLORS.reset}
`);

  log('Running with sample data (no Gmail connection)', 'test');
  if (SKIP_AI) {
    log('AI summarization disabled (--no-ai flag)', 'test');
  }
  if (SKIP_BROWSER) {
    log('Browser auto-open disabled (--no-browser flag)', 'test');
  }

  let emails = [];
  let processedContent = null;
  let summarizedContent = null;
  let reportPath = null;

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: Load Sample Emails
  // ──────────────────────────────────────────────────────────────────────────
  logStep(1, totalSteps, 'Loading sample email data...');

  try {
    emails = await loadSampleEmails();
    log(`Loaded ${emails.length} sample newsletter(s)`, 'success');
    emails.forEach(e => log(`  • ${e.subject}`, 'step'));
  } catch (error) {
    log(`Failed to load sample data: ${error.message}`, 'error');
    log('Make sure data/sample-emails.json exists', 'info');
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: Process Content
  // ──────────────────────────────────────────────────────────────────────────
  logStep(2, totalSteps, 'Processing newsletter content...');

  try {
    processedContent = await processNewsletterContent(emails);
    log(`Extracted ${processedContent.totalStories} stories`, 'success');
    log(`Removed ${processedContent.duplicatesRemoved} duplicates`, 'success');

    if (processedContent.totalStories === 0) {
      log('No stories extracted. Check sample data format.', 'warning');
      process.exit(0);
    }
  } catch (error) {
    log(`Failed to process content: ${error.message}`, 'error');
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Generate Summaries (or mock)
  // ──────────────────────────────────────────────────────────────────────────
  if (!SKIP_AI) {
    logStep(3, totalSteps, 'Generating AI summaries with Claude...');

    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not set. Use --no-ai flag to skip AI summarization.');
      }

      summarizedContent = await summarizeContent(processedContent);
      log('Summaries generated successfully', 'success');
      log(`  • High priority: ${summarizedContent.stats.byUrgency.high}`, 'step');
      log(`  • Medium priority: ${summarizedContent.stats.byUrgency.medium}`, 'step');
      log(`  • Low priority: ${summarizedContent.stats.byUrgency.low}`, 'step');
    } catch (error) {
      log(`AI summarization failed: ${error.message}`, 'error');
      log('Falling back to mock summaries...', 'warning');
      summarizedContent = createMockSummary(processedContent);
    }
  } else {
    logStep(3, totalSteps, 'Creating mock summaries (AI disabled)...');
    summarizedContent = createMockSummary(processedContent);
    log('Mock summaries created', 'success');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Generate HTML Report
  // ──────────────────────────────────────────────────────────────────────────
  logStep(SKIP_AI ? 3 : 4, totalSteps, 'Generating HTML report...');

  try {
    if (SKIP_BROWSER) {
      reportPath = await generateReport(summarizedContent);
      log('Report saved (browser open skipped)', 'success');
    } else {
      reportPath = await generateAndOpenReport(summarizedContent);
      log('Report saved and opened in browser!', 'success');
    }
    log(`  • File: ${reportPath}`, 'step');
  } catch (error) {
    log(`Failed to generate report: ${error.message}`, 'error');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Complete
  // ──────────────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`
${COLORS.magenta}╔════════════════════════════════════════════════╗
║           ✅ Test Run Complete!                ║
╚════════════════════════════════════════════════╝${COLORS.reset}
`);

  log(`Processed ${emails.length} sample newsletters → ${summarizedContent.stats.totalStories || processedContent.totalStories} stories`);
  log(`Completed in ${elapsed} seconds`);

  if (reportPath) {
    log(`Report: ${reportPath}`);
  }

  console.log(`
${COLORS.dim}Test mode options:
  --no-ai      Skip Claude API calls
  --no-browser Don't auto-open browser${COLORS.reset}
`);

  return {
    emails,
    processed: processedContent,
    summarized: summarizedContent,
    reportPath
  };
}

// ============================================================================
// Run
// ============================================================================

runTestMode().catch((error) => {
  console.error(`\n${COLORS.red}Test failed: ${error.message}${COLORS.reset}`);
  console.error(`${COLORS.dim}${error.stack}${COLORS.reset}\n`);
  process.exit(1);
});
