import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that require authentication
const protectedRoutes = [
  '/contracts-dashboard',
  '/mcc-dashboard',
  '/closeout-dashboard',
  '/pm-dashboard',
  '/contracts/review',
];

// Dashboard access by role
const DASHBOARD_ACCESS: Record<string, string[]> = {
  admin: ['contracts-dashboard', 'mcc-dashboard', 'closeout-dashboard', 'pm-dashboard', 'contracts/review'],
  sales: ['contracts-dashboard'],
  finance: ['mcc-dashboard', 'closeout-dashboard'],
  pm: ['closeout-dashboard', 'pm-dashboard'],
  legal: ['contracts/review'],
  viewer: [],
};

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Check if this is a protected route
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Redirect to login if not authenticated on protected routes
  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // If authenticated, check role-based access
  if (isProtectedRoute && user) {
    // Get user role from user_roles table
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const role = roleData?.role || 'viewer';

    // Check if user has access to this dashboard
    const allowedDashboards = DASHBOARD_ACCESS[role] || [];
    const hasAccess = allowedDashboards.some((d) => pathname.includes(d));

    if (!hasAccess) {
      // Redirect to home if no access
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  // Redirect to dashboard if already logged in and trying to access login
  if (pathname === '/login' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/contracts-dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (handle auth separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)',
  ],
};
