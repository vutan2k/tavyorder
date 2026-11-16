import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * API handler để cào sản phẩm Olive Young trực tiếp bằng oy_stealth_fetcher.py
 * Siêu nhẹ (~15MB RAM), bypass 100% Akamai WAF bằng TLS fingerprint Chrome 124.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const goodsNo = req.query?.goodsNo || req.body?.goodsNo;
  if (!goodsNo) {
    return res.status(400).json({ error: 'Missing goodsNo parameter' });
  }

  const scriptPath = '/Users/tan/Projects/scripts/oy_stealth_fetcher.py';

  return new Promise((resolve) => {
    const pythonProc = spawn('python3', [scriptPath, goodsNo], {
      env: { ...process.env, PYTHONPATH: '' }
    });

    let stdoutData = '';
    let stderrData = '';

    pythonProc.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    pythonProc.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    pythonProc.on('close', (code) => {
      if (code !== 0) {
        res.status(500).json({
          success: false,
          error: `Fetcher process exited with code ${code}`,
          stderr: stderrData
        });
        return resolve();
      }

      try {
        const result = JSON.parse(stdoutData.trim());
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({
          success: false,
          error: 'Failed to parse fetcher JSON output',
          raw: stdoutData
        });
      }
      return resolve();
    });
  });
}
