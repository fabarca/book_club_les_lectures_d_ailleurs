// Workaround for this sandbox's authenticated proxy: npm's own proxy-auth
// handling fails with "407 Proxy Authentication Required" against
// $http_proxy/$https_proxy even with fresh credentials, while Node's native
// fetch (undici) authenticates against the same proxy successfully. This
// relay does the authenticated upstream CONNECT itself (the part that
// works) and exposes a plain, unauthenticated local proxy that npm can use
// without hitting its own bug.
//
// Only needed for one-off npm registry access in this environment (e.g.
// `npm install` for a new dependency, or `npx playwright install <browser>`)
// — routine `npm test`/`npm run build` need no network access at all.
//
// Usage:
//   node scripts/npm-proxy-relay.mjs [port] &
//   RELAY_PID=$!
//   npm install --save-dev <pkg> --proxy=http://127.0.0.1:<port> --https-proxy=http://127.0.0.1:<port> --cache "$TMPDIR/npm-cache"
//   kill $RELAY_PID
//
// (--cache is also required: this sandbox's npm cache under ~/.npm/_cacache
// is read-only, so it must be redirected to a writable directory such as
// $TMPDIR/npm-cache.)

import http from "node:http";
import net from "node:net";
import { URL } from "node:url";

const upstreamProxyUrl = process.env.https_proxy || process.env.http_proxy;
if (!upstreamProxyUrl) {
  console.error("No $https_proxy/$http_proxy set — nothing to relay to.");
  process.exit(1);
}

const upstream = new URL(upstreamProxyUrl);
const upstreamCredentials = `${decodeURIComponent(upstream.username)}:${decodeURIComponent(upstream.password)}`;
const proxyAuthorizationHeader = "Basic " + Buffer.from(upstreamCredentials).toString("base64");

function relayToUpstream(req, clientSocket, head) {
  const upstreamSocket = net.connect(Number(upstream.port), upstream.hostname, () => {
    upstreamSocket.write(
      `CONNECT ${req.url} HTTP/1.1\r\n` +
        `Host: ${req.url}\r\n` +
        `Proxy-Authorization: ${proxyAuthorizationHeader}\r\n` +
        `\r\n`,
    );
  });

  let handshakeDone = false;
  let buffered = Buffer.alloc(0);

  upstreamSocket.on("data", (chunk) => {
    if (handshakeDone) return;
    buffered = Buffer.concat([buffered, chunk]);
    const headerEnd = buffered.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    handshakeDone = true;

    const statusLine = buffered.slice(0, buffered.indexOf("\r\n")).toString();
    const remainder = buffered.slice(headerEnd + 4);
    if (!/\s200\s/.test(statusLine)) {
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\nupstream said: ${statusLine}`);
      upstreamSocket.destroy();
      return;
    }

    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (remainder.length) clientSocket.write(remainder);
    if (head && head.length) upstreamSocket.write(head);
    clientSocket.pipe(upstreamSocket);
    upstreamSocket.pipe(clientSocket);
  });

  upstreamSocket.on("error", (error) => {
    clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n${error.message}`);
  });
  clientSocket.on("error", () => upstreamSocket.destroy());
}

const server = http.createServer((req, res) => {
  res.writeHead(405).end("This relay only supports CONNECT (HTTPS) tunneling.");
});

server.on("connect", relayToUpstream);

const port = Number(process.argv[2] || 8899);
server.listen(port, "127.0.0.1", () => {
  console.log(`npm-proxy-relay listening on 127.0.0.1:${port}, upstream ${upstream.hostname}:${upstream.port}`);
});
