/**
 * DocuSign API Client
 * Fetches envelope status and document information
 * Uses JWT Grant authentication
 */

import * as jose from 'jose';
import { getOAuthToken, saveOAuthToken } from './supabase';

const DOCUSIGN_BASE_URL = process.env.DOCUSIGN_BASE_URI || 'https://demo.docusign.net';
const DOCUSIGN_OAUTH_URL = DOCUSIGN_BASE_URL.includes('demo')
  ? 'https://account-d.docusign.com'
  : 'https://account.docusign.com';

// Try to get stored OAuth tokens (from Supabase database)
async function getStoredTokens(): Promise<{ access_token: string; refresh_token?: string; expires_at: number } | null> {
  try {
    const token = await getOAuthToken('docusign');
    if (token) {
      const expiresAt = new Date(token.expires_at).getTime();
      // Check if token is still valid (with 5 min buffer)
      if (expiresAt && Date.now() < expiresAt - 5 * 60 * 1000) {
        return {
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: expiresAt,
        };
      }
      // Token expired, try to refresh
      console.log('Stored token expired, will try to refresh or use JWT');
    }
  } catch (e) {
    console.log('No stored tokens found, will use JWT auth');
  }
  return null;
}

// Refresh OAuth token using refresh_token
async function refreshStoredToken(): Promise<string | null> {
  try {
    const storedToken = await getOAuthToken('docusign');
    if (!storedToken?.refresh_token) return null;

    const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
    const secretKey = process.env.DOCUSIGN_SECRET_KEY;

    if (!integrationKey || !secretKey) return null;

    const response = await fetch(`${DOCUSIGN_OAUTH_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${integrationKey}:${secretKey}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: storedToken.refresh_token,
      }),
    });

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text());
      return null;
    }

    const tokens = await response.json();

    // Update stored tokens in Supabase
    await saveOAuthToken({
      provider: 'docusign',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || storedToken.refresh_token,
      expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
    });

    console.log('DocuSign token refreshed successfully');
    return tokens.access_token;
  } catch (e) {
    console.error('Error refreshing token:', e);
    return null;
  }
}

// Type definitions
export interface DocuSignEnvelope {
  envelopeId: string;
  status: 'created' | 'sent' | 'delivered' | 'signed' | 'completed' | 'declined' | 'voided';
  emailSubject: string;
  sentDateTime?: string;
  deliveredDateTime?: string;
  completedDateTime?: string;
  declinedDateTime?: string;
  voidedDateTime?: string;
  statusChangedDateTime?: string;
  documentsUri?: string;
  recipientsUri?: string;
  envelopeUri?: string;
  sender?: {
    userName: string;
    email: string;
  };
}

export interface DocuSignRecipient {
  recipientId: string;
  recipientType: string;
  email: string;
  name: string;
  status: 'created' | 'sent' | 'delivered' | 'signed' | 'completed' | 'declined';
  signedDateTime?: string;
  deliveredDateTime?: string;
  declinedDateTime?: string;
  declinedReason?: string;
}

export interface DocuSignEnvelopeDetail extends DocuSignEnvelope {
  recipients?: {
    signers: DocuSignRecipient[];
    carbonCopies?: DocuSignRecipient[];
  };
  documents?: {
    documentId: string;
    name: string;
    type: string;
    order: string;
  }[];
  customFields?: {
    textCustomFields?: {
      name: string;
      value: string;
    }[];
  };
}

interface DocuSignListResponse {
  envelopes?: DocuSignEnvelope[];
  resultSetSize: string;
  totalSetSize: string;
  startPosition: string;
  endPosition: string;
  nextUri?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// JWT token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get access token - tries stored OAuth tokens first, then falls back to JWT Grant
async function getAccessToken(): Promise<string> {
  // 1. Check for stored OAuth tokens first (from Supabase)
  const storedTokens = await getStoredTokens();
  if (storedTokens) {
    console.log('Using stored OAuth access token');
    return storedTokens.access_token;
  }

  // 2. Try to refresh stored token if we have a refresh_token
  const refreshedToken = await refreshStoredToken();
  if (refreshedToken) {
    return refreshedToken;
  }

  // 3. Check JWT token cache (with 5 minute buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token;
  }

  // 4. Fall back to JWT Grant authentication
  const userId = process.env.DOCUSIGN_USER_ID;
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const privateKeyPem = process.env.DOCUSIGN_PRIVATE_KEY;

  if (!userId || !integrationKey || !privateKeyPem) {
    throw new Error(
      'DocuSign credentials not configured. Need DOCUSIGN_USER_ID, DOCUSIGN_INTEGRATION_KEY, and DOCUSIGN_PRIVATE_KEY'
    );
  }

  try {
    // Parse the private key - handle escaped newlines from env
    const formattedKey = privateKeyPem.replace(/\\n/g, '\n');

    // Import RSA private key (supports both PKCS#1 and PKCS#8 formats)
    const crypto = await import('crypto');
    const keyObject = crypto.createPrivateKey({
      key: formattedKey,
      format: 'pem',
    });

    // Convert to jose key
    const privateKey = await jose.importPKCS8(
      keyObject.export({ type: 'pkcs8', format: 'pem' }) as string,
      'RS256'
    );

    // Create JWT
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new jose.SignJWT({
      iss: integrationKey,
      sub: userId,
      aud: DOCUSIGN_OAUTH_URL.replace('https://', ''),
      iat: now,
      exp: now + 3600, // 1 hour
      scope: 'signature impersonation',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .sign(privateKey);

    // Exchange JWT for access token
    const tokenResponse = await fetch(`${DOCUSIGN_OAUTH_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('DocuSign token error:', errorText);

      // Check if it's a consent error
      if (errorText.includes('consent_required')) {
        const consentUrl = `${DOCUSIGN_OAUTH_URL}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${integrationKey}&redirect_uri=http://localhost:3000/api/docusign/callback`;
        throw new Error(
          `DocuSign consent required. User must grant consent at: ${consentUrl}`
        );
      }

      throw new Error(`DocuSign OAuth error (${tokenResponse.status}): ${errorText}`);
    }

    const tokenData: TokenResponse = await tokenResponse.json();

    // Cache the token
    cachedToken = {
      token: tokenData.access_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };

    return tokenData.access_token;
  } catch (error) {
    console.error('Error getting DocuSign access token:', error);
    throw error;
  }
}

// Helper to get auth headers
async function getHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

// Generic fetch helper
async function docusignFetch<T>(endpoint: string): Promise<T> {
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('DOCUSIGN_ACCOUNT_ID not configured');
  }

  const url = `${DOCUSIGN_BASE_URL}/restapi/v2.1/accounts/${accountId}${endpoint}`;

  const response = await fetch(url, {
    headers: await getHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DocuSign API error (${response.status}): ${error}`);
  }

  return response.json();
}

// List envelopes with optional filters
export async function listEnvelopes(options: {
  fromDate?: string;
  toDate?: string;
  status?: string;
  searchText?: string;
  count?: number;
} = {}): Promise<DocuSignEnvelope[]> {
  const params = new URLSearchParams();

  // Default to last 30 days if no date specified
  if (options.fromDate) {
    params.set('from_date', options.fromDate);
  } else {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    params.set('from_date', thirtyDaysAgo.toISOString());
  }

  if (options.toDate) {
    params.set('to_date', options.toDate);
  }

  if (options.status) {
    params.set('status', options.status);
  }

  if (options.searchText) {
    params.set('search_text', options.searchText);
  }

  params.set('count', String(options.count || 100));
  params.set('order', 'desc');
  params.set('order_by', 'status_changed');

  const result = await docusignFetch<DocuSignListResponse>(`/envelopes?${params}`);
  return result.envelopes || [];
}

// Get envelope details including recipients
export async function getEnvelope(envelopeId: string): Promise<DocuSignEnvelopeDetail> {
  const envelope = await docusignFetch<DocuSignEnvelopeDetail>(
    `/envelopes/${envelopeId}?include=recipients,documents,custom_fields`
  );
  return envelope;
}

// Get envelope recipients
export async function getEnvelopeRecipients(envelopeId: string): Promise<{
  signers: DocuSignRecipient[];
  carbonCopies?: DocuSignRecipient[];
}> {
  return docusignFetch(`/envelopes/${envelopeId}/recipients`);
}

// Get URL to view envelope in DocuSign web interface
export function getEnvelopeViewUrl(envelopeId: string): string {
  // DocuSign web interface URL format
  const baseUrl = DOCUSIGN_BASE_URL.includes('demo')
    ? 'https://appdemo.docusign.com'
    : 'https://app.docusign.com';
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  return `${baseUrl}/documents/details/${envelopeId}`;
}

// Get document download URL (returns the combined PDF)
export async function getDocumentDownload(envelopeId: string, documentId: string = 'combined'): Promise<Buffer> {
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('DOCUSIGN_ACCOUNT_ID not configured');
  }

  const url = `${DOCUSIGN_BASE_URL}/restapi/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/${documentId}`;
  const token = await getAccessToken();

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/pdf',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DocuSign document download error (${response.status}): ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Extract customer name and type from DocuSign envelope subject
export function extractCustomerFromSubject(subject: string): { customer: string; type: 'project' | 'mcc' } | null {
  // Project pattern: "Please DocuSign: [Customer Name] MARS Project Final Acceptance"
  const projectMatch = subject.match(/Please DocuSign:\s*(.+?)\s*MARS Project Final Acceptance/i);
  if (projectMatch) {
    return { customer: projectMatch[1].trim(), type: 'project' };
  }

  // MCC pattern: "Complete with Docusign: [Customer Name] MCC Work Order Acceptance"
  const mccMatch = subject.match(/Complete with Docusign:\s*(.+?)\s*MCC Work Order Acceptance/i);
  if (mccMatch) {
    return { customer: mccMatch[1].trim(), type: 'mcc' };
  }

  return null;
}

// Check if DocuSign is properly configured
export function isDocuSignConfigured(): boolean {
  return !!(
    process.env.DOCUSIGN_USER_ID &&
    process.env.DOCUSIGN_INTEGRATION_KEY &&
    process.env.DOCUSIGN_PRIVATE_KEY &&
    process.env.DOCUSIGN_ACCOUNT_ID
  );
}

// Helper to get status color
export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
    case 'signed':
      return '#22C55E'; // Green
    case 'sent':
    case 'delivered':
      return '#F59E0B'; // Yellow/Orange
    case 'created':
      return '#8B5CF6'; // Purple
    case 'declined':
    case 'voided':
      return '#EF4444'; // Red
    default:
      return '#64748B'; // Gray
  }
}

// Helper to get status label
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'signed':
      return 'Signed';
    case 'sent':
      return 'Sent';
    case 'delivered':
      return 'Delivered';
    case 'created':
      return 'Draft';
    case 'declined':
      return 'Declined';
    case 'voided':
      return 'Voided';
    default:
      return status;
  }
}

// Calculate envelope stats
export function calculateEnvelopeStats(envelopes: DocuSignEnvelope[]): {
  total: number;
  completed: number;
  pending: number;
  declined: number;
  voided: number;
  avgDaysToSign: number;
} {
  const stats = {
    total: envelopes.length,
    completed: 0,
    pending: 0,
    declined: 0,
    voided: 0,
    avgDaysToSign: 0,
  };

  let totalDays = 0;
  let completedCount = 0;

  envelopes.forEach(env => {
    switch (env.status) {
      case 'completed':
      case 'signed':
        stats.completed++;
        // Calculate days to sign
        if (env.sentDateTime && env.completedDateTime) {
          const sent = new Date(env.sentDateTime);
          const completed = new Date(env.completedDateTime);
          const days = Math.ceil((completed.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24));
          totalDays += days;
          completedCount++;
        }
        break;
      case 'sent':
      case 'delivered':
      case 'created':
        stats.pending++;
        break;
      case 'declined':
        stats.declined++;
        break;
      case 'voided':
        stats.voided++;
        break;
    }
  });

  if (completedCount > 0) {
    stats.avgDaysToSign = Math.round(totalDays / completedCount);
  }

  return stats;
}
