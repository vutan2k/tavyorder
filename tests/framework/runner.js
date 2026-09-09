/**
 * Lightweight Zero-Dependency Test Runner Framework for TAVY KOREA
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Internal State
let currentTier = 'Tier 1: Feature Coverage';
let currentFile = '';
const testRegistry = [];

const KNOWN_TIERS = [
  { id: 'tier1', name: 'Tier 1: Feature Coverage', dir: 'tier1' },
  { id: 'tier2', name: 'Tier 2: Boundary & Corner Cases', dir: 'tier2' },
  { id: 'tier3', name: 'Tier 3: Pairwise Integration', dir: 'tier3' },
  { id: 'tier4', name: 'Tier 4: Real-World Scenarios', dir: 'tier4' },
];

/**
 * Set current tier name for registered tests.
 * @param {string} tierName
 */
export function setTier(tierName) {
  currentTier = tierName;
}

/**
 * Register a test case.
 * @param {string} name - Name/description of the test
 * @param {Function} testFn - Sync or async test function
 * @param {Object} [options]
 */
export function test(name, testFn, options = {}) {
  testRegistry.push({
    name,
    testFn,
    tier: options.tier || currentTier,
    file: currentFile,
  });
}

/**
 * Group tests under a suite or tier scope.
 * @param {string} suiteName
 * @param {Function} fn
 */
export function describe(suiteName, fn) {
  const previousTier = currentTier;
  currentTier = suiteName;
  try {
    fn();
  } finally {
    currentTier = previousTier;
  }
}

/**
 * Clear test registry.
 */
export function clearTests() {
  testRegistry.length = 0;
}

/**
 * Helper to truncate and pad strings for fixed-width ASCII tables.
 */
function pad(str, width, align = 'left') {
  const s = String(str ?? '');
  if (s.length > width) {
    return width > 3 ? s.slice(0, width - 3) + '...' : s.slice(0, width);
  }
  const spaces = ' '.repeat(width - s.length);
  return align === 'right' ? spaces + s : s + spaces;
}

/**
 * Discover test files in a given directory.
 * @param {string} dirPath
 * @returns {string[]} absolute paths to .js test files
 */
function discoverFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...discoverFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.test.js'))) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

/**
 * Main discovery & execution runner function.
 * @param {Object} [options]
 * @param {boolean} [options.exit=true] - Whether to call process.exit()
 * @param {string} [options.testsDir] - Base tests directory
 */
export async function runAllTests(options = {}) {
  const shouldExit = options.exit !== false;
  const testsDir = options.testsDir || path.resolve(__dirname, '..');

  clearTests();
  const startTime = performance.now();

  console.log('\n' + '='.repeat(80));
  console.log('  TAVY KOREA E2E TEST RUNNER');
  console.log('='.repeat(80));

  // Step 1: Discover & Load Test Files by Tier
  const tierFilesMap = new Map();

  for (const tierConfig of KNOWN_TIERS) {
    const tierDirPath = path.join(testsDir, tierConfig.dir);
    const files = discoverFiles(tierDirPath);
    tierFilesMap.set(tierConfig.name, files);
  }

  // Load test files dynamically
  for (const tierConfig of KNOWN_TIERS) {
    const files = tierFilesMap.get(tierConfig.name) || [];
    currentTier = tierConfig.name;

    for (const filePath of files) {
      currentFile = path.relative(testsDir, filePath);
      try {
        const fileUrl = pathToFileURL(filePath).href;
        await import(fileUrl);
      } catch (err) {
        console.error(`❌ Failed to import test file ${currentFile}:`, err);
        test(`[IMPORT ERROR] ${currentFile}`, () => {
          throw err;
        });
      }
    }
  }

  // Dynamic Load: Standalone Security Defense Suite (R1-R5)
  const secTestPath = path.join(testsDir, 'security_defense.test.js');
  if (fs.existsSync(secTestPath)) {
    currentFile = 'security_defense.test.js';
    currentTier = 'Tier 5: Security Defense Suite (R1-R5)';
    try {
      await import(pathToFileURL(secTestPath).href);
    } catch (err) {
      console.error(`❌ Failed to import test file ${currentFile}:`, err);
      test(`[IMPORT ERROR] ${currentFile}`, () => {
        throw err;
      });
    }
  }

  // Group tests by Tier
  const tierGroups = new Map();
  for (const tierConfig of KNOWN_TIERS) {
    tierGroups.set(tierConfig.name, []);
  }

  for (const testCase of testRegistry) {
    let group = tierGroups.get(testCase.tier);
    if (!group) {
      group = [];
      tierGroups.set(testCase.tier, group);
    }
    group.push(testCase);
  }

  const failures = [];
  const tierSummary = [];
  let totalExecuted = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  // Step 2: Execute Tests per Tier and print tabular results
  for (const [tierName, testCases] of tierGroups.entries()) {
    console.log('\n' + '='.repeat(80));
    console.log(`  ${tierName.toUpperCase()} (${testCases.length} Test Cases)`);
    console.log('='.repeat(80));

    if (testCases.length === 0) {
      console.log('  (No test cases found for this tier)');
      tierSummary.push({
        tier: tierName,
        passed: 0,
        failed: 0,
        total: 0,
        durationMs: 0,
      });
      continue;
    }

    const colStatus = 8;
    const colName = 55;
    const colDuration = 10;

    const topBorder = `┌${'─'.repeat(colStatus)}┬${'─'.repeat(colName)}┬${'─'.repeat(colDuration)}┐`;
    const headerRow = `│${pad(' Status', colStatus)}│${pad(' Test Name', colName)}│${pad(' Duration', colDuration, 'right')} │`;
    const midBorder = `├${'─'.repeat(colStatus)}┼${'─'.repeat(colName)}┼${'─'.repeat(colDuration)}┤`;
    const botBorder = `└${'─'.repeat(colStatus)}┴${'─'.repeat(colName)}┴${'─'.repeat(colDuration)}┘`;

    console.log(topBorder);
    console.log(headerRow);
    console.log(midBorder);

    let tierPassed = 0;
    let tierFailed = 0;
    const tierStart = performance.now();

    for (const t of testCases) {
      totalExecuted++;
      const tStart = performance.now();
      let status = 'PASS';
      let error = null;

      try {
        await t.testFn();
        tierPassed++;
        totalPassed++;
      } catch (err) {
        status = 'FAIL';
        tierFailed++;
        totalFailed++;
        error = err;
        failures.push({
          tier: t.tier,
          name: t.name,
          file: t.file,
          error,
        });
      }

      const tDuration = performance.now() - tStart;
      const durStr = `${tDuration.toFixed(1)}ms`;
      const statusPadded = status === 'PASS' ? ' PASS ' : ' FAIL ';
      console.log(`│${pad(statusPadded, colStatus)}│${pad(' ' + t.name, colName)}│${pad(durStr, colDuration, 'right')} │`);
    }

    console.log(botBorder);

    const tierDuration = performance.now() - tierStart;
    tierSummary.push({
      tier: tierName,
      passed: tierPassed,
      failed: tierFailed,
      total: testCases.length,
      durationMs: tierDuration,
    });
  }

  const overallDuration = performance.now() - startTime;

  // Step 3: Print Tier Summary Table
  console.log('\n' + '='.repeat(80));
  console.log('  SUMMARY TABLE PER TIER');
  console.log('='.repeat(80));

  const cTier = 40;
  const cPass = 10;
  const cFail = 10;
  const cTot = 9;
  const cDur = 10;

  const sTopBorder = `┌${'─'.repeat(cTier)}┬${'─'.repeat(cPass)}┬${'─'.repeat(cFail)}┬${'─'.repeat(cTot)}┬${'─'.repeat(cDur)}┐`;
  const sHeader    = `│${pad(' Tier Name', cTier)}│${pad(' Passed', cPass, 'right')} │${pad(' Failed', cFail, 'right')} │${pad(' Total', cTot, 'right')} │${pad(' Duration', cDur, 'right')} │`;
  const sMidBorder = `├${'─'.repeat(cTier)}┼${'─'.repeat(cPass)}┼${'─'.repeat(cFail)}┼${'─'.repeat(cTot)}┼${'─'.repeat(cDur)}┤`;
  const sBotBorder = `└${'─'.repeat(cTier)}┴${'─'.repeat(cPass)}┴${'─'.repeat(cFail)}┴${'─'.repeat(cTot)}┴${'─'.repeat(cDur)}┘`;

  console.log(sTopBorder);
  console.log(sHeader);
  console.log(sMidBorder);

  for (const s of tierSummary) {
    const tierPadded = ' ' + s.tier;
    const durStr = `${s.durationMs.toFixed(1)}ms`;
    console.log(
      `│${pad(tierPadded, cTier)}│${pad(String(s.passed), cPass, 'right')} │${pad(String(s.failed), cFail, 'right')} │${pad(String(s.total), cTot, 'right')} │${pad(durStr, cDur, 'right')} │`
    );
  }

  console.log(sMidBorder);
  const totalDurStr = `${overallDuration.toFixed(1)}ms`;
  console.log(
    `│${pad(' TOTAL ALL TIERS', cTier)}│${pad(String(totalPassed), cPass, 'right')} │${pad(String(totalFailed), cFail, 'right')} │${pad(String(totalExecuted), cTot, 'right')} │${pad(totalDurStr, cDur, 'right')} │`
  );
  console.log(sBotBorder);

  // Step 4: Print Failure Details if any
  if (failures.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`  FAILURE DETAILS (${failures.length} FAILED TEST${failures.length > 1 ? 'S' : ''})`);
    console.log('='.repeat(80));

    failures.forEach((f, idx) => {
      console.log(`\n${idx + 1}) [${f.tier}] ${f.name}`);
      if (f.file) console.log(`   File: ${f.file}`);
      const errMessage = f.error && f.error.message ? f.error.message : String(f.error);
      console.log(`   Error: ${errMessage}`);
      if (f.error && f.error.stack) {
        const stackLines = f.error.stack.split('\n').slice(1, 4).map(l => '   ' + l.trim()).join('\n');
        console.log(stackLines);
      }
    });
  }

  // Step 5: Overall Stats Summary
  console.log('\n' + '='.repeat(80));
  console.log('  OVERALL EXECUTION STATISTICS');
  console.log('='.repeat(80));
  console.log(`  Total Test Cases : ${totalExecuted}`);
  console.log(`  Passed           : ${totalPassed}`);
  console.log(`  Failed           : ${totalFailed}`);
  console.log(`  Duration         : ${overallDuration.toFixed(2)} ms`);
  const statusStr = totalFailed === 0 ? 'SUCCESS (Exit Code 0)' : `FAILED (${totalFailed} failure(s) - Exit Code 1)`;
  console.log(`  Result           : ${statusStr}`);
  console.log('='.repeat(80) + '\n');

  const stats = {
    total: totalExecuted,
    passed: totalPassed,
    failed: totalFailed,
    durationMs: overallDuration,
    tierSummary,
  };

  if (shouldExit) {
    process.exit(totalFailed === 0 ? 0 : 1);
  }

  return stats;
}

/**
 * Executes all currently registered tests without re-discovering or clearing registry.
 * Designed for standalone single-file test runs (e.g. node tests/security_defense.test.js).
 * @param {Object} [options]
 * @param {boolean} [options.exit=true]
 */
export async function runRegisteredTests(options = {}) {
  const shouldExit = options.exit !== false;
  const startTime = performance.now();

  console.log('\n' + '='.repeat(80));
  console.log('  TAVY KOREA STANDALONE TEST SUITE RUNNER');
  console.log('='.repeat(80));

  const tierGroups = new Map();
  for (const testCase of testRegistry) {
    let group = tierGroups.get(testCase.tier);
    if (!group) {
      group = [];
      tierGroups.set(testCase.tier, group);
    }
    group.push(testCase);
  }

  const failures = [];
  let totalExecuted = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const [tierName, testCases] of tierGroups.entries()) {
    console.log('\n' + '='.repeat(80));
    console.log(`  ${tierName.toUpperCase()} (${testCases.length} Test Cases)`);
    console.log('='.repeat(80));

    const colStatus = 8;
    const colName = 55;
    const colDuration = 10;

    const topBorder = `┌${'─'.repeat(colStatus)}┬${'─'.repeat(colName)}┬${'─'.repeat(colDuration)}┐`;
    const headerRow = `│${pad(' Status', colStatus)}│${pad(' Test Name', colName)}│${pad(' Duration', colDuration, 'right')} │`;
    const midBorder = `├${'─'.repeat(colStatus)}┼${'─'.repeat(colName)}┼${'─'.repeat(colDuration)}┤`;
    const botBorder = `└${'─'.repeat(colStatus)}┴${'─'.repeat(colName)}┴${'─'.repeat(colDuration)}┘`;

    console.log(topBorder);
    console.log(headerRow);
    console.log(midBorder);

    for (const t of testCases) {
      totalExecuted++;
      const tStart = performance.now();
      let status = 'PASS';
      let error = null;

      try {
        await t.testFn();
        totalPassed++;
      } catch (err) {
        status = 'FAIL';
        totalFailed++;
        error = err;
        failures.push({
          tier: t.tier,
          name: t.name,
          file: t.file,
          error,
        });
      }

      const tDuration = performance.now() - tStart;
      const durStr = `${tDuration.toFixed(1)}ms`;
      const statusPadded = status === 'PASS' ? ' PASS ' : ' FAIL ';
      console.log(`│${pad(statusPadded, colStatus)}│${pad(' ' + t.name, colName)}│${pad(durStr, colDuration, 'right')} │`);
    }

    console.log(botBorder);
  }

  const overallDuration = performance.now() - startTime;

  if (failures.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`  FAILURE DETAILS (${failures.length} FAILED TEST${failures.length > 1 ? 'S' : ''})`);
    console.log('='.repeat(80));

    failures.forEach((f, idx) => {
      console.log(`\n${idx + 1}) [${f.tier}] ${f.name}`);
      if (f.file) console.log(`   File: ${f.file}`);
      const errMessage = f.error && f.error.message ? f.error.message : String(f.error);
      console.log(`   Error: ${errMessage}`);
      if (f.error && f.error.stack) {
        const stackLines = f.error.stack.split('\n').slice(1, 4).map(l => '   ' + l.trim()).join('\n');
        console.log(stackLines);
      }
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('  OVERALL EXECUTION STATISTICS');
  console.log('='.repeat(80));
  console.log(`  Total Test Cases : ${totalExecuted}`);
  console.log(`  Passed           : ${totalPassed}`);
  console.log(`  Failed           : ${totalFailed}`);
  console.log(`  Duration         : ${overallDuration.toFixed(2)} ms`);
  const statusStr = totalFailed === 0 ? 'SUCCESS (Exit Code 0)' : `FAILED (${totalFailed} failure(s) - Exit Code 1)`;
  console.log(`  Result           : ${statusStr}`);
  console.log('='.repeat(80) + '\n');

  if (shouldExit) {
    process.exit(totalFailed === 0 ? 0 : 1);
  }

  return {
    total: totalExecuted,
    passed: totalPassed,
    failed: totalFailed,
    durationMs: overallDuration,
  };
}
