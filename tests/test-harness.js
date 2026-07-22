// tests/test-harness.js — 轻量测试框架（基于 Node.js assert）
const assert = require('assert');

let _suites = [];
let _currentSuite = '';
let _totalPassed = 0;
let _totalFailed = 0;
let _allFailures = [];

function describe(name, fn) {
  _currentSuite = name;
  fn();
  _currentSuite = '';
}

function test(name, fn) {
  _suites.push({ suite: _currentSuite, name, fn });
}

function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected, `Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected, `Expected ${JSON.stringify(actual)} to deeply equal ${JSON.stringify(expected)}`);
    },
    toBeTruthy() {
      assert.ok(actual, `Expected ${JSON.stringify(actual)} to be truthy`);
    },
    toBeFalsy() {
      assert.ok(!actual, `Expected ${JSON.stringify(actual)} to be falsy`);
    },
    toBeNull() {
      assert.strictEqual(actual, null, `Expected ${JSON.stringify(actual)} to be null`);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined, `Expected value to be defined`);
    },
    toBeGreaterThan(n) {
      assert.ok(actual > n, `Expected ${actual} to be greater than ${n}`);
    },
    toBeGreaterThanOrEqual(n) {
      assert.ok(actual >= n, `Expected ${actual} to be >= ${n}`);
    },
    toBeLessThan(n) {
      assert.ok(actual < n, `Expected ${actual} to be less than ${n}`);
    },
    toBeLessThanOrEqual(n) {
      assert.ok(actual <= n, `Expected ${actual} to be <= ${n}`);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined, `Expected ${JSON.stringify(actual)} to be undefined`);
    },
    toContain(item) {
      assert.ok(
        actual && actual.includes && actual.includes(item),
        `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`
      );
    },
    toHaveLength(n) {
      assert.ok(actual && actual.length === n, `Expected length ${actual && actual.length} to be ${n}`);
    },
    toMatch(regex) {
      assert.ok(regex.test(actual), `Expected ${JSON.stringify(actual)} to match ${regex}`);
    },
    not: {
      toBe(expected) {
        assert.notStrictEqual(actual, expected, `Expected ${JSON.stringify(actual)} to NOT be ${JSON.stringify(expected)}`);
      },
      toBeNull() {
        assert.notStrictEqual(actual, null, `Expected value to NOT be null`);
      },
      toEqual(expected) {
        assert.notDeepStrictEqual(actual, expected, `Expected ${JSON.stringify(actual)} to NOT equal ${JSON.stringify(expected)}`);
      },
    },
  };
}

async function runAll() {
  console.log('');
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const t of _suites) {
    try {
      await t.fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${t.suite} > ${t.name}`);
    } catch (err) {
      failed++;
      failures.push({ suite: t.suite, name: t.name, error: err });
      console.log(`  \x1b[31m✗\x1b[0m ${t.suite} > ${t.name}`);
      console.log(`    \x1b[31m${err.message}\x1b[0m`);
    }
  }

  _totalPassed += passed;
  _totalFailed += failed;
  _allFailures = _allFailures.concat(failures);

  console.log(`\n  结果: ${passed + failed} tests | ${passed} passed | ${failed} failed\n`);
  return { passed, failed, failures };
}

function getTotalResults() {
  return { passed: _totalPassed, failed: _totalFailed, failures: _allFailures };
}

function resetHarness() {
  _suites = [];
  _currentSuite = '';
  _totalPassed = 0;
  _totalFailed = 0;
  _allFailures = [];
}

module.exports = { describe, test, expect, runAll, getTotalResults, resetHarness };
