#!/usr/bin/env node
/**
 * serve.mjs — oft/ 的零依赖静态服务器
 *
 * 接收端要调用摄像头，浏览器只允许在安全上下文（https:// 或 http://localhost）下这么做；
 * Service Worker（离线缓存）同样只在安全上下文里注册。所以在 oft/ 目录里执行：
 *
 *     node tools/serve.mjs           # 默认 http://localhost:8080
 *     node tools/serve.mjs 9000      # 指定端口
 *
 * 然后打开 http://localhost:8080/ —— 同局域网的手机可以访问
 * http://<本机 IP>:8080/receive.html，但 http 的局域网地址属于非安全上下文，
 * Chrome / Safari 会拒绝摄像头；跨设备正式使用请部署到 HTTPS。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = path.resolve(root, '.' + pathname);
  if (!target.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      // Service Worker 需要拿到最新文件，本地开发一律不缓存
      'cache-control': 'no-cache'
    });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(port, () => {
  const nets = os.networkInterfaces();
  const ips = Object.values(nets).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
  console.log('光学传输（oft）· 静态服务器已启动');
  console.log(`  首页      http://localhost:${port}/`);
  console.log(`  发送      http://localhost:${port}/send.html`);
  console.log(`  接收      http://localhost:${port}/receive.html`);
  console.log(`  原版接收  https://decimen.app/receive/`);
  if (ips.length) console.log(`  局域网    http://${ips[0]}:${port}/receive.html （非 HTTPS 时摄像头会被拒绝）`);
  console.log('  Ctrl+C 退出');
});
