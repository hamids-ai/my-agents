import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { throttledApiCall, ProgressTracker, estimateTotalTime, COLORS } from './api-utils.js';

// Lazy-initialize Anthropic client (only when API key is available)
let anthropic = null;

function getAnthropicClient() {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic();
  }
  return anthropic;
}

/**
 * Check if Claude API is available
 * @returns {boolean}
 */
function isClaudeAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Topic categories (ordered for display: Politics first, then Tech, AI, Business, Markets, Culture)
const TOPICS = ['Politics', 'Tech', 'AI', 'Business', 'Markets', 'Culture', 'Health', 'World', 'Other'];

// Keywords that indicate breaking/urgent news
const URGENCY_KEYWORDS = {
  high: [
    'breaking', 'just in', 'urgent', 'alert', 'developing',
    'crisis', 'crash', 'surge', 'plunge', 'emergency',
    'war', 'attack', 'death', 'killed', 'explosion'
  ],
  medium: [
    'announces', 'launches', 'reveals', 'reports', 'confirms',
    'update', 'new', 'latest', 'today', 'exclusive'
  ]
};

// Words per minute for read time estimation
const WORDS_PER_MINUTE = 200;

// Path to history file for trend detection
const HISTORY_PATH = './data/story-history.json';

/**
 * Load user preferences from file
 * @returns {Promise<object>} User preferences
 */
async function loadPreferences() {
  try {
    const content = await readFile('./data/preferences.json', 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      priorityTopics: [],
      deprioritizeTopics: [],
      priorityKeywords: [],
      deprioritizeKeywords: []
    };
  }
}

/**
 * Load story history for trend detection
 * @returns {Promise<object>} Historical story data
 */
async function loadHistory() {
  try {
    if (existsSync(HISTORY_PATH)) {
      const content = await readFile(HISTORY_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore errors
  }
  return { stories: [], lastUpdated: null };
}

/**
 * Save story history for trend detection
 * @param {object} history - History data to save
 */
async function saveHistory(history) {
  try {
    await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Failed to save history:', error.message);
  }
}

/**
 * Parse HTML content and extract text blocks that likely contain stories
 * @param {string} html - Raw HTML content
 * @param {string} source - Newsletter source identifier
 * @returns {Array<{text: string, links: Array}>} Extracted content blocks
 */
function parseHtmlContent(html, source) {
  const $ = cheerio.load(html);

  // Remove script, style, and other non-content elements
  $('script, style, meta, link, noscript, iframe').remove();

  const blocks = [];

  // Newsletter-specific parsing strategies
  // Most newsletters use tables or divs for story sections
  const storySelectors = [
    'table tr',
    'article',
    '.story',
    '.article',
    '.news-item',
    '[class*="story"]',
    '[class*="article"]',
    'div > h2',
    'div > h3',
    'td'
  ];

  // Try to find distinct story blocks
  for (const selector of storySelectors) {
    $(selector).each((_, element) => {
      const $el = $(element);
      const text = $el.text().trim();

      // Skip if too short or too long (likely not a story)
      if (text.length < 50 || text.length > 5000) return;

      // Extract links from this block
      const links = [];
      $el.find('a[href]').each((_, link) => {
        const href = $(link).attr('href');
        const linkText = $(link).text().trim();
        if (href && !href.startsWith('mailto:') && linkText) {
          links.push({ url: href, text: linkText });
        }
      });

      // Skip blocks without links (likely not story content)
      if (links.length === 0) return;

      blocks.push({ text, links, source });
    });
  }

  return blocks;
}

// Patterns to filter out newsletter boilerplate
const BOILERPLATE_PATTERNS = [
  /smart brevity/i,
  /words?\s*\.{3}\s*\d+\s*min/i,       // "1,581 words ... 6 mins"
  /thanks to .+ for/i,                   // "Thanks to Noah for orchestrating"
  /edited by/i,
  /happy (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /good (morning|afternoon|evening)/i,
  /welcome (to|back|in)/i,
  /^(read more|click here|subscribe|share|follow|view in browser)/i,
  /sign up|unsubscribe/i,
  /\d+%?\s*(off|discount)/i,             // promotional content
  /sponsored by/i,
  /advertisement/i,
  /presented by/i,
  /^(markets|nasdaq|s&p|dow)$/i,         // standalone market labels
  /^[+-]?\d+\.?\d*%?$/,                  // standalone numbers/percentages
  /data (is )?provided by/i,
  /©\s*\d{4}/i,                          // copyright notices
  /all rights reserved/i,
  /^data:\s/i,                           // "Data: ..." chart labels
  /^chart:\s/i,                          // "Chart: ..." labels
  /^about the (business|company|author)/i, // "About the business..."
  /^impact of\s/i,                       // fragments like "Impact of selling..."
  /speaks? to the press/i,               // press event descriptions
  /after the weekly/i,                   // event timing descriptions
  /grew up (on|in)/i,                    // biographical content
  /financial modeling prep/i,            // data source names
  /apptopia/i,                           // data source names
  /axios visuals/i,                      // attribution
  /\bspoke\b.+\byesterday\b/i,          // "spoke ... yesterday" event descriptions
  /moves? into/i,                        // "moving into" action descriptions
  /was this email forwarded/i,           // "Was this email forwarded to you?"
  /you received this email/i,            // footer text
  /thanks for reading/i,                 // footer text
  /invite your friends/i,                // footer text
  /thanks? (to )?our partners/i,         // sponsor acknowledgment
  /why [a-z]+\?\s*["'"]/i,              // promotional Q&A: "Why Amazon? ..."
  /selling on amazon/i,                  // promotional amazon content
  /grew sales.+selling/i,                // promotional content
  /handle.+shipping.+logistics/i,        // promotional content
  /^businesses in small towns/i,         // promotional content
  /sponsorship has no influence/i,       // editorial disclaimer
  /make sure you subscribe/i,            // subscription CTA
  /afternoon wrap up/i,                  // newsletter cross-promo
  /axios (am|pm)/i,                      // newsletter names
  /reaching deeper.+into the gears/i,    // vague teaser text
  /^and make sure/i,                     // CTA starting with "And"
  /editorial content/i,                  // editorial disclaimers
  /^advertise with/i,                    // advertising CTA
  /returns to d\.?c\.?$/i,               // vague location updates
  // Marketing fluff and promotional headlines
  /what else we'?re snacking/i,            // Newsletter marketing language
  /learn more about .+'s .+ impact/i,      // "Learn more about Amazon's Economic impact"
  /for more .+ insights?,? subscribe/i,    // "For more data-driven insights, subscribe..."
  /subscribe to our .+ newsletter/i,       // subscription CTAs
  /our column shows/i,                     // "Our column shows what's barreling at us"
  /what'?s barreling/i,                    // vague teaser language
  /^what we'?re (reading|watching|listening)/i, // "What we're reading/watching"
  /^what (i'?m|we'?re) .+ing$/i,           // "What I'm thinking" etc.
  /check out our/i,                        // promotional CTAs
  /^(don'?t )?miss (our|this)/i,           // "Don't miss our..." CTAs
  /^here'?s what (you|we) (need|should)/i, // vague intro phrases
  /^icymi:?/i,                             // "ICYMI" roundups
  /^p\.?s\.?:?\s/i,                        // "P.S." newsletter addons
  /^bonus:?\s/i,                           // "Bonus:" promotional content
  /^quick hits:?$/i,                       // section headers without content
  /^the (bottom|top) line:?$/i,            // section headers
  /go deeper:?\s/i,                        // vague call-to-action
  /^one (big|more) thing:?$/i,             // section headers
  /^worth your time:?$/i,                  // promotional language
  /^on our radar:?$/i,                     // section headers
  /^from our partners/i,                   // sponsored content indicators
  /partner content/i,                      // sponsored content
  /^snack fact:?/i,                        // newsletter trivia sections
  /^data-driven .+ insights/i,             // promotional language
  /scoreboard newsletter/i,                // cross-promotion
  // Commentary and section headers (not actual news)
  /^stories? we'?re obsessed with/i,       // section header commentary
  /^things? we'?re (watching|following|tracking)/i,
  /^what we'?re (watching|following|tracking|keeping an eye on)/i,
  /^here'?s what caught our (eye|attention)/i,
  /^our (favorite|top) (picks|stories|reads)/i,
  /^must[- ]read(s)?:?$/i,                 // section headers
  /^editor'?s? (pick|choice|favorite)/i,
  /^staff pick/i,
  /^trending (now|today):?$/i,
  /^hot take/i,
  /^deep dive:?$/i,
  /^spotlight:?$/i,
  /^featured:?$/i,
  /^(weekly|daily) (roundup|digest|wrap)/i,
  // Quiz and interactive content (not news)
  /check your answer/i,                    // quiz content
  /test your knowledge/i,
  /can you guess/i,
  /quiz:?\s/i,
  /trivia:?\s/i,
  /^what is .+\?\s*check/i,               // "What is X? Check your answer" pattern
  /^how (many|much|well|often) .+\?\s*$/i, // standalone quiz questions
  /^which .+\?\s*$/i,                      // "Which company..." quiz patterns
  /^who (is|was|are|were) .+\?\s*$/i,     // "Who is..." quiz patterns
  /guess (the|which|who|what)/i,
  /play (along|now|the game)/i,
  /brain teaser/i,
  /^poll:?\s/i,                           // poll content
  /vote now/i,
  /cast your vote/i,
  /reader poll/i,
  // Additional newsletter marketing language
  /^what else we/i,                        // "What else we're..." variants
  /^more from (us|our team|the team)/i,
  /^around the (web|internet)/i,
  /^elsewhere:?$/i,
  /^also worth (reading|noting|watching)/i,
  /^in (other|related) news:?$/i,
  /^icymi$/i,                              // standalone "ICYMI"
  /^fyi$/i,                                // standalone "FYI"
  /^btw$/i,                                // standalone "BTW"
  /^psa:?$/i,                              // standalone "PSA"
];

// Patterns that indicate author attribution to remove
const AUTHOR_PATTERNS = [
  /,?\s*\w+['']s\s+\w+\s+writes?\b/i,   // "Axios' Emily Peck writes"
  /,?\s*writes?\s+\w+/i,                 // "writes John"
  /,?\s*by\s+[A-Z][a-z]+\s+[A-Z][a-z]+/i, // "by John Smith"
  /,?\s*according to\s+/i,
  /\s*—\s*[A-Z][a-z]+\s+[A-Z][a-z]+$/,   // "— John Smith" at end
];

/**
 * Clean and validate a potential headline
 * @param {string} text - Raw headline text
 * @returns {string|null} Cleaned headline or null if invalid
 */
function cleanHeadline(text) {
  if (!text) return null;

  let headline = text.trim();

  // Remove excessive whitespace
  headline = headline.replace(/\s+/g, ' ');

  // Skip if it matches boilerplate patterns
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(headline)) return null;
  }

  // Remove author attributions
  for (const pattern of AUTHOR_PATTERNS) {
    headline = headline.replace(pattern, '');
  }

  // Truncate at sentence boundary if too long (aim for ~80 chars max)
  if (headline.length > 100) {
    // Try to cut at a natural break point
    const cutPoints = ['. ', ' — ', ' - ', ': ', '? ', '! '];
    for (const cut of cutPoints) {
      const idx = headline.indexOf(cut);
      if (idx > 20 && idx < 100) {
        headline = headline.substring(0, idx + (cut === '. ' ? 1 : 0)).trim();
        break;
      }
    }
    // If still too long, just truncate
    if (headline.length > 100) {
      headline = headline.substring(0, 97) + '...';
    }
  }

  // Clean up trailing punctuation artifacts
  headline = headline.replace(/[,;:\s]+$/, '').trim();

  // Skip if too short after cleaning
  if (headline.length < 15) return null;

  // Skip if mostly numbers or symbols
  const alphaCount = (headline.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount < headline.length * 0.5) return null;

  // Skip if ends with "..." (truncated/incomplete)
  if (headline.endsWith('...')) return null;

  // Skip if it looks like a descriptive sentence about a person doing something
  // e.g., "John Smith walks into the room yesterday"
  if (/^[A-Z][a-z]+\s+[A-Z][a-z]+\s+(speaks?|walks?|moves?|says?|after|before)\b/i.test(headline)) {
    return null;
  }

  // Skip quiz-style questions that ask readers to guess/check answers
  // e.g., "What is America's fastest-growing grocery chain?"
  if (/^(what|which|who|how many|how much|can you|do you know)\s+.+\?$/i.test(headline)) {
    // Allow legitimate news questions like "What does the Fed's decision mean?"
    // But filter out quiz-style questions about facts/trivia
    const quizIndicators = [
      /fastest[- ]growing/i,
      /most popular/i,
      /biggest|largest|smallest/i,
      /best[- ]selling/i,
      /number one|#1|\bno\.\s?1\b/i,
      /top[- ]\d+/i,
      /\bfirst\b.+(to|in|ever)/i,
      /\bonly\b.+(company|country|state|city)/i,
    ];
    if (quizIndicators.some(pattern => pattern.test(headline))) {
      return null;
    }
  }

  // Skip content that appears to be commentary rather than news
  // e.g., descriptions of interactive content without actual news substance
  if (/appears to be|this is a|this seems|presented as|format suggests|insufficient content/i.test(headline)) {
    return null;
  }

  return headline;
}

/**
 * Extract stories from content blocks using simple HTML parsing (no AI)
 * This is a fallback when Claude API is not available
 * @param {Array} blocks - Content blocks from HTML parsing
 * @param {string} newsletterSource - Source newsletter name
 * @returns {Array} Extracted stories
 */
function extractStoriesSimple(blocks, newsletterSource) {
  const stories = [];

  for (const block of blocks) {
    // Try to extract a headline from the text
    const lines = block.text.split(/\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) continue;

    // Try first few lines to find a good headline
    let headline = null;
    let headlineLineIdx = 0;

    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const cleaned = cleanHeadline(lines[i]);
      if (cleaned) {
        headline = cleaned;
        headlineLineIdx = i;
        break;
      }
    }

    if (!headline) continue;

    // Rest of content is the summary (skip the headline line)
    const summaryLines = lines.slice(headlineLineIdx + 1);
    let summaryText = summaryLines.join(' ').trim();

    // Clean up summary too
    summaryText = summaryText.replace(/\s+/g, ' ');
    const summary = summaryText.substring(0, 300) + (summaryText.length > 300 ? '...' : '');

    // Get the first link as source
    const sourceLink = block.links[0]?.url || null;

    stories.push({
      headline,
      summary: summary || headline,
      sourceLink,
      rawText: block.text.substring(0, 500),
      newsletterSource
    });
  }

  // Deduplicate by headline similarity
  const unique = [];
  const seenHeadlines = new Set();

  for (const story of stories) {
    const normalizedHeadline = story.headline.toLowerCase().substring(0, 50);
    if (!seenHeadlines.has(normalizedHeadline)) {
      seenHeadlines.add(normalizedHeadline);
      unique.push(story);
    }
  }

  return unique.slice(0, 10); // Limit to 10 stories per newsletter
}

/**
 * Use Claude to extract structured stories from content blocks
 * @param {Array} blocks - Content blocks from HTML parsing
 * @param {string} newsletterSource - Source newsletter name
 * @returns {Promise<Array>} Extracted stories
 */
async function extractStoriesWithClaude(blocks, newsletterSource) {
  if (blocks.length === 0) return [];

  const client = getAnthropicClient();
  if (!client) {
    // Fallback to simple extraction if no API key
    return extractStoriesSimple(blocks, newsletterSource);
  }

  // Combine blocks into a single text for processing
  const combinedContent = blocks
    .map((b, i) => `[BLOCK ${i}]\n${b.text}\nLinks: ${b.links.map(l => l.url).join(', ')}`)
    .join('\n\n---\n\n');

  const prompt = `Analyze this newsletter content and extract individual news stories/articles.

Newsletter source: ${newsletterSource}

Content:
${combinedContent}

For each distinct news story, extract:
1. headline: The main headline or title
2. summary: A 1-2 sentence summary of the story
3. sourceLink: The most relevant URL for the full story (from the Links provided)
4. rawText: The original text snippet

IMPORTANT: Only include ACTUAL NEWS STORIES about current events. Skip ALL of the following:
- Ads, promotions, sponsorships, or navigation elements
- Section headers or commentary (e.g., "Stories we're obsessed with", "What else we're snacking on")
- Quiz questions or trivia (e.g., "What is America's fastest-growing grocery chain? Check your answer")
- Interactive content asking readers to guess, vote, or test their knowledge
- Marketing language or calls-to-action
- Newsletter meta-content about the newsletter itself
- Reader engagement prompts or polls

Each item must describe a specific, verifiable news event or development.
If no clear news stories can be extracted, return an empty array.

Response format (JSON only, no markdown):
[{"headline": "...", "summary": "...", "sourceLink": "...", "rawText": "..."}]`;

  try {
    const response = await throttledApiCall(
      () => client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      }),
      { operationName: `extract stories from ${newsletterSource}` }
    );

    const text = response.content[0].text;
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const stories = JSON.parse(jsonMatch[0]);
      return stories.map(s => ({ ...s, newsletterSource }));
    }
  } catch (error) {
    console.error(`${COLORS.red}✗${COLORS.reset} Failed to extract stories from ${newsletterSource}: ${error.message}`);
    // Fallback to simple extraction on error
    return extractStoriesSimple(blocks, newsletterSource);
  }

  return extractStoriesSimple(blocks, newsletterSource);
}

/**
 * Categorize stories using keyword matching (no AI)
 * @param {Array} stories - Stories to categorize
 * @returns {Array} Stories with categories
 */
function categorizeStoriesSimple(stories) {
  const topicKeywords = {
    Politics: ['politic', 'election', 'senate', 'congress', 'president', 'government', 'democrat', 'republican', 'legislation', 'vote', 'bill', 'white house', 'capitol', 'lawmaker'],
    Tech: ['tech', 'software', 'app', 'startup', 'google', 'apple', 'microsoft', 'meta', 'amazon', 'computer', 'digital', 'cyber', 'silicon valley'],
    AI: ['ai', 'artificial intelligence', 'machine learning', 'chatgpt', 'openai', 'anthropic', 'claude', 'gpt', 'llm', 'neural network', 'deep learning', 'generative ai', 'robot'],
    Business: ['business', 'company', 'ceo', 'corporate', 'merger', 'acquisition', 'revenue', 'profit', 'enterprise', 'industry'],
    Markets: ['market', 'stock', 'invest', 'trading', 'wall street', 'nasdaq', 'dow', 's&p', 'bitcoin', 'crypto', 'fed', 'interest rate', 'inflation', 'economy', 'gdp'],
    Culture: ['movie', 'film', 'music', 'art', 'entertainment', 'celebrity', 'sport', 'game', 'book', 'tv', 'streaming'],
    Health: ['health', 'medical', 'drug', 'fda', 'hospital', 'disease', 'vaccine', 'treatment', 'doctor', 'patient'],
    World: ['china', 'europe', 'asia', 'russia', 'ukraine', 'global', 'international', 'foreign', 'war', 'climate', 'un']
  };

  return stories.map(story => {
    const text = `${story.headline} ${story.summary}`.toLowerCase();

    // Find best matching topic
    let bestTopic = 'Other';
    let bestScore = 0;

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const score = keywords.filter(kw => text.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        bestTopic = topic;
      }
    }

    // Check for breaking news indicators
    const isBreaking = /breaking|just in|developing|alert|urgent/i.test(text);

    // Extract entities (simple: capitalized words)
    const entityMatches = `${story.headline} ${story.summary}`.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g) || [];
    const keyEntities = [...new Set(entityMatches)].slice(0, 5);

    // Simple sentiment
    const positiveWords = ['grow', 'surge', 'gain', 'profit', 'success', 'win', 'record', 'best'];
    const negativeWords = ['fall', 'drop', 'crash', 'loss', 'fail', 'worst', 'crisis', 'plunge'];
    const posScore = positiveWords.filter(w => text.includes(w)).length;
    const negScore = negativeWords.filter(w => text.includes(w)).length;
    const sentiment = posScore > negScore ? 'positive' : negScore > posScore ? 'negative' : 'neutral';

    return {
      ...story,
      topic: bestTopic,
      isBreaking,
      keyEntities,
      sentiment
    };
  });
}

/**
 * Use Claude to categorize and analyze stories
 * @param {Array} stories - Extracted stories
 * @returns {Promise<Array>} Stories with categories and analysis
 */
async function categorizeStories(stories) {
  if (stories.length === 0) return [];

  const client = getAnthropicClient();
  if (!client) {
    return categorizeStoriesSimple(stories);
  }

  const storySummaries = stories
    .map((s, i) => `[${i}] ${s.headline}: ${s.summary}`)
    .join('\n');

  const prompt = `Categorize each news story into exactly one topic category and provide analysis.

Stories:
${storySummaries}

Categories: ${TOPICS.join(', ')}

For each story, determine:
1. topic: One of the categories above
2. isBreaking: true if this seems like breaking/developing news
3. keyEntities: Array of key people, companies, or places mentioned
4. sentiment: "positive", "negative", or "neutral"

Return a JSON array with one object per story (same order as input).

Response format (JSON only, no markdown):
[{"index": 0, "topic": "Tech", "isBreaking": false, "keyEntities": ["Apple", "Tim Cook"], "sentiment": "positive"}]`;

  try {
    const response = await throttledApiCall(
      () => client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      }),
      { operationName: 'categorize stories' }
    );

    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const categories = JSON.parse(jsonMatch[0]);

      // Merge categories back into stories
      return stories.map((story, i) => {
        const cat = categories.find(c => c.index === i) || {};
        return {
          ...story,
          topic: cat.topic || 'Other',
          isBreaking: cat.isBreaking || false,
          keyEntities: cat.keyEntities || [],
          sentiment: cat.sentiment || 'neutral'
        };
      });
    }
  } catch (error) {
    console.error('Failed to categorize stories:', error.message);
  }

  // Fallback: return stories with simple categorization
  return categorizeStoriesSimple(stories).map(s => ({
    ...s,
    topic: s.topic || 'Other',
    isBreaking: false,
    keyEntities: [],
    sentiment: 'neutral'
  }));
}

/**
 * Find duplicate stories using simple word overlap (no AI)
 * @param {Array} stories - All stories
 * @returns {Array} Stories with duplicate groups marked
 */
function findDuplicatesSimple(stories) {
  if (stories.length < 2) return stories.map(s => ({ ...s, duplicateGroup: null }));

  const groups = {};
  let groupId = 1;

  // Compare each story to others by significant word overlap
  for (let i = 0; i < stories.length; i++) {
    if (groups[i] !== undefined) continue;

    const wordsA = new Set(
      stories[i].headline.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4) // Only significant words
    );

    for (let j = i + 1; j < stories.length; j++) {
      if (groups[j] !== undefined) continue;

      const wordsB = new Set(
        stories[j].headline.toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 4)
      );

      // Count overlap
      const overlap = [...wordsA].filter(w => wordsB.has(w)).length;

      // If more than 2 significant words match, consider duplicate
      if (overlap >= 2) {
        if (groups[i] === undefined) {
          groups[i] = groupId;
        }
        groups[j] = groups[i];
      }
    }

    // If we assigned a group to i, increment for next potential group
    if (groups[i] !== undefined) {
      groupId++;
    }
  }

  return stories.map((story, i) => ({
    ...story,
    duplicateGroup: groups[i] || null
  }));
}

/**
 * Find duplicate stories across newsletters using Claude
 * @param {Array} stories - All stories
 * @returns {Promise<Array>} Stories with duplicate groups marked
 */
async function findDuplicates(stories) {
  if (stories.length < 2) return stories.map(s => ({ ...s, duplicateGroup: null }));

  const client = getAnthropicClient();
  if (!client) {
    return findDuplicatesSimple(stories);
  }

  const headlines = stories
    .map((s, i) => `[${i}] ${s.headline}`)
    .join('\n');

  const prompt = `Identify groups of news stories that cover the same event or topic.

Headlines:
${headlines}

Find stories that are about the SAME specific event (not just same general topic).
Group them by assigning the same group ID (starting from 1).
Stories that are unique should have group: null.

Response format (JSON only, no markdown):
[{"index": 0, "group": 1}, {"index": 1, "group": 1}, {"index": 2, "group": null}]`;

  try {
    const response = await throttledApiCall(
      () => client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      }),
      { operationName: 'find duplicates' }
    );

    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const groups = JSON.parse(jsonMatch[0]);

      return stories.map((story, i) => {
        const groupInfo = groups.find(g => g.index === i);
        return {
          ...story,
          duplicateGroup: groupInfo?.group || null
        };
      });
    }
  } catch (error) {
    console.error(`${COLORS.red}✗${COLORS.reset} Failed to find duplicates: ${error.message}`);
  }

  return findDuplicatesSimple(stories);
}

/**
 * Calculate urgency score for a story
 * @param {object} story - Story object
 * @param {object} preferences - User preferences
 * @param {number} duplicateCount - Number of newsletters covering this story
 * @returns {string} Urgency level: High, Medium, or Low
 */
function calculateUrgency(story, preferences, duplicateCount) {
  let score = 0;
  const text = `${story.headline} ${story.summary}`.toLowerCase();

  // Check for urgency keywords
  for (const keyword of URGENCY_KEYWORDS.high) {
    if (text.includes(keyword)) {
      score += 3;
      break;
    }
  }
  for (const keyword of URGENCY_KEYWORDS.medium) {
    if (text.includes(keyword)) {
      score += 1;
      break;
    }
  }

  // Breaking news flag from categorization
  if (story.isBreaking) {
    score += 3;
  }

  // Multiple newsletters covering = more important
  if (duplicateCount >= 3) {
    score += 3;
  } else if (duplicateCount >= 2) {
    score += 2;
  }

  // Apply user preferences
  if (preferences.priorityTopics?.includes(story.topic)) {
    score += 2;
  }
  if (preferences.deprioritizeTopics?.includes(story.topic)) {
    score -= 2;
  }

  // Check priority keywords
  for (const keyword of preferences.priorityKeywords || []) {
    if (text.includes(keyword.toLowerCase())) {
      score += 2;
      break;
    }
  }
  for (const keyword of preferences.deprioritizeKeywords || []) {
    if (text.includes(keyword.toLowerCase())) {
      score -= 2;
      break;
    }
  }

  // Convert score to level
  if (score >= 5) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}

/**
 * Estimate read time based on word count
 * @param {string} text - Text content
 * @returns {number} Estimated read time in minutes
 */
function estimateReadTime(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * Detect trends by comparing with historical data
 * @param {Array} stories - Current stories
 * @param {object} history - Historical story data
 * @returns {Array} Stories with trend information
 */
function detectTrends(stories, history) {
  const today = new Date().toISOString().split('T')[0];
  const recentDays = 3;

  // Get stories from recent days
  const recentStories = history.stories.filter(h => {
    const daysDiff = (new Date(today) - new Date(h.date)) / (1000 * 60 * 60 * 24);
    return daysDiff <= recentDays && daysDiff > 0;
  });

  return stories.map(story => {
    // Check if similar headline appeared in recent history
    const headline = story.headline.toLowerCase();
    const entities = story.keyEntities.map(e => e.toLowerCase());

    let trendInfo = {
      isRepeating: false,
      previousAppearances: 0,
      trendingEntities: []
    };

    for (const historical of recentStories) {
      const histHeadline = historical.headline.toLowerCase();

      // Simple similarity check - shared significant words
      const headlineWords = headline.split(/\s+/).filter(w => w.length > 4);
      const histWords = histHeadline.split(/\s+/).filter(w => w.length > 4);
      const sharedWords = headlineWords.filter(w => histWords.includes(w));

      if (sharedWords.length >= 2) {
        trendInfo.isRepeating = true;
        trendInfo.previousAppearances++;
      }

      // Check for trending entities
      for (const entity of entities) {
        if (historical.entities?.some(e => e.toLowerCase().includes(entity))) {
          if (!trendInfo.trendingEntities.includes(entity)) {
            trendInfo.trendingEntities.push(entity);
          }
        }
      }
    }

    return { ...story, trend: trendInfo };
  });
}

/**
 * Deduplicate stories, keeping the best version from each group
 * @param {Array} stories - Stories with duplicate groups
 * @returns {Array} Deduplicated stories with source count
 */
function deduplicateStories(stories) {
  const groups = {};
  const unique = [];

  for (const story of stories) {
    if (story.duplicateGroup === null) {
      unique.push({
        ...story,
        sourceCount: 1,
        allSources: [story.newsletterSource],
        allSourceLinks: [{ source: story.newsletterSource, link: story.sourceLink }]
      });
    } else {
      if (!groups[story.duplicateGroup]) {
        groups[story.duplicateGroup] = [];
      }
      groups[story.duplicateGroup].push(story);
    }
  }

  // For each duplicate group, pick the best story (longest summary)
  for (const [groupId, groupStories] of Object.entries(groups)) {
    const sorted = groupStories.sort((a, b) =>
      (b.summary?.length || 0) - (a.summary?.length || 0)
    );

    const best = sorted[0];
    unique.push({
      ...best,
      sourceCount: groupStories.length,
      allSources: groupStories.map(s => s.newsletterSource),
      allSourceLinks: groupStories.map(s => ({ source: s.newsletterSource, link: s.sourceLink }))
    });
  }

  return unique;
}

/**
 * Main content processing function
 * @param {Array<{sender: string, subject: string, content: string, receivedTime: string}>} emails
 * @returns {Promise<object>} Processed and structured content
 */
async function processNewsletterContent(emails, progressCallback = null) {
  // Calculate estimated time: ~2s per newsletter for extraction + 2s for categorization + 2s for deduplication
  const estimatedApiCalls = emails.length + 2; // extraction per newsletter + categorize + dedupe
  const estimatedTime = estimateTotalTime(estimatedApiCalls, 2000);

  console.log(`\n${COLORS.bright}Processing ${emails.length} newsletter(s)...${COLORS.reset}`);
  console.log(`${COLORS.dim}Estimated time: ${estimatedTime}${COLORS.reset}\n`);

  // Create progress tracker for content processing
  const progress = new ProgressTracker({
    name: 'Content Processing',
    totalSteps: emails.length + 3, // newsletters + categorize + dedupe + finalize
    showProgress: true
  });

  // Load preferences and history
  const preferences = await loadPreferences();
  const history = await loadHistory();
  progress.logDetail('Loaded user preferences');

  // Step 1: Parse HTML and extract content blocks from all emails
  let allStories = [];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const source = extractSourceName(email.sender);

    progress.startStep(`Extracting stories from ${source} (${i + 1}/${emails.length})`);

    const blocks = parseHtmlContent(email.content, source);
    progress.logDetail(`Found ${blocks.length} content blocks`);

    // Extract stories using Claude
    const stories = await extractStoriesWithClaude(blocks, source);
    progress.completeStep(`Extracted ${stories.length} stories from ${source}`);

    allStories.push(...stories);

    // Report progress if callback provided
    if (progressCallback) {
      progressCallback({
        phase: 'extraction',
        current: i + 1,
        total: emails.length,
        source,
        storiesExtracted: stories.length
      });
    }
  }

  console.log(`\n${COLORS.green}✓${COLORS.reset} Total stories extracted: ${COLORS.bright}${allStories.length}${COLORS.reset}`);

  if (allStories.length === 0) {
    return {
      processed: new Date().toISOString(),
      totalStories: 0,
      categories: {},
      stories: [],
      trends: { repeatingStories: 0, trendingEntities: [] }
    };
  }

  // Step 2: Categorize stories
  progress.startStep(`Categorizing ${allStories.length} stories`);
  allStories = await categorizeStories(allStories);
  progress.completeStep('Stories categorized');

  // Step 3: Find duplicates
  progress.startStep('Finding duplicate stories across newsletters');
  allStories = await findDuplicates(allStories);
  progress.completeStep('Duplicate detection complete');

  // Step 4: Detect trends from history
  progress.logDetail('Detecting trends from history...');
  allStories = detectTrends(allStories, history);

  // Step 5: Deduplicate
  progress.logDetail('Merging duplicate stories...');
  const dedupedStories = deduplicateStories(allStories);

  // Step 6: Calculate urgency and read time
  progress.startStep('Calculating urgency scores and finalizing');
  progress.logDetail('Scoring stories by urgency...');
  const finalStories = dedupedStories.map(story => {
    const urgency = calculateUrgency(story, preferences, story.sourceCount);
    const readTime = estimateReadTime(`${story.headline} ${story.summary} ${story.rawText || ''}`);

    return {
      headline: story.headline,
      summary: story.summary,
      sourceLink: story.sourceLink,
      topic: story.topic,
      urgency,
      readTimeMinutes: readTime,
      sentiment: story.sentiment,
      keyEntities: story.keyEntities,
      sourceCount: story.sourceCount,
      sources: story.allSources,
      sourceLinks: story.allSourceLinks,
      trend: story.trend,
      isBreaking: story.isBreaking
    };
  });

  // Sort by urgency (High first) then by source count
  const urgencyOrder = { High: 0, Medium: 1, Low: 2 };
  finalStories.sort((a, b) => {
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.sourceCount - a.sourceCount;
  });

  // Step 7: Organize by category
  const categorized = {};
  for (const topic of TOPICS) {
    categorized[topic] = finalStories.filter(s => s.topic === topic);
  }

  // Step 8: Calculate trend summary
  const trendingEntities = [];
  const entityCounts = {};

  for (const story of finalStories) {
    for (const entity of story.trend?.trendingEntities || []) {
      entityCounts[entity] = (entityCounts[entity] || 0) + 1;
    }
  }

  for (const [entity, count] of Object.entries(entityCounts)) {
    if (count >= 2) {
      trendingEntities.push({ entity, count });
    }
  }
  trendingEntities.sort((a, b) => b.count - a.count);

  const repeatingCount = finalStories.filter(s => s.trend?.isRepeating).length;

  // Step 9: Update history for future trend detection
  const newHistoryEntries = finalStories.map(s => ({
    headline: s.headline,
    entities: s.keyEntities,
    date: new Date().toISOString().split('T')[0]
  }));

  // Keep only last 7 days of history
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  const updatedHistory = {
    stories: [
      ...newHistoryEntries,
      ...history.stories.filter(h => new Date(h.date) > cutoffDate)
    ],
    lastUpdated: new Date().toISOString()
  };

  await saveHistory(updatedHistory);

  // Build final result
  const result = {
    processed: new Date().toISOString(),
    totalStories: finalStories.length,
    duplicatesRemoved: allStories.length - dedupedStories.length,
    categories: categorized,
    stories: finalStories,
    trends: {
      repeatingStories: repeatingCount,
      trendingEntities
    },
    summary: {
      byUrgency: {
        high: finalStories.filter(s => s.urgency === 'High').length,
        medium: finalStories.filter(s => s.urgency === 'Medium').length,
        low: finalStories.filter(s => s.urgency === 'Low').length
      },
      byTopic: Object.fromEntries(
        TOPICS.map(t => [t, categorized[t].length])
      ),
      totalReadTime: finalStories.reduce((sum, s) => sum + s.readTimeMinutes, 0)
    }
  };

  progress.completeStep('Content processing complete');

  // Print summary
  const summary = progress.getSummary();
  console.log(`\n${COLORS.bright}Content Processing Summary${COLORS.reset}`);
  console.log(`${COLORS.dim}─────────────────────────────────${COLORS.reset}`);
  console.log(`${COLORS.green}✓${COLORS.reset} Stories: ${COLORS.bright}${result.totalStories}${COLORS.reset} (${result.duplicatesRemoved} duplicates removed)`);
  console.log(`${COLORS.green}✓${COLORS.reset} High urgency: ${result.summary.byUrgency.high}`);
  console.log(`${COLORS.green}✓${COLORS.reset} Trending entities: ${trendingEntities.length}`);
  console.log(`${COLORS.dim}Completed in ${summary.elapsedFormatted}${COLORS.reset}`);

  return result;
}

/**
 * Extract newsletter source name from sender email
 * @param {string} sender - Full sender string
 * @returns {string} Clean source name
 */
function extractSourceName(sender) {
  // Try to extract name from "Name <email>" format
  const nameMatch = sender.match(/^([^<]+)</);
  if (nameMatch) {
    return nameMatch[1].trim();
  }

  // Try to extract domain from email
  const emailMatch = sender.match(/@([^>]+)/);
  if (emailMatch) {
    return emailMatch[1].split('.')[0];
  }

  return sender;
}

export {
  processNewsletterContent,
  loadPreferences,
  TOPICS
};
