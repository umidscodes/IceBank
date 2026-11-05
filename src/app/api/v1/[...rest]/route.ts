// Unknown /api/v1 paths return a problem+json 404 instead of the HTML not-found page.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function notFound(req: NextRequest) {
  return NextResponse.json(
    {
      type: "https://icebank.test/problems/not-found", title: "Not Found", status: 404,
      detail: `No endpoint matches ${req.method} ${req.nextUrl.pathname}. See /swagger.`, instance: req.nextUrl.pathname, code: "NOT_FOUND",
    },
    { status: 404, headers: { "Content-Type": "application/problem+json", "X-Request-Id": crypto.randomUUID() } },
  );
}

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
