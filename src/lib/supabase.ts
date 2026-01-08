/**
 * Supabase Client Configuration
 * Provides client and server-side Supabase access
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client-side Supabase client (uses anon key, respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (uses service role key, bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Types for our database tables
export interface OAuthToken {
  id?: string;
  provider: 'docusign' | 'salesforce';
  access_token: string;
  refresh_token?: string;
  instance_url?: string; // For Salesforce
  expires_at: string;
  updated_at?: string;
}

export interface UserRole {
  user_id: string;
  role: 'admin' | 'sales' | 'finance' | 'pm' | 'legal' | 'viewer';
  created_at?: string;
}

// Dashboard access by role
export const DASHBOARD_ACCESS: Record<string, string[]> = {
  admin: ['contracts-dashboard', 'mcc-dashboard', 'closeout-dashboard', 'pm-dashboard', 'contracts/review'],
  sales: ['contracts-dashboard'],
  finance: ['mcc-dashboard', 'closeout-dashboard'],
  pm: ['closeout-dashboard', 'pm-dashboard'],
  legal: ['contracts/review'],
  viewer: [],
};

/**
 * Get OAuth token from database
 */
export async function getOAuthToken(provider: 'docusign' | 'salesforce'): Promise<OAuthToken | null> {
  const { data, error } = await supabaseAdmin
    .from('oauth_tokens')
    .select('*')
    .eq('provider', provider)
    .single();

  if (error || !data) {
    console.log(`No ${provider} token found in database`);
    return null;
  }

  return data as OAuthToken;
}

/**
 * Save OAuth token to database
 */
export async function saveOAuthToken(token: OAuthToken): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('oauth_tokens')
    .upsert(
      {
        provider: token.provider,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        instance_url: token.instance_url,
        expires_at: token.expires_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider' }
    );

  if (error) {
    console.error('Error saving OAuth token:', error);
    return false;
  }

  return true;
}

/**
 * Get user role from database
 */
export async function getUserRole(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.role;
}

/**
 * Check if user can access a dashboard
 */
export function canAccessDashboard(role: string, dashboardPath: string): boolean {
  const allowedDashboards = DASHBOARD_ACCESS[role] || [];
  return allowedDashboards.some(d => dashboardPath.includes(d));
}

/**
 * Get Excel file from Supabase Storage
 */
export async function getExcelFromStorage(filename: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin
    .storage
    .from('data-files')
    .download(filename);

  if (error || !data) {
    console.error('Error downloading file from storage:', error);
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
