#!/usr/bin/env node
/**
 * copy_product_images.js
 * Copy main_thumbnail từ Desktop/oliveyoung_ranking vào dist/products/
 * Chạy sau mỗi `vite build`
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SRC_DIR = join(homedir(), 'Desktop', 'oliveyoung_ranking');
const DEST_DIR = join(process.cwd(), 'dist', 'products');

if (!existsSync(SRC_DIR)) {
  console.log('[copy_product_images] Source dir not found, skipping:', SRC_DIR);
  process.exit(0);
}

mkdirSync(DEST_DIR, { recursive: true });

let ok = 0;
const folders = readdirSync(SRC_DIR).filter(f => f.startsWith('top_'));

for (const folder of folders) {
  const parts = folder.split('_');
  const goodsNo = parts[parts.length - 1];
  
  for (const ext of ['jpg', 'png']) {
    const src = join(SRC_DIR, folder, `main_thumbnail.${ext}`);
    if (existsSync(src)) {
      copyFileSync(src, join(DEST_DIR, `${goodsNo}.${ext}`));
      ok++;
      break;
    }
  }
}

// Copy any additional images from public/products/ (e.g. newly ingested products)
const PUB_DIR = join(process.cwd(), 'public', 'products');
if (existsSync(PUB_DIR)) {
  const pubFiles = readdirSync(PUB_DIR);
  for (const pf of pubFiles) {
    const srcFile = join(PUB_DIR, pf);
    if (statSync(srcFile).isFile()) {
      const destFile = join(DEST_DIR, pf);
      copyFileSync(srcFile, destFile);
      ok++;
    }
  }
}

console.log(`[copy_product_images] Copied ${ok} product images to dist/products/`);
