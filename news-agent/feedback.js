import { createInterface } from 'readline';
import { readFile, writeFile } from 'fs/promises';

const PREFERENCES_PATH = './data/preferences.json';

/**
 * Create readline interface for terminal input
 */
function createPrompt() {
  return createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask a question and get user input
 * @param {readline.Interface} rl - Readline interface
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's answer
 */
function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Parse user input into a list of items
 * @param {string} input - Raw user input
 * @returns {Array<string>} Parsed items
 */
function parseInput(input) {
  if (!input || input.toLowerCase() === 'skip' || input.toLowerCase() === 'none') {
    return [];
  }

  // Split by commas, "and", or newlines
  return input
    .split(/[,\n]|(?:\s+and\s+)/i)
    .map(item => item.trim())
    .filter(item => item.length > 0)
    // Capitalize first letter of each item
    .map(item => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase());
}

/**
 * Load existing preferences
 * @returns {Promise<object>} Current preferences
 */
async function loadPreferences() {
  try {
    const content = await readFile(PREFERENCES_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      tone: 'professional',
      depth: 'standard',
      priorityTopics: [],
      deprioritizeTopics: [],
      priorityKeywords: [],
      deprioritizeKeywords: []
    };
  }
}

/**
 * Save preferences to file
 * @param {object} preferences - Preferences to save
 */
async function savePreferences(preferences) {
  await writeFile(PREFERENCES_PATH, JSON.stringify(preferences, null, 2));
}

/**
 * Merge new items into existing array without duplicates
 * @param {Array} existing - Existing items
 * @param {Array} newItems - New items to add
 * @returns {Array} Merged array
 */
function mergeUnique(existing, newItems) {
  const normalized = new Set(existing.map(i => i.toLowerCase()));
  const merged = [...existing];

  for (const item of newItems) {
    if (!normalized.has(item.toLowerCase())) {
      merged.push(item);
      normalized.add(item.toLowerCase());
    }
  }

  return merged;
}

/**
 * Categorize user input as topic or keyword
 * @param {Array<string>} items - User input items
 * @returns {{topics: Array, keywords: Array}} Categorized items
 */
function categorizeInput(items) {
  const knownTopics = ['tech', 'business', 'markets', 'politics', 'health', 'culture', 'world', 'other'];

  const topics = [];
  const keywords = [];

  for (const item of items) {
    if (knownTopics.includes(item.toLowerCase())) {
      topics.push(item);
    } else {
      keywords.push(item);
    }
  }

  return { topics, keywords };
}

/**
 * Display current preferences summary
 * @param {object} prefs - Preferences object
 */
function displayCurrentPrefs(prefs) {
  const hasPriority = (prefs.priorityTopics?.length > 0) || (prefs.priorityKeywords?.length > 0);
  const hasDepriority = (prefs.deprioritizeTopics?.length > 0) || (prefs.deprioritizeKeywords?.length > 0);

  if (hasPriority || hasDepriority) {
    console.log('\n📋 Your current preferences:');

    if (prefs.priorityTopics?.length > 0) {
      console.log(`   Priority topics: ${prefs.priorityTopics.join(', ')}`);
    }
    if (prefs.priorityKeywords?.length > 0) {
      console.log(`   Priority keywords: ${prefs.priorityKeywords.join(', ')}`);
    }
    if (prefs.deprioritizeTopics?.length > 0) {
      console.log(`   De-prioritized topics: ${prefs.deprioritizeTopics.join(', ')}`);
    }
    if (prefs.deprioritizeKeywords?.length > 0) {
      console.log(`   De-prioritized keywords: ${prefs.deprioritizeKeywords.join(', ')}`);
    }
    console.log('');
  }
}

/**
 * Collect feedback from user and update preferences
 * @param {object} summarizedContent - The summarized content (for context)
 * @returns {Promise<object>} Updated preferences
 */
async function collectFeedback(summarizedContent) {
  const rl = createPrompt();

  console.log('\n' + '─'.repeat(50));
  console.log('📝 Quick Feedback');
  console.log('─'.repeat(50));
  console.log('Help me learn your preferences! This only takes a moment.');
  console.log('(Type "skip" to skip any question)\n');

  // Load existing preferences
  const currentPrefs = await loadPreferences();
  displayCurrentPrefs(currentPrefs);

  // Show available topics for reference
  const topicsInReport = Object.entries(summarizedContent?.stats?.byTopic || {})
    .filter(([_, count]) => count > 0)
    .map(([topic]) => topic);

  if (topicsInReport.length > 0) {
    console.log(`Today's topics: ${topicsInReport.join(', ')}\n`);
  }

  try {
    // Question 1: What to prioritize
    const prioritizeAnswer = await ask(rl,
      '✨ Which topics or stories did you find most valuable today?\n' +
      '   (e.g., "Tech, AI, startup news" or just "Markets")\n' +
      '   → '
    );

    // Question 2: What to de-prioritize
    const deprioritizeAnswer = await ask(rl,
      '\n🔇 Any topics you\'d like to see less of in the future?\n' +
      '   (e.g., "Politics" or "celebrity gossip")\n' +
      '   → '
    );

    // Parse responses
    const prioritizeItems = parseInput(prioritizeAnswer);
    const deprioritizeItems = parseInput(deprioritizeAnswer);

    // Check if user provided any feedback
    if (prioritizeItems.length === 0 && deprioritizeItems.length === 0) {
      console.log('\n👍 No changes made. Your preferences remain the same.');
      rl.close();
      return currentPrefs;
    }

    // Categorize into topics vs keywords
    const prioritized = categorizeInput(prioritizeItems);
    const deprioritized = categorizeInput(deprioritizeItems);

    // Merge with existing preferences
    const updatedPrefs = {
      ...currentPrefs,
      priorityTopics: mergeUnique(currentPrefs.priorityTopics || [], prioritized.topics),
      priorityKeywords: mergeUnique(currentPrefs.priorityKeywords || [], prioritized.keywords),
      deprioritizeTopics: mergeUnique(currentPrefs.deprioritizeTopics || [], deprioritized.topics),
      deprioritizeKeywords: mergeUnique(currentPrefs.deprioritizeKeywords || [], deprioritized.keywords),
      lastUpdated: new Date().toISOString(),
      feedbackHistory: [
        ...(currentPrefs.feedbackHistory || []),
        {
          date: new Date().toISOString(),
          prioritized: prioritizeItems,
          deprioritized: deprioritizeItems
        }
      ].slice(-10) // Keep last 10 feedback entries
    };

    // Remove items from priority if they're in depriority (and vice versa)
    updatedPrefs.priorityTopics = updatedPrefs.priorityTopics.filter(
      t => !updatedPrefs.deprioritizeTopics.map(d => d.toLowerCase()).includes(t.toLowerCase())
    );
    updatedPrefs.priorityKeywords = updatedPrefs.priorityKeywords.filter(
      k => !updatedPrefs.deprioritizeKeywords.map(d => d.toLowerCase()).includes(k.toLowerCase())
    );
    updatedPrefs.deprioritizeTopics = updatedPrefs.deprioritizeTopics.filter(
      t => !prioritized.topics.map(p => p.toLowerCase()).includes(t.toLowerCase())
    );
    updatedPrefs.deprioritizeKeywords = updatedPrefs.deprioritizeKeywords.filter(
      k => !prioritized.keywords.map(p => p.toLowerCase()).includes(k.toLowerCase())
    );

    // Save updated preferences
    await savePreferences(updatedPrefs);

    // Confirm what was saved
    console.log('\n' + '─'.repeat(50));
    console.log('✅ Preferences updated!');
    console.log('─'.repeat(50));

    if (prioritized.topics.length > 0 || prioritized.keywords.length > 0) {
      console.log('\n📈 Will prioritize:');
      if (prioritized.topics.length > 0) {
        console.log(`   Topics: ${prioritized.topics.join(', ')}`);
      }
      if (prioritized.keywords.length > 0) {
        console.log(`   Keywords: ${prioritized.keywords.join(', ')}`);
      }
    }

    if (deprioritized.topics.length > 0 || deprioritized.keywords.length > 0) {
      console.log('\n📉 Will de-prioritize:');
      if (deprioritized.topics.length > 0) {
        console.log(`   Topics: ${deprioritized.topics.join(', ')}`);
      }
      if (deprioritized.keywords.length > 0) {
        console.log(`   Keywords: ${deprioritized.keywords.join(', ')}`);
      }
    }

    console.log('\n💡 These preferences will be applied to tomorrow\'s briefing.');
    console.log(`   Last updated: ${new Date().toLocaleString()}\n`);

    rl.close();
    return updatedPrefs;

  } catch (error) {
    rl.close();
    console.error('\nFeedback collection was interrupted.');
    return currentPrefs;
  }
}

/**
 * Ask user if they want to provide feedback
 * @param {object} summarizedContent - The summarized content
 * @returns {Promise<object|null>} Updated preferences or null if skipped
 */
async function promptForFeedback(summarizedContent) {
  const rl = createPrompt();

  try {
    const answer = await ask(rl,
      '\n💬 Would you like to provide quick feedback to improve future briefings? (y/n) → '
    );

    rl.close();

    if (answer.toLowerCase().startsWith('y')) {
      return await collectFeedback(summarizedContent);
    } else {
      console.log('\n👋 No problem! See you next time.\n');
      return null;
    }

  } catch {
    rl.close();
    return null;
  }
}

export {
  collectFeedback,
  promptForFeedback,
  loadPreferences,
  savePreferences
};
