// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Log de inicio
  console.log("Middleware START:", pathname);

  // Permitir archivos estáticos y rutas públicas sin auth
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    console.log("Middleware END: Public path/Bypass");
    return NextResponse.next();
  }

  const secretExists = !!process.env.NEXTAUTH_SECRET;
  console.log(`Middleware CHECK: NEXTAUTH_SECRET exists? ${secretExists}`);

  if (!secretExists) {
    console.error(
      "CRITICAL ERROR: NEXTAUTH_SECRET is MISSING in Edge Runtime!",
    );
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // 4. Log del Token
  console.log(
    `Middleware CHECK: Token status -> ${token ? "Authenticated" : "Unauthenticated"}`,
  );

  if (!token) {
    // 5. Redirección
    console.log("Middleware END: Redirecting to /login");
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 6. Continuar
  console.log("Middleware END: Authorized access");
  return NextResponse.next();
}

// Configurar rutas donde se aplica middleware
export const config = {
  matcher: ["/((?!login|_next|api/auth|static).*)"], // bloquea todo excepto login y rutas internas Next
};
