import { NextResponse, type NextRequest } from 'next/server';

// Only checks that a session cookie exists; the API validates the token itself on every call.
export function middleware(req: NextRequest) {
  const signedIn = req.cookies.has('token');
  const onLogin = req.nextUrl.pathname === '/login';
  if (!signedIn && !onLogin) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
