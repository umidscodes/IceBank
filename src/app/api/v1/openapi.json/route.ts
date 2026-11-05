import { NextResponse } from "next/server";
import { openApiDocument } from "@/server/openapi/document";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(openApiDocument(), { headers: { "X-Request-Id": crypto.randomUUID() } });
}
