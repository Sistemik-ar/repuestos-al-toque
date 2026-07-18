// TEMPORAL — solo para verificar Telegram desde esta máquina, donde IPv6 está roto
// (ENETUNREACH) y undici se cuelga en vez de caer a IPv4. No toca el código de producción.
import https from 'node:https';

globalThis.fetch = (url, init = {}) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { host: u.hostname, port: 443, path: u.pathname + u.search, method: init.method || 'GET', headers: init.headers || {}, family: 4 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => JSON.parse(body),
          text: async () => body,
        }));
      },
    );
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
