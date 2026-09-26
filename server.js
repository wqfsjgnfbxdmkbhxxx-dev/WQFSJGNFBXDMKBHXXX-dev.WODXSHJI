// EPhone 联机服务：静态页面与 WebSocket 共用一个端口。
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { createOnlineService } = require('./online-service');

const PORT = process.env.PORT || 8080;
const STATIC_ROOT = __dirname;
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end('Method Not Allowed');
        return;
    }
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (_) {
        res.writeHead(400); res.end('Bad Request'); return;
    }
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const segments = relativePath.split(/[\\/]/);
    // 不把服务端代码、仓库元数据或运行数据作为网页公开。
    if (segments.some(part => part.startsWith('.')) ||
        ['server.js', 'online-service.js', 'package.json', 'package-lock.json'].includes(relativePath) ||
        ['node_modules', 'online-data', 'tests'].includes(segments[0])) {
        res.writeHead(403); res.end('Forbidden'); return;
    }
    const filePath = path.resolve(STATIC_ROOT, relativePath);
    if (filePath !== STATIC_ROOT && !filePath.startsWith(`${STATIC_ROOT}${path.sep}`)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.stat(filePath, (error, stats) => {
        if (error || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found'); return;
        }
        const extension = path.extname(filePath).toLowerCase();
        const noCache = extension === '.html' || relativePath === 'sw.js' || relativePath === 'manifest.json';
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
            'Content-Length': stats.size,
            'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600'
        });
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(filePath).pipe(res);
    });
});

const wss = new WebSocket.Server({ server, maxPayload: 1024 * 1024 });
const onlineService = createOnlineService(wss);
server.listen(PORT, '0.0.0.0', () => {
    console.log(`联机服务器启动：HTTP/WebSocket 端口 ${PORT}`);
    console.log(`在线数据目录：${onlineService.dataDir}`);
});

let shuttingDown = false;
function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    onlineService.broadcastShutdown();
    wss.close(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
