import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// Available roles
const VALID_ROLES = ['admin', 'sales', 'finance', 'pm', 'legal', 'viewer'];

// Dashboard access by role (for reference)
const DASHBOARD_ACCESS: Record<string, string[]> = {
  admin: ['/contracts-dashboard', '/mcc-dashboard', '/closeout-dashboard', '/pm-dashboard', '/contracts/review', '/admin'],
  sales: ['/contracts-dashboard'],
  finance: ['/mcc-dashboard', '/closeout-dashboard'],
  pm: ['/closeout-dashboard', '/pm-dashboard'],
  legal: ['/contracts/review'],
  viewer: [],
};

/**
 * GET - List all users with their roles
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // Get all users from auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error('Error fetching users:', authError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Get all user roles
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*');

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
    }

    // Map roles to users
    const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

    const users = authUsers.users.map(user => ({
      id: user.id,
      email: user.email,
      role: roleMap.get(user.id) || 'viewer',
      createdAt: user.created_at,
      lastSignIn: user.last_sign_in_at,
    }));

    return NextResponse.json({
      users,
      roles: VALID_ROLES,
      dashboardAccess: DASHBOARD_ACCESS,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST - Create a new user with role
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, role = 'viewer' } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role', validRoles: VALID_ROLES }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Create user in auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError) {
      console.error('Error creating user:', authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Assign role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role,
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
      // User was created but role assignment failed - try to clean up
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role,
      },
    });

  } catch (error) {
    console.error('Error in POST /api/admin/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH - Update user role
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json({ error: 'userId and role required' }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role', validRoles: VALID_ROLES }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Upsert role (insert if not exists, update if exists)
    const { error } = await supabase
      .from('user_roles')
      .upsert({
        user_id: userId,
        role,
      }, {
        onConflict: 'user_id',
      });

    if (error) {
      console.error('Error updating role:', error);
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      userId,
      role,
    });

  } catch (error) {
    console.error('Error in PATCH /api/admin/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE - Remove a user
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Delete role first
    await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    // Delete user from auth
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      console.error('Error deleting user:', error);
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      userId,
    });

  } catch (error) {
    console.error('Error in DELETE /api/admin/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
