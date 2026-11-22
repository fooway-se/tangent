import assert from 'node:assert/strict';
import test from 'node:test';
import { issueRowRenderSignature } from '../../public/assets/issue-board-ui.js';

const issue = {
  id: 12,
  title: 'Prepare release',
  description: 'Write the release notes',
  status: 'doing',
  type: 'feature',
  assignee_id: 4,
  is_shared: false,
  milestone_name: 'Beta',
  source_message_id: null,
  discussion_count: 2,
  is_ongoing: false,
};

test('issue row cache signature changes with every displayed value and selection mode', () => {
  const labelAssignee = (id) => id === 4 ? 'Avery' : 'Unassigned';
  const signature = issueRowRenderSignature(issue, undefined, labelAssignee);

  assert.equal(issueRowRenderSignature({ ...issue }, undefined, labelAssignee), signature);
  assert.notEqual(issueRowRenderSignature({ ...issue, is_shared: true }, undefined, labelAssignee), signature);
  assert.notEqual(issueRowRenderSignature({ ...issue, discussion_count: 3 }, undefined, labelAssignee), signature);
  assert.notEqual(issueRowRenderSignature(issue, { canMoveEarlier: true }, labelAssignee), signature);
  assert.notEqual(issueRowRenderSignature(issue, undefined, labelAssignee, true), signature);
});
