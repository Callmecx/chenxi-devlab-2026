import { createServer, request as proxyRequest } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist");
const port = Number(process.env.PORT || 4173);
const base = process.env.BASE_PATH || "/";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".md": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, `http://127.0.0.1:${port}`).pathname,
    );
    if (pathname.startsWith('/api/v1/')) {
      const upstream=proxyRequest({hostname:'127.0.0.1',port:Number(process.env.API_PORT||4016),path:req.url,method:req.method,headers:req.headers,timeout:10000},reply=>{
        res.writeHead(reply.statusCode||502,reply.headers);reply.pipe(res);
      });
      upstream.on('timeout',()=>upstream.destroy(new Error('timeout')));
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message:'本地演示服务未连接。请启动 npm run dev:api。'}}));});
      req.pipe(upstream);return;
    }
    if (!pathname.startsWith(base)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let file = resolve(root, "." + "/" + pathname.slice(base.length));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${port}${base}`),
);
