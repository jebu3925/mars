import { NextResponse } from 'next/server';
import { getOAuthToken } from '@/lib/supabase';

export async function GET() {
  try {
    const token = await getOAuthToken('salesforce');

    if (!token) {
      return NextResponse.json({
        status: 'not_connected',
        message: 'No Salesforce token found in Supabase',
        env_check: {
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET',
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'NOT SET',
          SALESFORCE_CLIENT_ID: process.env.SALESFORCE_CLIENT_ID ? 'set' : 'NOT SET',
          SALESFORCE_CLIENT_SECRET: process.env.SALESFORCE_CLIENT_SECRET ? 'set' : 'NOT SET',
        }
      });
    }

    return NextResponse.json({
      status: 'connected',
      message: 'Salesforce token found!',
      token_info: {
        provider: token.provider,
        has_access_token: !!token.access_token,
        has_refresh_token: !!token.refresh_token,
        instance_url: token.instance_url,
        expires_at: token.expires_at,
        updated_at: token.updated_at,
      }
    });
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
      env_check: {
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET',
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'NOT SET',
      }
    });
  }
}
