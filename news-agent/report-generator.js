import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { platform } from 'os';
import { resolve } from 'path';

const REPORTS_DIR = './reports';

/**
 * Generate the HTML report from summarized content
 * @param {object} summarizedContent - Output from summarizeContent()
 * @returns {Promise<string>} Path to generated report
 */
async function generateReport(summarizedContent) {
  console.log('\nGenerating HTML report...');

  // Ensure reports directory exists
  if (!existsSync(REPORTS_DIR)) {
    await mkdir(REPORTS_DIR, { recursive: true });
  }

  // Generate filename with today's date
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const filename = `daily-report-${dateStr}.html`;
  const filepath = resolve(REPORTS_DIR, filename);

  // Generate HTML content
  const html = buildHtmlReport(summarizedContent, today);

  // Write file
  await writeFile(filepath, html, 'utf-8');
  console.log(`  Report saved: ${filepath}`);

  return filepath;
}

/**
 * Open file in default browser
 * @param {string} filepath - Path to file to open
 */
async function openInBrowser(filepath) {
  const absolutePath = resolve(filepath);

  // Determine command based on platform
  let command;
  switch (platform()) {
    case 'darwin':
      command = `open "${absolutePath}"`;
      break;
    case 'win32':
      command = `start "" "${absolutePath}"`;
      break;
    default:
      command = `xdg-open "${absolutePath}"`;
  }

  return new Promise((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        console.error('  Failed to open browser:', error.message);
        reject(error);
      } else {
        console.log('  Opened in browser');
        resolve();
      }
    });
  });
}

/**
 * Build the complete HTML report
 * @param {object} content - Summarized content
 * @param {Date} date - Report date
 * @returns {string} Complete HTML document
 */
function buildHtmlReport(content, date) {
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const styles = getStyles();
  const header = buildHeader(content, formattedDate);
  const trendingSection = buildTrendingSection(content.trends);
  const topicSections = buildTopicSections(content);
  const footer = buildFooter(content);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily News Briefing - ${formattedDate}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="container">
    ${header}
    ${trendingSection}
    ${topicSections}
    ${footer}
  </div>
</body>
</html>`;
}

/**
 * Get CSS styles for the report
 */
function getStyles() {
  return `
    :root {
      --color-bg: #fafafa;
      --color-card: #ffffff;
      --color-text: #1a1a1a;
      --color-text-secondary: #666666;
      --color-border: #e5e5e5;
      --color-accent: #2563eb;
      --color-accent-light: #eff6ff;
      --color-high: #dc2626;
      --color-high-bg: #fef2f2;
      --color-medium: #d97706;
      --color-medium-bg: #fffbeb;
      --color-low: #6b7280;
      --color-low-bg: #f9fafb;
      --color-trend: #7c3aed;
      --color-trend-bg: #f5f3ff;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --font-mono: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
      --radius: 12px;
      --radius-sm: 8px;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--font-sans);
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      font-size: 16px;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--color-border);
    }

    .header h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      letter-spacing: -0.025em;
    }

    .header .date {
      color: var(--color-text-secondary);
      font-size: 1.1rem;
    }

    .stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-top: 1.5rem;
      flex-wrap: wrap;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--color-accent);
    }

    .stat-label {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Intro */
    .intro {
      font-size: 1.1rem;
      color: var(--color-text-secondary);
      text-align: center;
      margin-bottom: 2rem;
      padding: 1.25rem;
      background: var(--color-accent-light);
      border-radius: var(--radius);
      line-height: 1.7;
    }

    /* Trending Section */
    .trending {
      background: var(--color-trend-bg);
      border-radius: var(--radius);
      padding: 1.25rem;
      margin-bottom: 2rem;
    }

    .trending h3 {
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-trend);
      margin-bottom: 0.75rem;
    }

    .trending-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .trending-tag {
      background: white;
      color: var(--color-trend);
      padding: 0.35rem 0.75rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
      box-shadow: var(--shadow-sm);
    }

    /* Topic Sections */
    .topic-section {
      margin-bottom: 2.5rem;
    }

    .topic-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid var(--color-border);
    }

    .topic-icon {
      font-size: 1.5rem;
    }

    .topic-title {
      font-size: 1.35rem;
      font-weight: 700;
    }

    .topic-count {
      margin-left: auto;
      background: var(--color-border);
      color: var(--color-text-secondary);
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .topic-summary {
      color: var(--color-text-secondary);
      font-style: italic;
      margin-bottom: 1rem;
      padding-left: 0.5rem;
      border-left: 3px solid var(--color-border);
    }

    /* Story Cards */
    .story-card {
      background: var(--color-card);
      border-radius: var(--radius);
      padding: 1.25rem;
      margin-bottom: 1rem;
      box-shadow: var(--shadow-md);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .story-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 12px -3px rgba(0,0,0,0.1);
    }

    .story-header {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .urgency-badge {
      flex-shrink: 0;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .urgency-high {
      background: var(--color-high-bg);
      color: var(--color-high);
    }

    .urgency-medium {
      background: var(--color-medium-bg);
      color: var(--color-medium);
    }

    .urgency-low {
      background: var(--color-low-bg);
      color: var(--color-low);
    }

    .story-headline {
      font-size: 1.1rem;
      font-weight: 600;
      line-height: 1.4;
      flex-grow: 1;
    }

    .story-summary {
      color: var(--color-text-secondary);
      margin-bottom: 1rem;
      line-height: 1.7;
    }

    .story-takeaway {
      background: var(--color-accent-light);
      color: var(--color-accent);
      padding: 0.75rem 1rem;
      border-radius: var(--radius-sm);
      font-size: 0.9rem;
      margin-bottom: 1rem;
      font-weight: 500;
    }

    .story-takeaway::before {
      content: "Key takeaway: ";
      font-weight: 600;
    }

    .story-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .trend-badge {
      background: var(--color-trend-bg);
      color: var(--color-trend);
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .multi-source-badge {
      background: #ecfdf5;
      color: #059669;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .read-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--color-border);
    }

    .read-link {
      margin-left: auto;
      color: var(--color-accent);
      text-decoration: none;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      transition: gap 0.2s ease;
    }

    .read-link:hover {
      gap: 0.6rem;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding-top: 2rem;
      margin-top: 2rem;
      border-top: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      font-size: 0.9rem;
    }

    .footer-brand {
      font-weight: 600;
      color: var(--color-text);
    }

    /* Responsive */
    @media (max-width: 640px) {
      .container {
        padding: 1rem;
      }

      .header h1 {
        font-size: 1.5rem;
      }

      .stats {
        gap: 1rem;
      }

      .stat-value {
        font-size: 1.5rem;
      }

      .story-card {
        padding: 1rem;
      }

      .story-meta {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .read-link {
        margin-left: 0;
        margin-top: 0.5rem;
      }
    }

    /* Print styles */
    @media print {
      body {
        background: white;
      }

      .story-card {
        box-shadow: none;
        border: 1px solid var(--color-border);
        break-inside: avoid;
      }

      .read-link {
        display: none;
      }
    }
  `;
}

/**
 * Build header section
 */
function buildHeader(content, formattedDate) {
  const { stats } = content;

  return `
    <header class="header">
      <h1>Daily News Briefing</h1>
      <p class="date">${formattedDate}</p>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${stats.totalStories}</div>
          <div class="stat-label">Stories</div>
        </div>
        <div class="stat">
          <div class="stat-value">${stats.byUrgency.high}</div>
          <div class="stat-label">High Priority</div>
        </div>
        <div class="stat">
          <div class="stat-value">${stats.totalReadTime}</div>
          <div class="stat-label">Min Read</div>
        </div>
      </div>
    </header>
  `;
}

/**
 * Build trending section
 */
function buildTrendingSection(trends) {
  if (!trends || trends.trendingEntities.length === 0) {
    return '';
  }

  const tags = trends.trendingEntities
    .slice(0, 8)
    .map(t => `<span class="trending-tag">${escapeHtml(t.entity)} (${t.count})</span>`)
    .join('');

  return `
    <section class="trending">
      <h3>Trending Today</h3>
      <div class="trending-tags">${tags}</div>
    </section>
  `;
}

/**
 * Build all topic sections
 */
function buildTopicSections(content) {
  const topicIcons = {
    Politics: '🏛️',
    Tech: '💻',
    AI: '🤖',
    Business: '💼',
    Markets: '📈',
    Culture: '🎭',
    Health: '🏥',
    World: '🌍',
    Other: '📰'
  };

  const sections = [];

  for (const [topic, stories] of Object.entries(content.byTopic || {})) {
    if (!stories || stories.length === 0) continue;

    const icon = topicIcons[topic] || '📰';

    const storyCards = stories
      .map(story => buildStoryCard(story))
      .join('');

    sections.push(`
      <section class="topic-section">
        <div class="topic-header">
          <span class="topic-icon">${icon}</span>
          <h2 class="topic-title">${topic}</h2>
          <span class="topic-count">${stories.length} ${stories.length === 1 ? 'story' : 'stories'}</span>
        </div>
        ${storyCards}
      </section>
    `);
  }

  return sections.join('');
}

/**
 * Build a single story card
 */
function buildStoryCard(story) {
  const urgencyClass = `urgency-${story.urgency?.toLowerCase() || 'low'}`;
  const urgencyLabel = story.urgency || 'Low';
  const urgencyEmoji = story.urgency === 'High' ? '🔴' : story.urgency === 'Medium' ? '🟡' : '⚪';

  const sourceText = story.sources?.length > 1
    ? `${story.sources.join(', ')}`
    : (story.sources?.[0] || 'Newsletter');

  // Multi-source badge with icon when story appears in 2+ newsletters
  const multiSourceBadge = story.sourceCount > 1
    ? `<span class="multi-source-badge">📚 ${story.sourceCount} newsletters</span>`
    : '';

  const takeaway = story.keyTakeaway
    ? `<div class="story-takeaway">${escapeHtml(story.keyTakeaway)}</div>`
    : '';

  // Build read links - show multiple links if story appears in multiple newsletters
  let readLinks = '';
  if (story.sourceLinks && story.sourceLinks.length > 1) {
    // Multiple sources - show each link with source name
    const links = story.sourceLinks
      .filter(sl => sl.link) // Only include entries with valid links
      .map(sl => `<a href="${escapeHtml(sl.link)}" class="read-link" target="_blank" rel="noopener">${escapeHtml(sl.source)} →</a>`)
      .join('');
    readLinks = links ? `<div class="read-links">${links}</div>` : '';
  } else if (story.link || story.sourceLinks?.[0]?.link) {
    // Single source - show single link
    const link = story.link || story.sourceLinks?.[0]?.link;
    readLinks = `<a href="${escapeHtml(link)}" class="read-link" target="_blank" rel="noopener">Read Full Story →</a>`;
  }

  return `
    <article class="story-card">
      <div class="story-header">
        <span class="urgency-badge ${urgencyClass}">${urgencyEmoji} ${urgencyLabel}</span>
        <h3 class="story-headline">${escapeHtml(story.headline || 'Untitled')}</h3>
      </div>
      <p class="story-summary">${escapeHtml(story.summary || '')}</p>
      ${takeaway}
      <div class="story-meta">
        <span class="meta-item">📖 ${story.readTime || 1} min read</span>
        <span class="meta-item">📧 ${escapeHtml(sourceText)}</span>
        ${multiSourceBadge}
      </div>
      ${readLinks}
    </article>
  `;
}

/**
 * Build footer section
 */
function buildFooter(content) {
  const timestamp = new Date(content.generatedAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <footer class="footer">
      <p>Generated at ${timestamp} by <span class="footer-brand">News Agent</span></p>
      <p>Powered by Claude AI</p>
    </footer>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate report and optionally open in browser
 * @param {object} summarizedContent - Output from summarizeContent()
 * @param {boolean} openBrowser - Whether to open in browser
 * @returns {Promise<string>} Path to generated report
 */
async function generateAndOpenReport(summarizedContent, openBrowser = true) {
  const filepath = await generateReport(summarizedContent);

  if (openBrowser) {
    try {
      await openInBrowser(filepath);
    } catch {
      console.log(`  Open manually: file://${filepath}`);
    }
  }

  return filepath;
}

export {
  generateReport,
  generateAndOpenReport,
  openInBrowser
};
