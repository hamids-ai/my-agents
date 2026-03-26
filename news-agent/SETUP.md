# News Agent Setup Guide

This guide will walk you through setting up the News Agent from scratch. Even if you've never worked with APIs before, you'll have everything running in about 20-30 minutes.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Getting Your Anthropic API Key](#3-getting-your-anthropic-api-key)
4. [Setting Up Gmail Access](#4-setting-up-gmail-access)
5. [First Run](#5-first-run)
6. [Daily Usage](#6-daily-usage)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Prerequisites

Before you begin, make sure you have:

### Required

| Requirement | How to Check | How to Get |
|-------------|--------------|------------|
| **Node.js 18+** | Run `node --version` in terminal | [Download from nodejs.org](https://nodejs.org/) |
| **npm** | Run `npm --version` (comes with Node.js) | Included with Node.js |
| **A Gmail account** | You already have one if you use Gmail | [Create at gmail.com](https://gmail.com) |

### You'll Also Need to Create

- **Anthropic API account** (free to sign up, pay-as-you-go for API usage)
- **Google Cloud account** (free, needed for Gmail API access)

Don't worry if you don't have these yet - we'll set them up in the steps below.

### Cost Expectations

- **Anthropic API**: ~$0.10-0.50 per daily briefing (depends on newsletter volume)
- **Google Cloud**: Free (Gmail API has generous free limits)

---

## 2. Installation

### Step 2.1: Open Your Terminal

- **Mac**: Press `Cmd + Space`, type "Terminal", press Enter
- **Windows**: Press `Win + R`, type "cmd", press Enter (or use PowerShell)
- **Linux**: Press `Ctrl + Alt + T`

### Step 2.2: Navigate to the Project

```bash
cd /path/to/news-agent
```

Replace `/path/to/news-agent` with wherever you saved the project. For example:
```bash
cd ~/Documents/news-agent
```

### Step 2.3: Install Dependencies

```bash
npm install
```

This downloads all the required packages. You'll see a progress bar and it should complete in 30-60 seconds.

**Expected output:**
```
added 150 packages in 45s
```

### Step 2.4: Verify Installation

```bash
ls -la
```

You should see these files:
```
agent.js
content-processor.js
feedback.js
gmail-client.js
report-generator.js
summarizer.js
package.json
mcp-config.json
.env
data/
reports/
```

---

## 3. Getting Your Anthropic API Key

The Anthropic API key lets News Agent use Claude to summarize your newsletters.

### Step 3.1: Create an Anthropic Account

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Click **"Sign Up"** (or "Log In" if you have an account)
3. Complete the registration process

### Step 3.2: Add Payment Method

1. Once logged in, click on **"Plans & Billing"** in the left sidebar
2. Click **"Add Payment Method"**
3. Enter your credit card details
4. You'll only be charged for what you use (~$0.10-0.50 per day)

### Step 3.3: Create an API Key

1. Click on **"API Keys"** in the left sidebar
2. Click **"Create Key"**
3. Give it a name like "News Agent"
4. Click **"Create Key"**
5. **Important**: Copy the key immediately! It starts with `sk-ant-` and you won't be able to see it again.

### Step 3.4: Add the Key to Your Project

1. Open the `.env` file in the project folder:

   ```bash
   # Mac/Linux
   nano .env

   # Or use any text editor
   open .env        # Mac
   notepad .env     # Windows
   ```

2. Replace the placeholder with your actual key:

   ```
   ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here
   ```

3. Save the file:
   - In nano: Press `Ctrl + X`, then `Y`, then `Enter`
   - In other editors: Just save normally

### Step 3.5: Verify the Key is Set

```bash
# Mac/Linux
cat .env

# Windows
type .env
```

You should see your key (starting with `sk-ant-`).

---

## 4. Setting Up Gmail Access

This is the longest step, but I'll walk you through each click. We're creating a secure way for News Agent to read (not send!) your newsletters.

### Step 4.1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)

2. If this is your first time:
   - Accept the Terms of Service
   - You may be asked to select your country

3. At the top of the page, click the project dropdown (it might say "Select a project" or show an existing project name)

4. In the popup, click **"New Project"** (top right)

5. Enter these details:
   - **Project name**: `News Agent` (or any name you like)
   - **Organization**: Leave as default

6. Click **"Create"**

7. Wait 10-30 seconds for the project to be created

8. Make sure your new project is selected (check the dropdown at the top)

### Step 4.2: Enable the Gmail API

1. In the left sidebar, click **"APIs & Services"** → **"Library"**

   (If you don't see the sidebar, click the hamburger menu ☰ in the top left)

2. In the search box, type **"Gmail API"**

3. Click on **"Gmail API"** in the results

4. Click the big blue **"Enable"** button

5. Wait a few seconds for it to enable

### Step 4.3: Configure the OAuth Consent Screen

This tells Google what your app does and who can use it.

1. In the left sidebar, click **"APIs & Services"** → **"OAuth consent screen"**

2. Select **"External"** and click **"Create"**

   (Choose "External" even if it's just for you - "Internal" is only for Google Workspace organizations)

3. Fill in the **App Information**:
   - **App name**: `News Agent`
   - **User support email**: Select your email from the dropdown
   - **App logo**: Skip this (leave empty)

4. Scroll down to **Developer contact information**:
   - **Email addresses**: Enter your email

5. Click **"Save and Continue"**

### Step 4.4: Add Gmail Scopes

1. On the **Scopes** page, click **"Add or Remove Scopes"**

2. In the search box that appears, search for: `gmail.readonly`

3. Find and check the box next to:
   ```
   https://www.googleapis.com/auth/gmail.readonly
   ```
   (Description: "View your email messages and settings")

4. Click **"Update"** at the bottom of the panel

5. Click **"Save and Continue"**

### Step 4.5: Add Yourself as a Test User

Since your app isn't "verified" by Google (which requires a review process), you need to add yourself as a test user.

1. On the **Test users** page, click **"Add Users"**

2. Enter your Gmail address (the one you want to read newsletters from)

3. Click **"Add"**

4. Click **"Save and Continue"**

5. On the summary page, click **"Back to Dashboard"**

### Step 4.6: Create OAuth Credentials

Now we create the actual credentials file.

1. In the left sidebar, click **"APIs & Services"** → **"Credentials"**

2. At the top, click **"+ Create Credentials"**

3. Select **"OAuth client ID"**

4. For **Application type**, select **"Desktop app"**

5. For **Name**, enter: `News Agent Desktop`

6. Click **"Create"**

7. A popup appears with your credentials. Click **"Download JSON"**

8. Click **"OK"** to close the popup

### Step 4.7: Move the Credentials File

1. Find the downloaded file. It will be named something like:
   ```
   client_secret_123456789-abc123.apps.googleusercontent.com.json
   ```

2. Rename it to exactly: `credentials.json`

3. Move it to your news-agent project folder (same folder as `agent.js`)

**Mac/Linux terminal method:**
```bash
# Find where it downloaded (usually Downloads folder)
mv ~/Downloads/client_secret_*.json ./credentials.json
```

**Windows method:**
- Open File Explorer
- Go to Downloads
- Find the file starting with `client_secret_`
- Rename it to `credentials.json`
- Move it to your news-agent folder

### Step 4.8: Verify the File is in Place

```bash
ls credentials.json
```

If you see `credentials.json` (no error), you're good!

---

## 5. First Run

Now let's run News Agent for the first time!

### Step 5.1: Start the Agent

```bash
npm start
```

### Step 5.2: Authenticate with Google

1. A browser window should automatically open

2. You'll see a Google sign-in page. Select your Gmail account.

3. You'll see a scary warning: **"Google hasn't verified this app"**

   This is normal! It's because your app isn't published. Click:
   - **"Advanced"** (small link at bottom left)
   - **"Go to News Agent (unsafe)"**

4. Review the permissions. News Agent is asking to:
   - "View your email messages and settings" (read-only)

   Click **"Continue"**

5. You should see: **"Authentication successful!"**

   You can close this browser tab.

### Step 5.3: Watch It Run

Back in your terminal, you should see:

```
╔════════════════════════════════════════════════╗
║           📰 News Agent Starting...            ║
╚════════════════════════════════════════════════╝

ℹ Date: Tuesday, January 14, 2026
ℹ Tracking: axios.com, thehustle.co, morningbrew.com, robinhood.com

[1/5] Fetching newsletters from Gmail...
✓ Found 3 newsletter(s)
...
```

### Step 5.4: Check the Report

- An HTML report should open in your browser automatically
- It's also saved in the `reports/` folder

### First Run Complete! 🎉

You've successfully set up News Agent. The authentication is saved, so you won't need to log in again.

---

## 6. Daily Usage

### Running Manually

Whenever you want your daily briefing:

```bash
cd /path/to/news-agent
npm start
```

### Setting Up Automatic Daily Runs (Optional)

#### Mac/Linux (using cron)

1. Open your crontab:
   ```bash
   crontab -e
   ```

2. Add this line to run at 8 AM every day:
   ```
   0 8 * * * cd /path/to/news-agent && /usr/local/bin/npm start >> /tmp/news-agent.log 2>&1
   ```

3. Save and exit

#### Mac (using launchd) - More Reliable

1. Create a file at `~/Library/LaunchAgents/com.newsagent.daily.plist`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.newsagent.daily</string>
       <key>ProgramArguments</key>
       <array>
           <string>/usr/local/bin/npm</string>
           <string>start</string>
       </array>
       <key>WorkingDirectory</key>
       <string>/path/to/news-agent</string>
       <key>StartCalendarInterval</key>
       <dict>
           <key>Hour</key>
           <integer>8</integer>
           <key>Minute</key>
           <integer>0</integer>
       </dict>
   </dict>
   </plist>
   ```

2. Load it:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.newsagent.daily.plist
   ```

#### Windows (using Task Scheduler)

1. Open Task Scheduler (search for it in Start menu)
2. Click "Create Basic Task"
3. Name it "News Agent Daily"
4. Set trigger to "Daily" at your preferred time
5. Set action to "Start a program"
6. Program: `cmd`
7. Arguments: `/c cd /d C:\path\to\news-agent && npm start`

---

## 7. Troubleshooting

### "ANTHROPIC_API_KEY is not set"

**Problem**: The agent can't find your API key.

**Solution**:
1. Make sure `.env` exists in the project folder
2. Check it contains: `ANTHROPIC_API_KEY=sk-ant-...`
3. Make sure there are no spaces around the `=`
4. Make sure the key starts with `sk-ant-`

### "credentials.json not found"

**Problem**: Gmail OAuth credentials are missing.

**Solution**:
1. Go back to [Step 4.6](#step-46-create-oauth-credentials)
2. Download the JSON file again
3. Rename it to exactly `credentials.json`
4. Put it in the same folder as `agent.js`

### "Access blocked: This app's request is invalid"

**Problem**: Google is blocking the authentication.

**Solution**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to APIs & Services → OAuth consent screen
4. Make sure you added yourself as a Test User ([Step 4.5](#step-45-add-yourself-as-a-test-user))

### "Token has been expired or revoked"

**Problem**: Your Gmail authentication expired.

**Solution**:
1. Delete the `token.json` file in your project folder:
   ```bash
   rm token.json
   ```
2. Run `npm start` again
3. Complete the Google authentication in the browser

### "No newsletters found for today"

**Problem**: No emails from the tracked senders were found.

**Possible causes**:
1. No newsletters arrived today yet
2. The newsletters are in a different folder (not inbox)
3. The sender addresses don't match

**Solution**:
- Check if you actually received newsletters today
- The agent searches for emails from: axios.com, thehustle.co, morningbrew.com, robinhood.com
- If your newsletters come from different addresses, edit the `NEWSLETTER_SENDERS` array in `gmail-client.js`

### "Failed to connect to Gmail MCP server"

**Problem**: The MCP server couldn't start.

**Solution**:
1. Make sure all dependencies are installed:
   ```bash
   npm install
   ```
2. Check that `mcp-config.json` exists and is valid JSON
3. Try running with more verbose output:
   ```bash
   DEBUG=* npm start
   ```

### "Rate limit exceeded" (Anthropic API)

**Problem**: You've made too many API requests.

**Solution**:
- Wait a few minutes and try again
- Check your usage at [console.anthropic.com](https://console.anthropic.com/)
- Consider upgrading your API tier if this happens often

### Browser Doesn't Open Automatically

**Problem**: The HTML report doesn't open.

**Solution**:
- The report is still saved! Look in the `reports/` folder
- Open it manually:
  ```bash
  # Mac
  open reports/daily-report-*.html

  # Linux
  xdg-open reports/daily-report-*.html

  # Windows
  start reports\daily-report-*.html
  ```

### "Permission denied" Errors

**Problem**: File permission issues.

**Solution**:
```bash
# Make the agent executable
chmod +x agent.js

# Fix folder permissions
chmod -R 755 .
```

---

## Getting Help

If you're still stuck:

1. **Check the README.md** for additional documentation
2. **Review error messages** - they often tell you exactly what's wrong
3. **Google the error** - someone else has probably had the same issue

---

## Quick Reference Card

Once everything is set up, here's all you need:

```bash
# Run daily briefing
npm start

# Check your preferences
cat data/preferences.json

# View past reports
ls reports/

# Re-authenticate Gmail (if needed)
rm token.json && npm start
```

**Files you should never share or commit:**
- `.env` (contains your API key)
- `credentials.json` (Google OAuth secrets)
- `token.json` (your Gmail access token)

---

Congratulations! You're all set up. Enjoy your daily news briefings! 📰
