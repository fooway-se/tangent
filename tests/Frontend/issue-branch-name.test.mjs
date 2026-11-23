import assert from 'node:assert/strict';
import test from 'node:test';
import { issueBranchName } from '../../public/assets/issue-branch-name.js';

test('issue branch names include a stable issue reference and a safe title slug', () => {
  assert.equal(issueBranchName(12, 'Fix release flow'), 'tangent/issue-12-fix-release-flow');
  assert.equal(issueBranchName(41, 'Café / Mobile scroll!'), 'tangent/issue-41-cafe-mobile-scroll');
  assert.equal(issueBranchName(9, '🔥'), 'tangent/issue-9');
});
