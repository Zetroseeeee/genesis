// A folder over HTTP on this machine, for the update drill and the update walk: whole files or the rest of one
// (Range: bytes=N-), optionally no faster than `rate` bytes a second so that progress can be seen.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
module.exports = function serve(root, rate) {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    const size = fs.statSync(file).size; const m = /^bytes=(\d+)-$/.exec(req.headers.range || ''); const start = m ? +m[1] : 0;
    if (start >= size && size > 0) { res.writeHead(416); return res.end(); }
    res.writeHead(m ? 206 : 200, Object.assign({ 'content-length': size - start, 'accept-ranges': 'bytes' }, m ? { 'content-range': `bytes ${start}-${size - 1}/${size}` } : {}));
    if (req.method === 'HEAD') return res.end();
    if (!rate) return fs.createReadStream(file, { start }).pipe(res);
    const fd = fs.openSync(file, 'r'); let pos = start; const step = Math.max(4096, Math.round(rate / 10)); const buf = Buffer.allocUnsafe(step);
    const tick = setInterval(() => { const n = fs.readSync(fd, buf, 0, Math.min(step, size - pos), pos); if (n > 0) { res.write(Buffer.from(buf.subarray(0, n))); pos += n; } if (pos >= size || n <= 0) { clearInterval(tick); fs.closeSync(fd); res.end(); } }, 100);
    res.on('close', () => { if (pos < size) { clearInterval(tick); try { fs.closeSync(fd); } catch (e) {} pos = size; } });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
};
