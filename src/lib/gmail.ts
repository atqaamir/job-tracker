import { google, gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";

export class GmailAuthError extends Error {
  constructor(message = "Gmail account is not connected or the connection has expired") {
    super(message);
    this.name = "GmailAuthError";
  }
}

async function getGmailClient(userId: string): Promise<gmail_v1.Gmail> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account?.access_token) {
    throw new GmailAuthError();
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  oauth2Client.on("tokens", (tokens) => {
    void prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token ?? account.access_token,
        expires_at: tokens.expiry_date
          ? Math.floor(tokens.expiry_date / 1000)
          : account.expires_at,
        refresh_token: tokens.refresh_token ?? account.refresh_token,
      },
    });
  });

  // Proactively refresh if the token is expired or about to expire.
  const isExpired = account.expires_at
    ? account.expires_at * 1000 < Date.now() + 60_000
    : true;

  if (isExpired) {
    if (!account.refresh_token) {
      throw new GmailAuthError(
        "Gmail access has expired and no refresh token is available. Please reconnect your Google account."
      );
    }
    try {
      await oauth2Client.refreshAccessToken();
    } catch {
      throw new GmailAuthError(
        "Failed to refresh Gmail access. Please reconnect your Google account."
      );
    }
  }

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
}

/**
 * Lists message IDs matching a Gmail search query, following pagination
 * until Gmail reports no more pages. No artificial cap — a large lookback
 * window with many matches will make several requests, but every matching
 * message is returned.
 */
export async function listMessageIds(
  userId: string,
  query: string
): Promise<GmailMessageSummary[]> {
  const gmail = await getGmailClient(userId);
  const results: GmailMessageSummary[] = [];
  let pageToken: string | undefined;

  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
      pageToken,
    });
    for (const m of res.data.messages ?? []) {
      if (m.id && m.threadId) {
        results.push({ id: m.id, threadId: m.threadId });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return results;
}

export interface ParsedGmailMessage {
  id: string;
  threadId: string;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  toEmail: string | null;
  receivedAt: Date;
  snippet: string;
  bodyText: string;
  bodyHtml: string | null;
  gmailLink: string;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractBodies(payload: gmail_v1.Schema$MessagePart | undefined): {
  text: string;
  html: string | null;
} {
  let text = "";
  let html: string | null = null;

  function walk(part: gmail_v1.Schema$MessagePart | undefined) {
    if (!part) return;
    const mimeType = part.mimeType ?? "";
    if (mimeType === "text/plain" && part.body?.data) {
      text += decodeBase64Url(part.body.data);
    } else if (mimeType === "text/html" && part.body?.data) {
      html = (html ?? "") + decodeBase64Url(part.body.data);
    } else if (part.parts) {
      for (const child of part.parts) walk(child);
    } else if (!part.parts && part.body?.data && mimeType.startsWith("text/")) {
      text += decodeBase64Url(part.body.data);
    }
  }

  walk(payload);
  return { text, html };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAddress(header: string | undefined): { name: string | null; email: string | null } {
  if (!header) return { name: null, email: null };
  const match = header.match(/^(.*?)<(.+?)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    return { name: name || null, email: match[2].trim() };
  }
  return { name: null, email: header.trim() };
}

export async function getMessage(
  userId: string,
  messageId: string
): Promise<ParsedGmailMessage> {
  const gmail = await getGmailClient(userId);
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const msg = res.data;
  const headers = msg.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;

  const { name: fromName, email: fromEmail } = parseAddress(getHeader("From"));
  const { email: toEmail } = parseAddress(getHeader("To"));

  const { text, html } = extractBodies(msg.payload);
  const bodyText = text.trim() || (html ? stripHtml(html) : "");

  const dateHeader = getHeader("Date");
  const receivedAt = dateHeader
    ? new Date(dateHeader)
    : msg.internalDate
      ? new Date(Number(msg.internalDate))
      : new Date();

  return {
    id: msg.id ?? messageId,
    threadId: msg.threadId ?? messageId,
    subject: getHeader("Subject") ?? "(no subject)",
    fromName,
    fromEmail,
    toEmail,
    receivedAt,
    snippet: msg.snippet ?? "",
    bodyText: bodyText.slice(0, 20_000),
    bodyHtml: html,
    gmailLink: `https://mail.google.com/mail/u/0/#all/${msg.threadId ?? messageId}`,
  };
}

export async function verifyGmailConnection(userId: string): Promise<boolean> {
  try {
    const gmail = await getGmailClient(userId);
    await gmail.users.getProfile({ userId: "me" });
    return true;
  } catch {
    return false;
  }
}
