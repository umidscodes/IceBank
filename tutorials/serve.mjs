// Ice Bank tutorial site: a tiny static file server with no dependencies.
//   npm run tutorials             -> http://localhost:4000
//   PORT=4100 node tutorials/serve.mjs
// Only files inside this folder are served. Directory traversal, encoded slashes, null bytes and
// symlinks that point outside the folder are rejected.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "localhost";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

/** Map a request URL to a file inside ROOT, or return null if it is not allowed. */
function resolveFile(rawUrl) {
  let pathname;
  try {
    pathname = new URL(rawUrl, "http://localhost").pathname;
  } catch {
    return null;
  }
  // Reject encoded separators before decoding, so "%2e%2e%2f" style tricks never reach the filesystem.
  if (/%2f|%5c|%00/i.test(pathname)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter(Boolean);
  // No "..", no hidden files or folders (.git, .env, ...).
  if (segments.some((s) => s === ".." || s.startsWith("."))) return null;
  if (decoded.endsWith("/") || segments.length === 0) segments.push("index.html");
  const candidate = path.resolve(ROOT, ...segments);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;
  return candidate;
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed\n", { Allow: "GET, HEAD" });
  }
  const file = resolveFile(req.url || "/");
  if (!file) return send(res, 400, "Bad Request\n");

  fs.realpath(file, (err, real) => {
    if (err) return send(res, 404, "Not Found\n");
    if (real !== ROOT && !real.startsWith(ROOT + path.sep)) return send(res, 403, "Forbidden\n");
    fs.stat(real, (statErr, stat) => {
      if (statErr) return send(res, 404, "Not Found\n");
      if (stat.isDirectory()) {
        // Redirect /folder to /folder/ so relative links inside it work.
        const pathname = new URL(req.url || "/", "http://localhost").pathname;
        if (!pathname.endsWith("/")) return send(res, 301, "Moved\n", { Location: pathname + "/" });
        return send(res, 404, "Not Found\n");
      }
      if (!stat.isFile()) return send(res, 404, "Not Found\n");
      const type = TYPES[path.extname(real).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": stat.size,
        "Cache-Control": "no-cache",
        "Last-Modified": stat.mtime.toUTCString(),
        ...SECURITY_HEADERS,
      });
      if (req.method === "HEAD") return res.end();
      const stream = fs.createReadStream(real);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    });
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Close the other program or run with another port, e.g. PORT=4001.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Ice Bank tutorials: http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop.");
});
