import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const projectListUi = await readFile(new URL('../../frontend/src/project-list-ui.ts', import.meta.url), 'utf8');
const githubProjectUi = await readFile(new URL('../../frontend/src/github-project-ui.ts', import.meta.url), 'utf8');
const issueRelatedUi = await readFile(new URL('../../frontend/src/issue-related-ui.ts', import.meta.url), 'utf8');
const openapi = await readFile(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8');
const development = await readFile(new URL('../../docs/DEVELOPMENT.md', import.meta.url), 'utf8');
const githubDocs = await readFile(new URL('../../docs/GITHUB.md', import.meta.url), 'utf8');
const compose = await readFile(new URL('../../compose.yaml', import.meta.url), 'utf8');

test('project creation and editing can connect an available GitHub repository', () => {
  assert.match(html, /id="project-github-repository" name="github_repository_id"/);
  assert.match(html, /id="project-edit-github-repository" name="github_repository_id"/);
  assert.match(html, /id="connect-github-create-button"[^>]*>Connect GitHub/);
  assert.match(html, /id="connect-github-edit-button"[^>]*>Connect GitHub/);
  assert.match(githubProjectUi, /async function load\(\)/);
  assert.match(githubProjectUi, /api<\{[\s\S]*repositories: GitHubRepository\[\];[\s\S]*can_connect: boolean;[\s\S]*\}>\('\/github\/repositories'\)/);
  assert.match(projectListUi, /github_installation_id: githubRepositorySelection\?\.installation_id \?\? null/);
  assert.match(projectListUi, /github_repository_id: githubRepositorySelection\?\.repository_id \?\? null/);
  assert.match(projectListUi, /github_repository_owner: githubRepositorySelection\?\.owner \?\? null/);
  assert.match(projectListUi, /github_repository_name: githubRepositorySelection\?\.name \?\? null/);
  assert.match(githubProjectUi, /githubRepositorySelectionValue\(repository\)/);
});

test('issue pull-request controls are available only for connected project repositories', () => {
  assert.match(html, /id="issue-pull-requests"[^>]*hidden/);
  assert.match(html, /id="copy-issue-branch-button"[^>]*hidden[^>]*>Copy branch name/);
  assert.match(html, /id="issue-commits"[^>]*hidden/);
  assert.match(html, /id="link-pull-request-button"[^>]*>Link pull request/);
  assert.match(html, /id="issue-pull-request-dialog"/);
  assert.match(html, /id="issue-pull-request-url"[^>]*type="url"/);
  assert.match(issueRelatedUi, /issuePullRequests\.hidden = !hasIssue[\s\S]{0,200}project\.github_repository === null[\s\S]{0,100}linkedPullRequests\.length === 0/);
  assert.match(issueRelatedUi, /request<\{ pull_requests: LinkedPullRequest\[\] \}>\(`\/issues\/\$\{issueId\}\/pull-requests`\)/);
  assert.match(issueRelatedUi, /request<\{ commits: LinkedCommit\[\] \}>\(`\/issues\/\$\{issueId\}\/commits`\)/);
  assert.match(issueRelatedUi, /method: 'POST',[\s\S]{0,160}JSON\.stringify\(\{ url: issuePullRequestUrl\.value \}\)/);
});

test('GitHub API describes repository selection, manual PR links, and signed webhook updates', () => {
  assert.match(openapi, /\/github\/repositories/);
  assert.match(openapi, /\/issues\/\{id\}\/pull-requests/);
  assert.match(openapi, /\/issues\/\{id\}\/commits/);
  assert.match(openapi, /enum: \[mention, assigned, reply, status, pr, commit\]/);
  assert.match(openapi, /\/github\/webhook/);
  assert.match(openapi, /X-Hub-Signature-256/);
  assert.match(openapi, /\/github\/setup\/authorize/);
  assert.match(openapi, /list installations accessible to the authorized GitHub user/i);
  assert.match(githubProjectUi, /can_connect: boolean/);
  assert.match(githubProjectUi, /connectCreateButton\.hidden = !result\.can_connect/);
  assert.match(compose, /TANGENT_GITHUB_OAUTH_CLIENT_ID/);
  assert.match(compose, /TANGENT_GITHUB_OAUTH_CLIENT_SECRET/);
  assert.match(development, /github\.oauth_client_id/);
  assert.match(development, /github\.oauth_client_secret/);
  assert.match(githubDocs, /TANGENT_GITHUB_OAUTH_CLIENT_ID/);
  assert.match(githubDocs, /TANGENT_GITHUB_OAUTH_CLIENT_SECRET/);
  assert.match(githubDocs, /Contents: Read-only/);
  assert.match(githubDocs, /Checks: Read-only/);
  assert.match(githubDocs, /Check run/);
  assert.match(githubDocs, /Push/);
  assert.match(openapi, /LinkedPullRequestCheckRun/);
  assert.match(githubDocs, /api\/v1\/github\/setup\/authorize/);
});
