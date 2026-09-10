import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'

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

              console.log(`🚀 [Vite Backend API] Kích hoạt cào: MAX=${maxProducts}, HEADLESS=${headless}`);
              
              // Chạy lệnh trong terminal cục bộ chạy ngầm
              const cmd = `export MAX_PRODUCTS=${maxProducts} HEADLESS=${headless} && node scripts/playwright_ai_scraper.js`;
              exec(cmd, (error, stdout, stderr) => {
                if (error) {
                  console.error(`❌ [Vite Backend API] Lỗi cào ngầm:`, error);
                } else {
                  console.log(`✅ [Vite Backend API] Tiến trình cào ngầm hoàn tất!`);
                }
              });

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
    host: true,
    port: 3000,
    strictPort: true
  }
})
