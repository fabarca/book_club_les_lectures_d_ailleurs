import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8080);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};
const DEFAULT_MIME_TYPE = "application/octet-stream";

function resolveRequestPath(requestUrl) {
  const decodedPath = decodeURIComponent(requestUrl.split("?")[0]);
  const relativePath = decodedPath === "/" ? "/index.html" : decodedPath;
  const resolvedPath = path.normalize(path.join(ROOT, relativePath));
  if (!resolvedPath.startsWith(ROOT)) return null;
  return resolvedPath;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[extension] ?? DEFAULT_MIME_TYPE;
  return mimeType;
}

async function handleRequest(req, res) {
  const resolvedPath = resolveRequestPath(req.url);
  if (!resolvedPath) {
    res.writeHead(400).end("Bad request");
    return;
  }

  try {
    const fileStat = await stat(resolvedPath);
    if (!fileStat.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const body = await readFile(resolvedPath);
    const mimeType = getMimeType(resolvedPath);
    res.writeHead(200, { "Content-Type": mimeType, "Cache-Control": "no-store" });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(500).end("Internal server error");
  }
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error("static-server error:", error);
    res.writeHead(500).end("Internal server error");
  });
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
});
