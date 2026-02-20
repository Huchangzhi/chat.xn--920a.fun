import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (!process.env.APP_PASSWORD) {
    return NextResponse.next();
  }

  // 排除模型列表 API，不需要密码验证
  if (request.nextUrl.pathname === "/api/models") {
    return NextResponse.next();
  }

  const password = request.headers.get("Authorization");
  if (password !== process.env.APP_PASSWORD) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
