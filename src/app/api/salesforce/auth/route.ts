import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const SALESFORCE_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID!;

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE() {
  // Generate random code verifier (43-128 characters)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');

  // Generate code challenge using SHA-256
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

/**
 * Get the base URL for redirects
 */
function getBaseUrl(request: NextRequest): string {
  // Use NEXT_PUBLIC_VERCEL_URL or VERCEL_URL if available
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  // Fall back to request host
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

/**
 * Initiates OAuth 2.0 Web Server Flow with PKCE
 * Redirects user to Salesforce login page
 */
export async function GET(request: NextRequest) {
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com';
  const baseUrl = getBaseUrl(request);
  const redirectUri = `${baseUrl}/api/salesforce/callback`;

  // Generate PKCE values
  const { codeVerifier, codeChallenge } = generatePKCE();

  // Store code verifier in cookie for callback
  const isProduction = !baseUrl.includes('localhost');
  const cookieStore = await cookies();
  cookieStore.set('sf_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  const authUrl = new URL(`${loginUrl}/services/oauth2/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', SALESFORCE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'api refresh_token');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return NextResponse.redirect(authUrl.toString());
}
