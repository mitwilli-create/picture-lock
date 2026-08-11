import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pipelinePath = fileURLToPath(new URL('../pipeline.mjs', import.meta.url));

function runWithBudget(value) {
  return spawnSync(process.execPath, [
    pipelinePath,
    '--budget',
    value,
    '--stage',
    'definitely-invalid',
  ], { encoding: 'utf8' });
}

test('rejects malformed budget values before unknown-stage validation', () => {
  for (const value of ['nonsense', 'Infinity', '-1', '', '1abc']) {
    const result = runWithBudget(value);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.notEqual(result.status, 0, `expected --budget ${JSON.stringify(value)} to fail`);
    assert.match(output, /--budget.*finite, non-negative number/);
    assert.doesNotMatch(output, /unknown stage/);
  }
});

test('rejects a bare budget flag before unknown-stage validation', () => {
  const result = spawnSync(process.execPath, [
    pipelinePath,
    '--budget',
    '--stage',
    'definitely-invalid',
  ], { encoding: 'utf8' });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /--budget.*finite, non-negative number/);
  assert.doesNotMatch(output, /unknown stage/);
});

test('allows a zero budget to reach unknown-stage validation', () => {
  const result = runWithBudget('0');
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /--stage definitely-invalid: unknown stage/);
  assert.doesNotMatch(output, /--budget.*finite, non-negative number/);
});
