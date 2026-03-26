import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get directory paths
const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, '..', 'credentials', 'google-oauth.json');

// Newsletter senders to search for
const NEWSLETTER_SENDERS = [
  'axios.com',
  'thehustle.co',
  'morningbrew.com',
  'robinhood.com'
];

/**
 * Loads Google OAuth credentials from shared credentials folder
 * @returns {Promise<{client_id: string, client_secret: string}>}
 */
async function loadGoogleCredentials() {
  try {
    const content = await readFile(CREDENTIALS_PATH, 'utf-8');
    const creds = JSON.parse(content);

    if (!creds.client_id || creds.client_id.includes('YOUR_CLIENT_ID')) {
      throw new Error('Google OAuth credentials not configured. Please update credentials/google-oauth.json');
    }

    return creds;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Google OAuth credentials file not found at credentials/google-oauth.json');
    }
    throw error;
  }
}

/**
 * Creates an MCP client connected to the Gmail server
 * @returns {Promise<Client>} Connected MCP client
 */
async function createGmailClient() {
  // Load MCP config
  const configFile = await readFile(join(__dirname, 'mcp-config.json'), 'utf-8');
  const config = JSON.parse(configFile);
  const gmailConfig = config.mcpServers.gmail;

  // Load shared Google OAuth credentials
  const googleCreds = await loadGoogleCredentials();

  const transport = new StdioClientTransport({
    command: gmailConfig.command,
    args: gmailConfig.args,
    env: {
      ...process.env,
      GMAIL_CLIENT_ID: googleCreds.client_id,
      GMAIL_CLIENT_SECRET: googleCreds.client_secret
    }
  });

  const client = new Client({
    name: 'news-agent',
    version: '1.0.0'
  });

  await client.connect(transport);
  return client;
}

/**
 * Calls an MCP tool and returns the result
 * @param {Client} client - MCP client
 * @param {string} toolName - Name of the tool to call
 * @param {object} args - Tool arguments
 * @returns {Promise<any>} Tool result
 */
async function callTool(client, toolName, args = {}) {
  const result = await client.callTool({
    name: toolName,
    arguments: args
  });

  if (result.isError) {
    throw new Error(`Tool ${toolName} failed: ${result.content[0]?.text || 'Unknown error'}`);
  }

  const textContent = result.content.find(c => c.type === 'text');
  if (textContent) {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text;
    }
  }

  return result.content;
}

/**
 * Parses text search results from gmail-mcp-server
 * @param {string} text - Search results text
 * @returns {Array<{id: string, from: string, subject: string, date: string}>}
 */
function parseSearchResultsText(text) {
  if (!text || typeof text !== 'string') return [];

  const emails = [];
  // Match each email block: ID, From, Subject, Date
  const emailPattern = /(\d+)\.\s+ID:\s*(\S+)\s+From:\s*(.+?)\s+Subject:\s*(.+?)\s+Date:\s*(.+?)(?=\s+Snippet:|\s+Labels:)/gs;

  let match;
  while ((match = emailPattern.exec(text)) !== null) {
    emails.push({
      id: match[2].trim(),
      from: match[3].trim(),
      subject: match[4].trim(),
      date: match[5].trim()
    });
  }

  return emails;
}

/**
 * Parses email read response from gmail-mcp-server
 * @param {string} text - Email read response text
 * @returns {{from: string, subject: string, date: string, content: string}}
 */
function parseEmailText(text) {
  if (!text || typeof text !== 'string') {
    return { from: '', subject: '', date: '', content: '' };
  }

  // Extract header fields
  const fromMatch = text.match(/^From:\s*(.+?)$/m);
  const subjectMatch = text.match(/^Subject:\s*(.+?)$/m);
  const dateMatch = text.match(/^Date:\s*(.+?)$/m);

  // Extract content after "--- Text Content ---" or "--- HTML Content ---"
  let content = '';
  const textContentMatch = text.match(/---\s*(?:Text|HTML)\s*Content\s*---\s*([\s\S]*?)(?=---\s*\w+\s*Content\s*---|$)/i);
  if (textContentMatch) {
    content = textContentMatch[1].trim();
  }

  return {
    from: fromMatch?.[1]?.trim() || '',
    subject: subjectMatch?.[1]?.trim() || '',
    date: dateMatch?.[1]?.trim() || '',
    content: content
  };
}

/**
 * Builds a Gmail search query for newsletters received in the last 24 hours
 * @returns {string} Gmail search query
 */
function buildSearchQuery() {
  const senderQueries = NEWSLETTER_SENDERS
    .map(sender => `from:${sender}`)
    .join(' OR ');

  // Use newer_than:1d to catch newsletters from the past 24 hours
  // This is more reliable than after:date since newsletters arrive at different times
  return `(${senderQueries}) newer_than:1d`;
}

/**
 * Extracts HTML body from Gmail message payload
 * @param {object} payload - Gmail message payload
 * @returns {string} HTML content or plain text fallback
 */
function extractHtmlBody(payload) {
  if (!payload) return '';

  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.mimeType === 'text/html') {
      return decoded;
    }
    if (payload.mimeType === 'text/plain') {
      return decoded;
    }
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }

    for (const part of payload.parts) {
      const result = extractHtmlBody(part);
      if (result) return result;
    }
  }

  return '';
}

/**
 * Fetches newsletter emails from Gmail via MCP
 * @param {function} log - Logging function
 * @returns {Promise<Array<{sender: string, subject: string, content: string, receivedTime: string}>>}
 */
async function fetchNewsletterEmails(log = console.log) {
  let client = null;

  try {
    log('   Connecting to Gmail via MCP...');
    client = await createGmailClient();

    const query = buildSearchQuery();
    log('   Searching for today\'s newsletters...');

    const searchResults = await callTool(client, 'gmail_search_emails', { query });

    // Handle different response formats from the MCP server
    let messageList;
    if (typeof searchResults === 'string') {
      // Parse text format from gmail-mcp-server
      messageList = parseSearchResultsText(searchResults);
    } else {
      messageList = searchResults?.messages || searchResults?.emails ||
                    searchResults?.results || (Array.isArray(searchResults) ? searchResults : []);
    }

    if (!messageList || messageList.length === 0) {
      return [];
    }

    log(`   Found ${messageList.length} newsletter(s), fetching content...`);
    const emails = [];

    for (const message of messageList) {
      try {
        // If search already returned full email data, use it directly
        if (message.body || message.content || message.html) {
          emails.push({
            sender: message.from || message.sender || '',
            subject: message.subject || '',
            content: message.html || message.body || message.content || '',
            receivedTime: message.date || message.receivedTime || ''
          });
          continue;
        }

        // Otherwise fetch the full email
        const emailId = message.id || message.email_id || message.messageId;
        const emailData = await callTool(client, 'gmail_read_email', {
          messageId: emailId
        });

        let sender, subject, content, date;

        // Handle text format from gmail-mcp-server
        if (typeof emailData === 'string') {
          const parsed = parseEmailText(emailData);
          sender = parsed.from;
          subject = parsed.subject;
          content = parsed.content;
          date = parsed.date;
        } else {
          // Handle different email data formats (JSON)
          content = emailData.html || emailData.body ||
                   extractHtmlBody(emailData.payload) || emailData.content || '';

          sender = emailData.from || emailData.sender ||
                  (emailData.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value) || '';

          subject = emailData.subject ||
                   (emailData.payload?.headers?.find(h => h.name.toLowerCase() === 'subject')?.value) || '';

          date = emailData.date || emailData.receivedTime ||
                (emailData.payload?.headers?.find(h => h.name.toLowerCase() === 'date')?.value) || '';
        }

        emails.push({
          sender,
          subject,
          content,
          receivedTime: date
        });
      } catch (emailError) {
        log(`   Warning: Failed to fetch one email: ${emailError.message}`);
      }
    }

    return emails;

  } catch (error) {
    if (error.message.includes('credentials')) {
      throw new Error('Gmail authentication failed. Please check credentials.json and complete OAuth flow.');
    } else if (error.message.includes('ENOENT') || error.message.includes('mcp-config.json')) {
      throw new Error('Configuration file mcp-config.json not found.');
    } else if (error.message.includes('connect')) {
      throw new Error('Failed to connect to Gmail MCP server. Check network and configuration.');
    }
    throw error;

  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

export {
  fetchNewsletterEmails,
  NEWSLETTER_SENDERS
};
