import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  attachRedshiftWebSocket,
  createRedshiftServerMiddleware,
} from './server/redshiftServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const apiMiddleware = createRedshiftServerMiddleware();

const server = http.createServer((req, res) => {
  apiMiddleware(req, res, () => {
    const urlPath = (req.url || '/').split('?')[0];
    if (fs.existsSync(distDir)) {
      const safePath = path
        .normalize(urlPath === '/' ? '/index.html' : urlPath)
        .replace(/^(\.\.[\/\\])+/, '');
      let filePath = path.join(distDir, safePath);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        filePath = path.join(distDir, 'index.html');
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Redshift Server Online. Run "npm run build" first to serve the web client.\n');
  });
});

attachRedshiftWebSocket(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Redshift] Online server running on http://0.0.0.0:${PORT}`);
});
