# AI Agents

A collection of AI-powered agents built with Claude and other tools.

## Project Structure

```
/Agents
├── .env                          # Shared API keys (not committed)
├── .env.example                  # Template for .env
├── credentials/                  # Shared credentials folder
│   ├── google-oauth.json         # Google OAuth (not committed)
│   └── google-oauth.example.json # Template for Google OAuth
├── package.json                  # Workspace configuration
├── node_modules/                 # Shared dependencies
│
├── /news-agent                   # Newsletter summarizer agent
│   ├── README.md                 # Agent-specific documentation
│   └── ...
│
└── /[future-agents]              # Additional agents go here
```

## Prerequisites

- Node.js 18 or higher
- An [Anthropic API key](https://console.anthropic.com/settings/keys)
- Google Cloud project with Gmail API enabled (for news-agent)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd Agents
npm install
```

### 2. Configure Shared Secrets

```bash
# Copy example files
cp .env.example .env
cp credentials/google-oauth.example.json credentials/google-oauth.json

# Edit .env and add your Anthropic API key
# Edit credentials/google-oauth.json with your Google OAuth credentials
```

### 3. Run an Agent

```bash
# Run news-agent
npm run news

# Run news-agent tests (no credentials needed)
npm run news:test

# Run index-pulse-agent
npm run indexpulse
```

## Available Agents

| Agent | Description | Documentation |
|-------|-------------|---------------|
| [news-agent](./news-agent/) | Summarizes daily newsletters from Gmail | [README](./news-agent/README.md) |
| [index-pulse-agent](./index-pulse-agent/) | YTD quarterly performance for 8 financial indexes | [Spec](./index-pulse-agent/docs/product-spec.md) |

## Adding a New Agent

1. Create a new folder: `my-agent/`
2. Add a `package.json` with dependencies
3. Run `npm install` from the root
4. Add agent-specific README and configuration

The workspace is configured to auto-detect folders matching `*-agent`.

## Architecture

This project uses [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) to share dependencies and credentials across agents:

| Item | Location | Purpose |
|------|----------|---------|
| **Dependencies** | `/node_modules/` | Shared npm packages |
| **API Keys** | `/.env` | Anthropic and other API keys |
| **OAuth Credentials** | `/credentials/` | Google OAuth, etc. |
| **Agent Configs** | `/[agent]/` | Agent-specific settings |

### Why This Structure?

- **Single source of truth** for shared credentials
- **Easy rotation** - update once, all agents use new credentials
- **Clear separation** - secrets at root, configs in agent folders
- **Git-safe** - all secrets are gitignored

## License

MIT
