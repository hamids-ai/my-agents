#!/usr/bin/env node

/**
 * News Agent - Gmail Newsletter Summarizer
 * =========================================
 *
 * An AI-powered agent that fetches your daily newsletters from Gmail,
 * extracts and categorizes news stories, generates intelligent summaries
 * using Claude AI, and produces a beautiful HTML briefing.
 *
 * Pipeline:
 *   1. Fetch emails from Gmail via MCP (Model Context Protocol)
 *   2. Parse HTML content and extract individual stories
 *   3. Categorize, deduplicate, and score stories by urgency
 *   4. Generate AI summaries using Claude
 *   5. Create an HTML report and open in browser
 *   6. Collect user feedback to improve future briefings
 *
 * Usage:
 *   node agent.js     - Run the full pipeline
 *   npm start         - Same as above
 *   npm test          - Run with sample data
 *
 * Configuration:
 *   .env                    - ANTHROPIC_API_KEY
 *   data/preferences.json   - User preferences (tone, topics, keywords)
 *   mcp-config.json         - Gmail MCP server configuration
 *
 * @module agent
 * @requires dotenv
 * @requires ./gmail-client
 * @requires ./content-processor
 * @requires ./summarizer
 * @requires ./report-generator
 * @requires ./feedback
 */

import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fetchNewsletterEmails, NEWSLETTER_SENDERS } from './gmail-client.js';
import { processNewsletterContent } from './content-processor.js';
import { summarizeContent } from './summarizer.js';
import { generateAndOpenReport } from './report-generator.js';
import { promptForFeedback } from './feedback.js';
import { formatDuration } from './api-utils.js';

// Load environment variables: root .env first, then local .env as fallback
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });  // Root Agents/.env
dotenv.config({ path: join(__dirname, '.env') });         // Local fallback

// ============================================================================
// ANSI Color Codes for Terminal Output
// ============================================================================

/**
 * ANSI escape codes for colored terminal output.
 * Used to make the CLI output more readable and visually appealing.
 */
const COLORS = {
  reset: '\x1b[0m',      // Reset all styles
  bright: '\x1b[1m',     // Bold text
  dim: '\x1b[2m',        // Dimmed text
  green: '\x1b[32m',     // Success messages
  yellow: '\x1b[33m',    // Warning messages
  blue: '\x1b[34m',      // Info messages
  cyan: '\x1b[36m',      // Step indicators
  red: '\x1b[31m'        // Error messages
};

// ============================================================================
// Logging Utilities
// ============================================================================

/**
 * Log a message with a colored prefix icon.
 *
 * @param {string} message - The message to display
 * @param {'info'|'success'|'warning'|'error'|'step'} type - Message type
 *
 * @example
 * log('Connected to Gmail', 'success');  // ✓ Connected to Gmail
 * log('API key missing', 'error');       // ✗ API key missing
 */
function log(message, type = 'info') {
  const prefix = {
    info: `${COLORS.blue}ℹ${COLORS.reset}`,
    success: `${COLORS.green}✓${COLORS.reset}`,
    warning: `${COLORS.yellow}⚠${COLORS.reset}`,
    error: `${COLORS.red}✗${COLORS.reset}`,
    step: `${COLORS.cyan}→${COLORS.reset}`
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

/**
 * Log a step header with progress indicator.
 *
 * @param {number} stepNum - Current step number
 * @param {number} total - Total number of steps
 * @param {string} message - Step description
 *
 * @example
 * logStep(1, 5, 'Fetching newsletters...');  // [1/5] Fetching newsletters...
 */
function logStep(stepNum, total, message) {
  const progress = `${COLORS.dim}[${stepNum}/${total}]${COLORS.reset}`;
  console.log(`\n${progress} ${COLORS.bright}${message}${COLORS.reset}`);
}

/**
 * Log a horizontal divider line.
 * Used to visually separate sections in the output.
 */
function logDivider() {
  console.log(`${COLORS.dim}${'─'.repeat(50)}${COLORS.reset}`);
}

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Validate that required environment variables are set.
 * Exits with helpful error message if ANTHROPIC_API_KEY is missing.
 */
function validateEnvironment() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`
${COLORS.red}╔════════════════════════════════════════════════╗
║         ❌ Missing API Key                     ║
╚════════════════════════════════════════════════╝${COLORS.reset}

ANTHROPIC_API_KEY is not set in your .env file.

To fix this:
1. Get an API key from https://console.anthropic.com/
2. Add it to your .env file:
   ${COLORS.cyan}ANTHROPIC_API_KEY=sk-ant-...${COLORS.reset}

See SETUP.md for detailed instructions.
`);
    process.exit(1);
  }
}

// ============================================================================
// Main Orchestrator Function
// ============================================================================

/**
 * Main entry point - orchestrates the entire newsletter processing pipeline.
 *
 * This function runs the following steps in sequence:
 * 1. Fetches newsletter emails from Gmail via MCP
 * 2. Processes content (parse HTML, extract stories, categorize, dedupe)
 * 3. Generates AI summaries using Claude
 * 4. Creates and opens an HTML report
 * 5. Collects user feedback for future improvements
 *
 * Each step has error handling that either:
 * - Exits gracefully with helpful message (critical failures)
 * - Falls back to degraded functionality (non-critical failures)
 *
 * @async
 * @returns {Promise<Object>} Results object containing:
 *   - emails: Array of fetched email objects
 *   - processed: Processed content with extracted stories
 *   - summarized: AI-summarized content
 *   - reportPath: Path to the generated HTML report
 *
 * @example
 * // Run programmatically
 * const result = await main();
 * console.log(`Generated ${result.summarized.stats.totalStories} stories`);
 */
async function main() {
  // Track execution time for performance reporting
  const startTime = Date.now();
  const totalSteps = 5;

  // ──────────────────────────────────────────────────────────────────────────
  // Startup Banner
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`
${COLORS.bright}╔════════════════════════════════════════════════╗
║           📰 News Agent Starting...            ║
╚════════════════════════════════════════════════╝${COLORS.reset}
`);

  // Validate environment before proceeding
  validateEnvironment();

  // Display current date and tracked newsletters
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  log(`Date: ${today}`);
  log(`Tracking: ${NEWSLETTER_SENDERS.join(', ')}`);

  // Initialize result containers
  let emails = [];
  let processedContent = null;
  let summarizedContent = null;
  let reportPath = null;

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: Fetch Newsletters from Gmail
  // ──────────────────────────────────────────────────────────────────────────
  // Uses MCP (Model Context Protocol) to connect to Gmail and fetch
  // emails from the configured newsletter senders received today.
  // ──────────────────────────────────────────────────────────────────────────
  logStep(1, totalSteps, 'Fetching newsletters from Gmail...');

  try {
    emails = await fetchNewsletterEmails(log);

    if (emails.length === 0) {
      log('No newsletters found for today.', 'warning');
      console.log(`\n${COLORS.yellow}Nothing to process. Check back later!${COLORS.reset}\n`);
      process.exit(0);
    }

    log(`Found ${emails.length} newsletter(s)`, 'success');
    emails.forEach(e => log(`  • ${e.subject}`, 'step'));

    // Estimate total processing time
    // Rough estimate: ~3s per newsletter for extraction + ~2s per story for summarization
    // Average ~5-10 stories per newsletter, plus categorization and deduplication
    const estimatedStoriesPerNewsletter = 7;
    const estimatedStories = emails.length * estimatedStoriesPerNewsletter;
    const estimatedApiCalls = emails.length + 2 + Math.ceil(estimatedStories / 10) + 1 + 5; // extraction + categorize/dedupe + summary batches + intro + topic summaries
    const estimatedMs = estimatedApiCalls * 2500; // ~2.5s per API call including delays
    const estimatedTime = formatDuration(estimatedMs);

    console.log(`\n${COLORS.cyan}═══════════════════════════════════════════════════${COLORS.reset}`);
    console.log(`${COLORS.bright}  📊 Estimated Processing Time: ${estimatedTime}${COLORS.reset}`);
    console.log(`${COLORS.dim}  (Processing ${emails.length} newsletters with rate limiting)${COLORS.reset}`);
    console.log(`${COLORS.cyan}═══════════════════════════════════════════════════${COLORS.reset}`);

  } catch (error) {
    log(`Failed to fetch emails: ${error.message}`, 'error');
    console.log(`\n${COLORS.dim}Tip: Make sure you've set up Gmail OAuth. See SETUP.md for instructions.${COLORS.reset}\n`);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: Process and Analyze Content
  // ──────────────────────────────────────────────────────────────────────────
  // Parses HTML content from each newsletter, extracts individual stories,
  // categorizes them by topic, identifies duplicates across newsletters,
  // and assigns urgency scores based on keywords and user preferences.
  // ──────────────────────────────────────────────────────────────────────────
  logStep(2, totalSteps, 'Processing newsletter content...');

  try {
    processedContent = await processNewsletterContent(emails);

    log(`Extracted ${processedContent.totalStories} stories`, 'success');
    log(`Removed ${processedContent.duplicatesRemoved} duplicates`, 'success');

    if (processedContent.totalStories === 0) {
      log('No stories could be extracted from the newsletters.', 'warning');
      console.log(`\n${COLORS.yellow}The newsletters may have unusual formatting.${COLORS.reset}\n`);
      process.exit(0);
    }

  } catch (error) {
    log(`Failed to process content: ${error.message}`, 'error');
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Generate AI Summaries
  // ──────────────────────────────────────────────────────────────────────────
  // Uses Claude AI to generate concise 2-3 sentence summaries for each
  // story, create key takeaways, and write topic-level summaries.
  // Respects user preferences for tone and depth from preferences.json.
  // ──────────────────────────────────────────────────────────────────────────
  logStep(3, totalSteps, 'Generating AI summaries with Claude...');

  try {
    summarizedContent = await summarizeContent(processedContent);

    log('Summaries generated successfully', 'success');
    log(`  • High priority: ${summarizedContent.stats.byUrgency.high}`, 'step');
    log(`  • Medium priority: ${summarizedContent.stats.byUrgency.medium}`, 'step');
    log(`  • Low priority: ${summarizedContent.stats.byUrgency.low}`, 'step');
    log(`  • Total read time: ${summarizedContent.stats.totalReadTime} minutes`, 'step');

  } catch (error) {
    // Non-critical failure: fall back to original content without AI summaries
    log(`Failed to generate summaries: ${error.message}`, 'error');
    log('Continuing with original content...', 'warning');

    // Create a fallback structure that matches summarizedContent format
    summarizedContent = {
      ...processedContent,
      briefingIntro: 'Your daily newsletter summary.',
      stats: processedContent.summary,
      byTopic: processedContent.categories,
      byUrgency: {
        high: processedContent.stories.filter(s => s.urgency === 'High'),
        medium: processedContent.stories.filter(s => s.urgency === 'Medium'),
        low: processedContent.stories.filter(s => s.urgency === 'Low')
      },
      topicSummaries: {}
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Generate HTML Report
  // ──────────────────────────────────────────────────────────────────────────
  // Creates a beautiful, responsive HTML report with all stories organized
  // by topic and urgency. Saves to reports/ folder and opens in browser.
  // ──────────────────────────────────────────────────────────────────────────
  logStep(4, totalSteps, 'Generating HTML report...');

  try {
    reportPath = await generateAndOpenReport(summarizedContent);

    log('Report saved and opened in browser!', 'success');
    log(`  • File: ${reportPath}`, 'step');

  } catch (error) {
    // Non-critical failure: report generation failed but processing succeeded
    log(`Failed to generate report: ${error.message}`, 'error');
    log('You can still see the summary above.', 'warning');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: Collect User Feedback
  // ──────────────────────────────────────────────────────────────────────────
  // Prompts the user for feedback on which topics/stories they found
  // valuable and which to de-prioritize. Saves to preferences.json
  // to improve future briefings.
  // ──────────────────────────────────────────────────────────────────────────
  logStep(5, totalSteps, 'Collecting feedback...');

  try {
    await promptForFeedback(summarizedContent);
  } catch (error) {
    // Non-critical failure: feedback is optional
    log('Feedback collection skipped.', 'warning');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Completion Summary
  // ──────────────────────────────────────────────────────────────────────────
  const elapsedMs = Date.now() - startTime;
  const elapsedFormatted = formatDuration(elapsedMs);

  console.log(`
${COLORS.bright}╔════════════════════════════════════════════════╗
║            ✅ Briefing Complete!               ║
╚════════════════════════════════════════════════╝${COLORS.reset}
`);

  log(`Processed ${emails.length} newsletters → ${summarizedContent.stats.totalStories} stories`);
  log(`Total time: ${elapsedFormatted}`);

  if (reportPath) {
    log(`Report: ${reportPath}`);
  }

  console.log(`\n${COLORS.dim}Thanks for using News Agent. See you tomorrow!${COLORS.reset}\n`);

  // Return results for programmatic use
  return {
    emails,
    processed: processedContent,
    summarized: summarizedContent,
    reportPath
  };
}

// ============================================================================
// Entry Point
// ============================================================================

// Run the main function and handle any uncaught errors
main().catch((error) => {
  console.error(`\n${COLORS.red}Unexpected error: ${error.message}${COLORS.reset}`);
  console.error(`${COLORS.dim}${error.stack}${COLORS.reset}\n`);
  process.exit(1);
});

// ============================================================================
// Module Exports
// ============================================================================

/**
 * Export key functions for programmatic use.
 * This allows the agent to be used as a library in other projects.
 *
 * @example
 * import { fetchNewsletterEmails, processNewsletterContent } from './agent.js';
 *
 * const emails = await fetchNewsletterEmails();
 * const processed = await processNewsletterContent(emails);
 */
export {
  fetchNewsletterEmails,
  NEWSLETTER_SENDERS,
  processNewsletterContent,
  summarizeContent,
  generateAndOpenReport,
  promptForFeedback
};
