import http from 'node:http';
import fs from 'node:fs/promises';
import {
  createReadStream
} from 'node:fs';
import {
  Readable
} from 'node:stream';
import path from 'node:path';
import {
  fileURLToPath
} from 'node:url';
import {
  generate
} from './generator.mjs';
import {
  recognizeText
} from './ocr.mjs';
const root = path.resolve(path.dirname(fileURLToPath(
  import.meta.url)), '../dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};
const model = process.env.WORLDLENS_OLLAMA_MODEL || '';

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  })
}
async function limited(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw Error('输入过大。');
  const chunks = [];
  let n = 0;
  for await (const chunk of request.body || []) {
    n += chunk.length;
    if (n > limit) throw Error('输入过大。');
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks);
}
export async function route(request) {
  const url = new URL(request.url);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return json(400, {
      error: '无效路径。'
    })
  }
  if (pathname.startsWith('/api/')) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return json(403, {
      error: '此服务只接收本机请求。'
    });
    if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json(403, {
      error: '来源不匹配。'
    });
    if (pathname === '/api/status' && request.method === 'GET') return json(200, {
      ollama: !!model
    });
    if (request.method !== 'POST') return json(405, {
      error: '请使用 POST。'
    });
    try {
      if (pathname === '/api/text') {
        if (request.headers.get('content-type') !== 'image/jpeg') return json(415, {
          error: '仅接受 JPEG。'
        });
        return json(200, {
          lines: await recognizeText(await limited(request, 3e6))
        })
      }
      if (pathname === '/api/analyze') {
        if (!model) return json(503, {
          error: '本机尚未配置 Ollama 视觉模型。'
        });
        if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, {
          error: '需要 JSON 数据。'
        });
        const data = JSON.parse((await limited(request, 8e6)).toString());
        const registry = JSON.parse(await fs.readFile(path.join(root, 'lenses/index.json'), 'utf8'));
        const lens = registry.find(l => l.id === data.lensId);
        if (!lens || !Array.isArray(data.images) || data.images.length < 1 || data.images.length > 3 || data.images.some(x => typeof x !== 'string' || !/^data:image\/jpeg;base64,\/9j\/[a-zA-Z0-9+/=]+$/.test(x))) return json(400, {
          error: '无效的照片或视角。'
        });
        const l = JSON.parse(await fs.readFile(path.join(root, lens.file), 'utf8'));
        return json(200, {
          model,
          result: await generate(l, String(data.context || '').slice(0, 1800), data.images, model)
        });
      }
      return json(404, {
        error: '未知入口。'
      });
    } catch (e) {
      return json(422, {
        error: String(e.message || '处理失败。').slice(0, 220)
      })
    }
  }
  if (!['GET', 'HEAD'].includes(request.method)) return json(405, {
    error: '请求方法不受支持。'
  });
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root + path.sep) || pathname.split('/').some(p => p.startsWith('.'))) return json(404, {
    error: '文件不存在。'
  });
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) return json(404, {
      error: '文件不存在。'
    });
    return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(target)), {
      headers: {
        'content-type': types[path.extname(target)] || 'application/octet-stream',
        'content-length': String(stat.size),
        'x-content-type-options': 'nosniff'
      }
    })
  } catch {
    return json(404, {
      error: '文件不存在。'
    })
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(
    import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '127.0.0.1:' + port;
      const request = new Request(new URL(req.url, 'http://' + host), {
        method: req.method,
        headers: req.headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? {
          body: Readable.toWeb(req),
          duplex: 'half'
        } : {})
      });
      const out = await route(request);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      if (out.body) Readable.fromWeb(out.body).pipe(res);
      else res.end();
    } catch {
      res.writeHead(400);
      res.end('Bad request')
    }
  }).listen(port, '127.0.0.1', () => console.log('WorldLens  http://127.0.0.1:' + port));
}