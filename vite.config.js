import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'run-scraper-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/run-scraper' && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json');

            const remoteAddr = req.socket?.remoteAddress || '';
            if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddr)) {
              res.writeHead(403);
              res.end(JSON.stringify({ success: false, error: 'Forbidden: Localhost only' }));
              return;
            }
            
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            
            req.on('end', () => {
              let maxProducts = 10;
              let headless = true;
              try {
                const parsed = JSON.parse(body);
                if (parsed.maxProducts) maxProducts = parsed.maxProducts;
                if (parsed.headless !== undefined) headless = parsed.headless;
              } catch {}

              const safeMax = String(Math.min(50, Math.max(1, parseInt(maxProducts, 10) || 10)));
              const safeHeadless = headless === false ? 'false' : 'true';
              console.log(`🚀 [Vite Backend API] Kích hoạt cào an toàn: MAX=${safeMax}, HEADLESS=${safeHeadless}`);
              
              // Thực thi qua execFile không qua shell để chống Command Injection (RCE)
              execFile(
                process.execPath,
                ['scripts/playwright_ai_scraper.js'],
                {
                  cwd: process.cwd(),
                  env: {
                    ...process.env,
                    MAX_PRODUCTS: safeMax,
                    HEADLESS: safeHeadless
                  }
                },
                (error) => {
                  if (error) {
                    console.error(`❌ [Vite Backend API] Lỗi cào ngầm:`, error.message);
                  } else {
                    console.log(`✅ [Vite Backend API] Tiến trình cào ngầm hoàn tất!`);
                  }
                }
              );

              res.writeHead(200);
              res.end(JSON.stringify({ success: true, message: 'Đã kích hoạt cào ngầm.' }));
            });
          } else {
            next();
          }
        });
      }
    }
  ],
  build: {
    chunkSizeWarningLimit: 1000
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      // Điện thoại qua tunnel gọi /api/price → price-api trên Mac (gắn key server-side).
      '/api/price': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/price/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            try {
              const key = fs.readFileSync(path.join(os.homedir(), '.config/tavy/price-api.key'), 'utf8').trim();
              proxyReq.setHeader('x-api-key', key);
            } catch {}
          });
        }
      }
    }
  }
})
