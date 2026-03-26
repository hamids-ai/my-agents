/**
 * API Utilities - Rate Limiting, Retry Logic, and Progress Tracking
 * ==================================================================
 *
 * Provides utilities for:
 * - Exponential backoff retry on rate limit errors
 * - Configurable delays between API calls
 * - Progress tracking with ETA estimation
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_CONFIG = {
  // Initial delay between API calls (ms)
  baseDelay: 1000,

  // Maximum retry attempts on rate limit
  maxRetries: 5,

  // Initial backoff delay (ms)
  initialBackoff: 5000,

  // Maximum backoff delay (ms)
  maxBackoff: 60000,

  // Backoff multiplier (exponential)
  backoffMultiplier: 2
};

// ============================================================================
// ANSI Color Codes
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

// ============================================================================
// Delay Utility
// ============================================================================

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Retry with Exponential Backoff
// ============================================================================

/**
 * Execute an async function with retry logic and exponential backoff
 * Specifically handles Anthropic rate limit errors (429)
 *
 * @param {Function} fn - Async function to execute
 * @param {object} options - Options
 * @param {string} options.operationName - Name for logging
 * @param {Function} options.onRetry - Callback when retrying (receives attempt, delay, error)
 * @returns {Promise<any>} Result of the function
 * @throws {Error} If all retries exhausted
 */
async function withRetry(fn, options = {}) {
  const {
    operationName = 'API call',
    onRetry = null,
    maxRetries = RATE_LIMIT_CONFIG.maxRetries
  } = options;

  let lastError = null;
  let backoffDelay = RATE_LIMIT_CONFIG.initialBackoff;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if this is a rate limit error
      const isRateLimit =
        error.status === 429 ||
        error.message?.includes('rate_limit') ||
        error.message?.includes('429');

      // If not a rate limit error or we've exhausted retries, throw
      if (!isRateLimit || attempt > maxRetries) {
        throw error;
      }

      // Calculate backoff with jitter (±10%)
      const jitter = backoffDelay * 0.1 * (Math.random() * 2 - 1);
      const delayWithJitter = Math.round(backoffDelay + jitter);

      // Log retry attempt
      if (onRetry) {
        onRetry(attempt, delayWithJitter, error);
      } else {
        console.log(
          `${COLORS.yellow}⏳ Rate limited on ${operationName}. ` +
          `Retry ${attempt}/${maxRetries} in ${(delayWithJitter / 1000).toFixed(1)}s...${COLORS.reset}`
        );
      }

      // Wait before retrying
      await sleep(delayWithJitter);

      // Increase backoff for next potential retry (exponential)
      backoffDelay = Math.min(
        backoffDelay * RATE_LIMIT_CONFIG.backoffMultiplier,
        RATE_LIMIT_CONFIG.maxBackoff
      );
    }
  }

  throw lastError;
}

// ============================================================================
// Throttled API Call
// ============================================================================

// Track last API call time for throttling
let lastApiCallTime = 0;

/**
 * Execute an API call with throttling to prevent rate limits
 * Ensures minimum delay between consecutive API calls
 *
 * @param {Function} fn - Async function to execute
 * @param {object} options - Options
 * @param {string} options.operationName - Name for logging
 * @param {number} options.minDelay - Minimum delay between calls (ms)
 * @returns {Promise<any>} Result of the function
 */
async function throttledApiCall(fn, options = {}) {
  const {
    operationName = 'API call',
    minDelay = RATE_LIMIT_CONFIG.baseDelay
  } = options;

  // Calculate time since last API call
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTime;

  // If we need to wait, do so
  if (timeSinceLastCall < minDelay && lastApiCallTime > 0) {
    const waitTime = minDelay - timeSinceLastCall;
    await sleep(waitTime);
  }

  // Execute with retry logic
  const result = await withRetry(fn, { operationName });

  // Update last call time
  lastApiCallTime = Date.now();

  return result;
}

// ============================================================================
// Progress Tracker
// ============================================================================

/**
 * Creates a progress tracker for multi-step operations
 * Provides ETA estimation based on completed steps
 */
class ProgressTracker {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.name - Name of the overall operation
   * @param {number} options.totalSteps - Total number of steps
   * @param {boolean} options.showProgress - Whether to log progress (default: true)
   */
  constructor(options = {}) {
    this.name = options.name || 'Processing';
    this.totalSteps = options.totalSteps || 0;
    this.showProgress = options.showProgress !== false;

    this.completedSteps = 0;
    this.startTime = Date.now();
    this.stepTimes = [];
    this.currentStep = null;
  }

  /**
   * Update total steps (useful when count is determined mid-process)
   * @param {number} total - New total
   */
  setTotalSteps(total) {
    this.totalSteps = total;
  }

  /**
   * Start a new step
   * @param {string} stepName - Name of the step
   */
  startStep(stepName) {
    this.currentStep = {
      name: stepName,
      startTime: Date.now()
    };

    if (this.showProgress) {
      const progress = this.getProgressBar();
      const eta = this.getETA();
      console.log(
        `${COLORS.cyan}→${COLORS.reset} ${stepName} ${COLORS.dim}${progress}${COLORS.reset}` +
        (eta ? ` ${COLORS.dim}(ETA: ${eta})${COLORS.reset}` : '')
      );
    }
  }

  /**
   * Complete the current step
   * @param {string} message - Optional completion message
   */
  completeStep(message = null) {
    if (this.currentStep) {
      const elapsed = Date.now() - this.currentStep.startTime;
      this.stepTimes.push(elapsed);
      this.completedSteps++;
    }

    if (message && this.showProgress) {
      console.log(`${COLORS.green}✓${COLORS.reset} ${message}`);
    }

    this.currentStep = null;
  }

  /**
   * Log a sub-step or detail
   * @param {string} message - Message to log
   */
  logDetail(message) {
    if (this.showProgress) {
      console.log(`${COLORS.dim}  ${message}${COLORS.reset}`);
    }
  }

  /**
   * Log a warning
   * @param {string} message - Warning message
   */
  logWarning(message) {
    if (this.showProgress) {
      console.log(`${COLORS.yellow}⚠ ${message}${COLORS.reset}`);
    }
  }

  /**
   * Get a text progress bar
   * @returns {string} Progress bar string
   */
  getProgressBar() {
    if (this.totalSteps === 0) return '';

    const percent = Math.round((this.completedSteps / this.totalSteps) * 100);
    const filled = Math.round(percent / 5);
    const empty = 20 - filled;

    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}% (${this.completedSteps}/${this.totalSteps})`;
  }

  /**
   * Get estimated time remaining
   * @returns {string|null} ETA string or null if not enough data
   */
  getETA() {
    if (this.stepTimes.length < 1 || this.completedSteps >= this.totalSteps) {
      return null;
    }

    // Calculate average time per step
    const avgTime = this.stepTimes.reduce((a, b) => a + b, 0) / this.stepTimes.length;
    const remainingSteps = this.totalSteps - this.completedSteps;
    const remainingMs = avgTime * remainingSteps;

    return formatDuration(remainingMs);
  }

  /**
   * Get total elapsed time
   * @returns {string} Elapsed time string
   */
  getElapsedTime() {
    return formatDuration(Date.now() - this.startTime);
  }

  /**
   * Get summary of the operation
   * @returns {object} Summary object
   */
  getSummary() {
    const elapsed = Date.now() - this.startTime;
    const avgStepTime = this.stepTimes.length > 0
      ? this.stepTimes.reduce((a, b) => a + b, 0) / this.stepTimes.length
      : 0;

    return {
      totalSteps: this.totalSteps,
      completedSteps: this.completedSteps,
      elapsedMs: elapsed,
      elapsedFormatted: formatDuration(elapsed),
      avgStepTimeMs: Math.round(avgStepTime),
      avgStepTimeFormatted: formatDuration(avgStepTime)
    };
  }

  /**
   * Print a final summary
   */
  printSummary() {
    const summary = this.getSummary();
    console.log(
      `\n${COLORS.bright}${this.name} Complete${COLORS.reset}\n` +
      `${COLORS.dim}─────────────────────────────────${COLORS.reset}\n` +
      `Steps completed: ${summary.completedSteps}/${summary.totalSteps}\n` +
      `Total time: ${summary.elapsedFormatted}\n` +
      `Avg per step: ${summary.avgStepTimeFormatted}`
    );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format milliseconds as human-readable duration
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Estimate total time for processing based on item count
 * @param {number} itemCount - Number of items to process
 * @param {number} msPerItem - Estimated milliseconds per item
 * @returns {string} Estimated duration
 */
function estimateTotalTime(itemCount, msPerItem = 2000) {
  // Account for delays between API calls
  const totalMs = itemCount * (msPerItem + RATE_LIMIT_CONFIG.baseDelay);
  return formatDuration(totalMs);
}

// ============================================================================
// Exports
// ============================================================================

export {
  RATE_LIMIT_CONFIG,
  sleep,
  withRetry,
  throttledApiCall,
  ProgressTracker,
  formatDuration,
  estimateTotalTime,
  COLORS
};
