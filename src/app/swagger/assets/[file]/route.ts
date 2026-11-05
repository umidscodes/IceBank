import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const ALLOWED: Record<string, string> = {
  "swagger-ui.css": "text/css; charset=utf-8",
  "swagger-ui-bundle.js": "application/javascript; charset=utf-8",
};

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const type = ALLOWED[file];
  if (!type) return new Response("Not found", { status: 404 });
  const data = await fs.readFile(path.join(process.cwd(), "node_modules", "swagger-ui-dist", file));
  return new Response(data, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
}
