export const dynamic = "force-static";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ice Bank API - Swagger UI</title>
  <link rel="stylesheet" href="/swagger/assets/swagger-ui.css" />
  <style>
    body { margin: 0; background: #F5F9FC; }
    .ib-bar { background: #0B2545; color: #fff; padding: 12px 20px; font: 600 16px system-ui, sans-serif; display: flex; gap: 16px; align-items: center; }
    .ib-bar a { color: #9fd0f0; font-weight: 500; font-size: 14px; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div class="ib-bar">Ice Bank API <a href="/">Back to Ice Bank</a> <a href="/api/v1/openapi.json">openapi.json</a> <a href="/mail" target="_blank">Ice Mail</a></div>
  <div id="swagger-ui" data-testid="swagger-ui"></div>
  <script src="/swagger/assets/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/v1/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      docExpansion: "list",
    });
  </script>
</body>
</html>`;

export function GET() {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
