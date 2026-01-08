import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { saveOAuthToken } from '@/lib/supabase';

const SALESFORCE_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID!;
const SALESFORCE_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET!;

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
 * OAuth callback - exchanges authorization code for tokens
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const baseUrl = getBaseUrl(request);
  const redirectUri = `${baseUrl}/api/salesforce/callback`;

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/contracts-dashboard?error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/contracts-dashboard?error=No authorization code received`
    );
  }

  try {
    const loginUrl = process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com';

    // Get code verifier from cookie (PKCE)
    const cookieStore = await cookies();
    const codeVerifier = cookieStore.get('sf_code_verifier')?.value;

    if (!codeVerifier) {
      console.error('Missing code verifier cookie');
      return NextResponse.redirect(
        `${baseUrl}/contracts-dashboard?error=Missing code verifier - please try again`
      );
    }

    // Exchange code for tokens (with PKCE code_verifier)
    const tokenResponse = await fetch(`${loginUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: SALESFORCE_CLIENT_ID,
        client_secret: SALESFORCE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return NextResponse.redirect(
        `${baseUrl}/contracts-dashboard?error=${encodeURIComponent('Token exchange failed')}`
      );
    }

    const tokens = await tokenResponse.json();

    // Save tokens to Supabase
    const saved = await saveOAuthToken({
      provider: 'salesforce',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      instance_url: tokens.instance_url,
      expires_at: new Date(Date.now() + 7200000).toISOString(), // 2 hours
    });

    if (!saved) {
      console.error('Failed to save tokens to Supabase');
      return NextResponse.redirect(
        `${baseUrl}/contracts-dashboard?error=${encodeURIComponent('Failed to save tokens')}`
      );
    }

    console.log('Salesforce tokens saved successfully to Supabase!');
    console.log('Instance URL:', tokens.instance_url);

    // Redirect back to dashboard with success
    return NextResponse.redirect(
      `${baseUrl}/contracts-dashboard?salesforce=connected`
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      `${baseUrl}/contracts-dashboard?error=${encodeURIComponent('Authentication failed')}`
    );
  }
}
