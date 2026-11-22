import assert from 'node:assert/strict';
import test from 'node:test';
import * as selectionModule from '../../public/assets/github-repository-selection.js';

test('repository selection carries both installation and repository IDs', () => {
  assert.equal(typeof selectionModule.githubRepositorySelectionValue, 'function');
  assert.equal(typeof selectionModule.parseGitHubRepositorySelection, 'function');

  const value = selectionModule.githubRepositorySelectionValue({
    installation_id: 445566,
    id: 7654321,
    owner: 'test-org',
    name: 'test-repo',
  });
  assert.equal(value, '[445566,7654321,"test-org","test-repo"]');
  assert.deepEqual(selectionModule.parseGitHubRepositorySelection(value), {
    installation_id: 445566,
    repository_id: 7654321,
    owner: 'test-org',
    name: 'test-repo',
  });
  assert.deepEqual(selectionModule.parseGitHubRepositorySelection('[445567,7654321,"test-org","test-repo"]'), {
    installation_id: 445567,
    repository_id: 7654321,
    owner: 'test-org',
    name: 'test-repo',
  });
  assert.equal(selectionModule.parseGitHubRepositorySelection('[0,7654321,"test-org","test-repo"]'), null);
  assert.equal(selectionModule.parseGitHubRepositorySelection('[445566,7654321,"test-org",""]'), null);
  assert.equal(selectionModule.parseGitHubRepositorySelection('not json'), null);
});
