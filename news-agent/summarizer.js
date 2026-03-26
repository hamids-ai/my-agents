import Anthropic from '@anthropic-ai/sdk';
import { loadPreferences } from './content-processor.js';
import { throttledApiCall, ProgressTracker, estimateTotalTime, COLORS } from './api-utils.js';

// Lazy-initialize Anthropic client
let anthropic = null;

function getAnthropicClient() {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic();
  }
  return anthropic;
}

// Batch size for summarization (to avoid token limits)
const BATCH_SIZE = 10;

/**
 * Preference-based configuration for summary generation
 */
const TONE_CONFIGS = {
  professional: {
    style: 'formal and objective',
    vocabulary: 'business terminology',
    approach: 'factual and analytical'
  },
  casual: {
    style: 'conversational and approachable',
    vocabulary: 'everyday language',
    approach: 'engaging and relatable'
  },
  technical: {
    style: 'precise and detailed',
    vocabulary: 'technical terminology where appropriate',
    approach: 'thorough and data-focused'
  }
};

const DEPTH_CONFIGS = {
  brief: {
    sentences: '1-2',
    focus: 'key headline and main point only'
  },
  standard: {
    sentences: '2-3',
    focus: 'main point and one supporting detail'
  },
  detailed: {
    sentences: '3-4',
    focus: 'main point, context, and implications'
  }
};

/**
 * Generate summaries for a batch of stories using Claude
 * @param {Array} stories - Stories to summarize
 * @param {object} preferences - User preferences
 * @returns {Promise<Array>} Stories with generated summaries
 */
async function summarizeBatch(stories, preferences) {
  const tone = TONE_CONFIGS[preferences.tone] || TONE_CONFIGS.professional;
  const depth = DEPTH_CONFIGS[preferences.depth] || DEPTH_CONFIGS.standard;

  // Build context about each story
  const storiesContext = stories.map((story, i) => {
    const sources = story.sources?.join(', ') || story.newsletterSource || 'Unknown';
    const sourceCount = story.sourceCount || 1;
    const coverage = sourceCount > 1 ? `(Covered by ${sourceCount} newsletters: ${sources})` : `(Source: ${sources})`;

    return `[STORY ${i}]
Headline: ${story.headline}
Original Summary: ${story.summary || 'N/A'}
Topic: ${story.topic}
Urgency: ${story.urgency}
Key Entities: ${story.keyEntities?.join(', ') || 'N/A'}
Sentiment: ${story.sentiment || 'neutral'}
${coverage}
Source Link: ${story.sourceLink || 'N/A'}`;
  }).join('\n\n');

  // Build preference context
  const priorityContext = preferences.priorityTopics?.length > 0
    ? `Give slightly more attention to stories about: ${preferences.priorityTopics.join(', ')}.`
    : '';

  const keywordContext = preferences.priorityKeywords?.length > 0
    ? `Topics of special interest: ${preferences.priorityKeywords.join(', ')}.`
    : '';

  const prompt = `You are a news summarizer. Generate concise, unified summaries for each story.

Style Guidelines:
- Tone: ${tone.style}
- Vocabulary: ${tone.vocabulary}
- Approach: ${tone.approach}
- Length: ${depth.sentences} sentences per summary
- Focus: ${depth.focus}

${priorityContext}
${keywordContext}

Requirements:
1. Each summary should be ${depth.sentences} sentences
2. For stories covered by multiple newsletters, mention this adds credibility/importance
3. Preserve the core facts and any notable data points
4. Match the urgency level in your language (urgent stories should feel pressing)
5. Keep summaries self-contained (reader shouldn't need the original)

Stories to summarize:
${storiesContext}

Return a JSON array with one object per story (same order as input).
Each object should have:
- index: The story index number
- summary: Your generated summary (${depth.sentences} sentences)
- keyTakeaway: One sentence capturing the most important point

Response format (JSON only, no markdown):
[{"index": 0, "summary": "...", "keyTakeaway": "..."}]`;

  try {
    const response = await throttledApiCall(
      () => getAnthropicClient().messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      }),
      { operationName: 'generate summaries batch' }
    );

    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const summaries = JSON.parse(jsonMatch[0]);

      // Merge summaries back into stories
      return stories.map((story, i) => {
        const summaryData = summaries.find(s => s.index === i) || {};
        return {
          ...story,
          generatedSummary: summaryData.summary || story.summary,
          keyTakeaway: summaryData.keyTakeaway || null
        };
      });
    }
  } catch (error) {
    console.error(`${COLORS.red}✗${COLORS.reset} Failed to generate summaries: ${error.message}`);
  }

  // Fallback: return stories with original summaries
  return stories.map(story => ({
    ...story,
    generatedSummary: story.summary,
    keyTakeaway: null
  }));
}

/**
 * Generate a daily briefing intro using Claude
 * @param {object} processedContent - Full processed content object
 * @param {object} preferences - User preferences
 * @returns {Promise<string>} Briefing introduction
 */
async function generateBriefingIntro(processedContent, preferences) {
  const tone = TONE_CONFIGS[preferences.tone] || TONE_CONFIGS.professional;

  const topStories = processedContent.stories
    .filter(s => s.urgency === 'High')
    .slice(0, 3)
    .map(s => s.headline)
    .join('; ');

  const prompt = `Write a brief 2-3 sentence introduction for a daily news briefing.

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Total stories: ${processedContent.totalStories}
High urgency stories: ${processedContent.summary.byUrgency.high}
Top topics: ${Object.entries(processedContent.summary.byTopic).filter(([_, c]) => c > 0).map(([t, c]) => `${t} (${c})`).join(', ')}
Top headlines: ${topStories || 'Various news items'}
Trending entities: ${processedContent.trends.trendingEntities.slice(0, 3).map(e => e.entity).join(', ') || 'None'}

Tone: ${tone.style}
Style: ${tone.approach}

Write a welcoming, informative intro that previews what's in today's briefing. Don't use generic phrases like "stay informed" - be specific about what's notable today.`;

  try {
    const response = await throttledApiCall(
      () => getAnthropicClient().messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }]
      }),
      { operationName: 'generate briefing intro' }
    );

    return response.content[0].text.trim();
  } catch (error) {
    console.error(`${COLORS.red}✗${COLORS.reset} Failed to generate intro: ${error.message}`);
    return `Your daily news briefing for ${new Date().toLocaleDateString()}. ${processedContent.totalStories} stories across ${Object.keys(processedContent.summary.byTopic).filter(t => processedContent.summary.byTopic[t] > 0).length} topics.`;
  }
}

/**
 * Generate topic section summaries
 * @param {object} categories - Stories grouped by category
 * @param {object} preferences - User preferences
 * @returns {Promise<object>} Topic summaries
 */
async function generateTopicSummaries(categories, preferences) {
  const topicSummaries = {};

  for (const [topic, stories] of Object.entries(categories)) {
    if (stories.length === 0) continue;

    const headlines = stories.map(s => s.headline).join('; ');

    const prompt = `Write a single sentence overview of today's ${topic} news.

Headlines: ${headlines}
Number of stories: ${stories.length}

Keep it to ONE sentence that captures the theme or most important development in ${topic} today.`;

    try {
      const response = await throttledApiCall(
        () => getAnthropicClient().messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }]
        }),
        { operationName: `generate ${topic} summary` }
      );

      topicSummaries[topic] = response.content[0].text.trim();
    } catch (error) {
      topicSummaries[topic] = `${stories.length} ${topic.toLowerCase()} stories today.`;
    }
  }

  return topicSummaries;
}

/**
 * Main summarization function
 * @param {object} processedContent - Output from processNewsletterContent()
 * @returns {Promise<object>} Summarized content ready for report generation
 */
async function summarizeContent(processedContent) {
  const stories = processedContent.stories;

  // Calculate estimated time
  const numBatches = Math.ceil(stories.length / BATCH_SIZE);
  const numTopics = Object.values(processedContent.categories).filter(s => s.length > 0).length;
  const totalApiCalls = numBatches + 1 + numTopics; // batches + intro + topic summaries
  const estimatedTime = estimateTotalTime(totalApiCalls, 2500);

  console.log(`\n${COLORS.bright}Generating AI Summaries${COLORS.reset}`);
  console.log(`${COLORS.dim}Estimated time: ${estimatedTime}${COLORS.reset}\n`);

  // Load user preferences
  const preferences = await loadPreferences();

  // Set defaults if not specified
  const effectivePrefs = {
    tone: preferences.tone || 'professional',
    depth: preferences.depth || 'standard',
    ...preferences
  };

  console.log(`${COLORS.dim}Settings: Tone=${effectivePrefs.tone}, Depth=${effectivePrefs.depth}${COLORS.reset}`);

  if (stories.length === 0) {
    return {
      briefingIntro: 'No newsletter stories found for today.',
      stories: [],
      topicSummaries: {},
      generatedAt: new Date().toISOString(),
      preferences: effectivePrefs
    };
  }

  // Create progress tracker
  const progress = new ProgressTracker({
    name: 'AI Summarization',
    totalSteps: totalApiCalls,
    showProgress: true
  });

  // Process stories in batches
  const summarizedStories = [];

  for (let i = 0; i < stories.length; i += BATCH_SIZE) {
    const batch = stories.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stories.length / BATCH_SIZE);

    progress.startStep(`Summarizing stories batch ${batchNum}/${totalBatches} (${batch.length} stories)`);

    const summarizedBatch = await summarizeBatch(batch, effectivePrefs);
    summarizedStories.push(...summarizedBatch);

    progress.completeStep(`Batch ${batchNum} complete`);
  }

  // Generate briefing intro
  progress.startStep('Generating briefing introduction');
  const briefingIntro = await generateBriefingIntro(processedContent, effectivePrefs);
  progress.completeStep('Briefing intro generated');

  // Generate topic summaries
  progress.startStep('Generating topic summaries');
  const topicSummaries = await generateTopicSummaries(processedContent.categories, effectivePrefs);
  progress.completeStep('Topic summaries generated');

  // Build final summarized content
  const summarizedContent = {
    briefingIntro,
    generatedAt: new Date().toISOString(),
    preferences: {
      tone: effectivePrefs.tone,
      depth: effectivePrefs.depth
    },
    stats: {
      totalStories: summarizedStories.length,
      byUrgency: processedContent.summary.byUrgency,
      byTopic: processedContent.summary.byTopic,
      totalReadTime: processedContent.summary.totalReadTime,
      duplicatesRemoved: processedContent.duplicatesRemoved
    },
    trends: processedContent.trends,
    topicSummaries,
    stories: summarizedStories.map(story => ({
      headline: story.headline,
      summary: story.generatedSummary,
      keyTakeaway: story.keyTakeaway,
      originalSummary: story.summary,
      sourceLink: story.sourceLink,
      topic: story.topic,
      urgency: story.urgency,
      sentiment: story.sentiment,
      keyEntities: story.keyEntities,
      readTimeMinutes: story.readTimeMinutes,
      sources: story.sources || [story.newsletterSource],
      sourceCount: story.sourceCount || 1,
      isBreaking: story.isBreaking,
      trend: story.trend
    })),
    // Group stories by urgency for easy access
    byUrgency: {
      high: summarizedStories.filter(s => s.urgency === 'High').map(formatStoryForReport),
      medium: summarizedStories.filter(s => s.urgency === 'Medium').map(formatStoryForReport),
      low: summarizedStories.filter(s => s.urgency === 'Low').map(formatStoryForReport)
    },
    // Group stories by topic for easy access
    byTopic: Object.fromEntries(
      Object.entries(processedContent.categories).map(([topic, stories]) => [
        topic,
        stories.map(s => {
          const summarized = summarizedStories.find(ss => ss.headline === s.headline);
          return formatStoryForReport(summarized || s);
        })
      ])
    )
  };

  // Print summary
  const summary = progress.getSummary();
  console.log(`\n${COLORS.bright}Summarization Complete${COLORS.reset}`);
  console.log(`${COLORS.dim}─────────────────────────────────${COLORS.reset}`);
  console.log(`${COLORS.green}✓${COLORS.reset} ${summarizedStories.length} stories summarized`);
  console.log(`${COLORS.green}✓${COLORS.reset} ${Object.keys(topicSummaries).length} topic summaries generated`);
  console.log(`${COLORS.dim}Completed in ${summary.elapsedFormatted}${COLORS.reset}`);

  return summarizedContent;
}

/**
 * Format a story for report output
 * @param {object} story - Story object
 * @returns {object} Formatted story
 */
function formatStoryForReport(story) {
  return {
    headline: story.headline,
    summary: story.generatedSummary || story.summary,
    keyTakeaway: story.keyTakeaway,
    link: story.sourceLink,
    topic: story.topic,
    urgency: story.urgency,
    sources: story.sources || [story.newsletterSource],
    sourceCount: story.sourceCount || 1,
    readTime: story.readTimeMinutes,
    isBreaking: story.isBreaking
  };
}

export {
  summarizeContent,
  generateBriefingIntro,
  TONE_CONFIGS,
  DEPTH_CONFIGS
};
