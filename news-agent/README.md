# News Agent 📰

An AI-powered Gmail newsletter summarizer that fetches your daily newsletters, extracts and categorizes stories, generates intelligent summaries using Claude, and produces a beautiful HTML briefing.

## What It Does

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Gmail Inbox   │────▶│  Claude AI      │────▶│  HTML Report    │
│   (via MCP)     │     │  Processing     │     │  + Feedback     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

1. **Fetches** newsletters from Gmail (Axios, Morning Brew, The Hustle, Robinhood Snacks)
2. **Extracts** individual news stories from HTML content
3. **Categorizes** into topics: Tech, Business, Markets, Politics, Health, Culture, World
4. **Deduplicates** stories covered by multiple newsletters
5. **Scores** urgency (High/Medium/Low) based on keywords and your preferences
6. **Summarizes** each story to 2-3 sentences using Claude
7. **Generates** a beautiful, responsive HTML report
8. **Learns** from your feedback to improve future briefings

## Quick Start

```bash
# Install dependencies
npm install

# Run with sample data (no Gmail/API setup needed)
npm run test:quick

# Run with full features
npm start
```

## Sample Output

```
╔════════════════════════════════════════════════╗
║           📰 News Agent Starting...            ║
╚════════════════════════════════════════════════╝

ℹ Date: Tuesday, January 14, 2026
ℹ Tracking: axios.com, thehustle.co, morningbrew.com, robinhood.com

[1/5] Fetching newsletters from Gmail...
✓ Found 4 newsletter(s)
→   • Morning Brew - Tech Giants Report Earnings
→   • Axios AM: The tech earnings surprise

[2/5] Processing newsletter content...
✓ Extracted 15 stories
✓ Removed 3 duplicates

[3/5] Generating AI summaries with Claude...
✓ Summaries generated successfully
→   • High priority: 4
→   • Medium priority: 8
→   • Low priority: 3
→   • Total read time: 12 minutes

[4/5] Generating HTML report...
✓ Report saved and opened in browser!

╔════════════════════════════════════════════════╗
║            ✅ Briefing Complete!               ║
╚════════════════════════════════════════════════╝
```

## Project Structure

```
Agents/                       # Root workspace (npm workspaces)
├── .env                      # Shared API keys (ANTHROPIC_API_KEY)
├── .env.example              # Template for .env
├── credentials/              # Shared credentials folder
│   ├── google-oauth.json     # Google OAuth (not committed)
│   └── google-oauth.example.json
├── package.json              # Workspace configuration
└── news-agent/
    ├── agent.js              # Main orchestrator
    ├── gmail-client.js       # Gmail/MCP connection
    ├── content-processor.js  # HTML parsing, categorization, deduplication
    ├── summarizer.js         # Claude AI summarization
    ├── report-generator.js   # HTML report generation
    ├── feedback.js           # User preference collection
    ├── test-mode.js          # Test runner with sample data
    ├── mcp-config.json       # Gmail MCP server configuration
    ├── package.json
    ├── data/
    │   ├── preferences.json  # User preferences (not committed)
    │   ├── sample-emails.json# Test data
    │   └── story-history.json# Trend tracking (auto-generated)
    └── reports/              # Generated HTML reports
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run the full agent (requires Gmail + Claude setup) |
| `npm test` | Run with sample data (requires Claude API key) |
| `npm run test:no-ai` | Run with sample data, no API calls |
| `npm run test:quick` | Quick test with mock summaries |

## Features

### Smart Content Processing
- Parses complex newsletter HTML layouts
- Extracts headlines, summaries, and source links
- Identifies duplicate stories across newsletters
- Detects trending topics and entities

### AI-Powered Summaries
- 2-3 sentence summaries per story
- Key takeaways highlighted
- Customizable tone (professional, casual, technical)
- Customizable depth (brief, standard, detailed)

### Priority Scoring
Stories are scored based on:
- Breaking news keywords
- Coverage by multiple newsletters
- Your priority topics and keywords
- Your deprioritized topics

### Beautiful Reports
- Clean, modern design
- Mobile-responsive
- Organized by topic
- Urgency indicators (🔴 High, 🟡 Medium, ⚪ Low)
- Direct links to original articles

### Learning System
- Remembers your topic preferences
- Adjusts priority based on feedback
- Tracks which entities are trending

## Setup

For detailed setup instructions including Gmail OAuth configuration, see **[SETUP.md](./SETUP.md)**.

### Quick Setup

1. **Install dependencies** (from the root Agents folder):
   ```bash
   cd Agents
   npm install
   ```

2. **Add your Anthropic API key** to the root `.env`:
   ```bash
   # In /Agents/.env
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Add Google OAuth credentials** to `credentials/google-oauth.json`:
   ```json
   {
     "client_id": "your-client-id.apps.googleusercontent.com",
     "client_secret": "your-client-secret"
   }
   ```
   See [SETUP.md](./SETUP.md#4-setting-up-gmail-access) for how to get these.

4. **Run:**
   ```bash
   # From root folder
   npm run news

   # Or from news-agent folder
   cd news-agent && npm start
   ```

## Configuration

### Preferences (`data/preferences.json`)

```json
{
  "tone": "professional",      // professional, casual, technical
  "depth": "standard",         // brief, standard, detailed
  "priorityTopics": ["Tech", "Markets"],
  "deprioritizeTopics": ["Politics"],
  "priorityKeywords": ["AI", "startup"],
  "deprioritizeKeywords": ["celebrity"]
}
```

### Newsletter Sources (`gmail-client.js`)

Edit `NEWSLETTER_SENDERS` to track different newsletters:

```javascript
const NEWSLETTER_SENDERS = [
  'axios.com',
  'thehustle.co',
  'morningbrew.com',
  'robinhood.com'
];
```

## Requirements

- **Node.js 18+**
- **Anthropic API key** ([Get one here](https://console.anthropic.com/))
- **Google Cloud project** with Gmail API enabled (for Gmail access)

## Costs

- **Anthropic API:** ~$0.10-0.50 per daily briefing
- **Google Cloud:** Free (Gmail API has generous limits)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "ANTHROPIC_API_KEY not set" | Add your key to root `Agents/.env` file |
| "Google OAuth credentials not found" | Add credentials to `Agents/credentials/google-oauth.json` |
| "Google OAuth credentials not configured" | Update placeholder values in `google-oauth.json` |
| "No newsletters found" | Check if newsletters arrived today |
| "Token expired" | Delete `token.json` and re-authenticate |

See [SETUP.md](./SETUP.md#7-troubleshooting) for more solutions.

## Architecture

```
┌──────────────┐
│   agent.js   │  Main orchestrator - runs the pipeline
└──────┬───────┘
       │
       ▼
┌──────────────┐
│gmail-client  │  Connects to Gmail via MCP protocol
└──────┬───────┘
       │
       ▼
┌──────────────┐
│content-proc  │  Parses HTML, extracts stories, dedupes
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ summarizer   │  Generates AI summaries via Claude
└──────┬───────┘
       │
       ▼
┌──────────────┐
│report-gen    │  Creates HTML report, opens browser
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  feedback    │  Collects user preferences
└──────────────┘
```

## License

MIT
