import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const openapi = await readFile(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8');
const development = await readFile(new URL('../../docs/DEVELOPMENT.md', import.meta.url), 'utf8');
const githubDocs = await readFile(new URL('../../docs/GITHUB.md', import.meta.url), 'utf8');
const compose = await readFile(new URL('../../compose.yaml', import.meta.url), 'utf8');

test('project creation and editing can connect an available GitHub repository', () => {
  assert.match(html, /id="project-github-repository" name="github_repository_id"/);
  assert.match(html, /id="project-edit-github-repository" name="github_repository_id"/);
  assert.match(html, /id="connect-github-create-button"[^>]*>Connect GitHub/);
  assert.match(html, /id="connect-github-edit-button"[^>]*>Connect GitHub/);
  assert.match(app, /async function loadGithubRepositories\(\)/);
  assert.match(app, /api<\{ repositories: GitHubRepository\[\]; connected: boolean; configured: boolean; can_connect: boolean \}>\('\/github\/repositories'\)/);
  assert.match(app, /github_installation_id: githubRepositorySelection\?\.installation_id \?\? null/);
  assert.match(app, /github_repository_id: githubRepositorySelection\?\.repository_id \?\? null/);
  assert.match(app, /githubRepositorySelectionValue\(repository\)/);
});

test('issue pull-request controls are available only for connected project repositories', () => {
  assert.match(html, /id="issue-pull-requests"[^>]*hidden/);
  assert.match(html, /id="link-pull-request-button"[^>]*>Link pull request/);
  assert.match(html, /id="issue-pull-request-dialog"/);
  assert.match(html, /id="issue-pull-request-url"[^>]*type="url"/);
  assert.match(app, /issuePullRequests\.hidden = !hasIssue[\s\S]{0,160}activeProject\.github_repository === null[\s\S]{0,100}linkedPullRequests\.length === 0/);
  assert.match(app, /api<\{ pull_requests: LinkedPullRequest\[\] \}>\(`\/issues\/\$\{issueId\}\/pull-requests`\)/);
  assert.match(app, /method: 'POST',[\s\S]{0,160}JSON\.stringify\(\{ url: issuePullRequestUrl\.value \}\)/);
});

test('GitHub API describes repository selection, manual PR links, and signed webhook updates', () => {
  assert.match(openapi, /\/github\/repositories/);
  assert.match(openapi, /\/issues\/\{id\}\/pull-requests/);
  assert.match(openapi, /\/github\/webhook/);
  assert.match(openapi, /X-Hub-Signature-256/);
  assert.match(openapi, /\/github\/setup\/authorize/);
  assert.match(openapi, /list installations accessible to the authorized GitHub user/i);
  assert.match(app, /can_connect: boolean/);
  assert.match(app, /connectGithubCreateButton\.hidden = !result\.can_connect/);
  assert.match(compose, /TANGENT_GITHUB_OAUTH_CLIENT_ID/);
  assert.match(compose, /TANGENT_GITHUB_OAUTH_CLIENT_SECRET/);
  assert.match(development, /github_oauth_client_id/);
  assert.match(development, /github_oauth_client_secret/);
  assert.match(githubDocs, /TANGENT_GITHUB_OAUTH_CLIENT_ID/);
  assert.match(githubDocs, /TANGENT_GITHUB_OAUTH_CLIENT_SECRET/);
  assert.match(githubDocs, /api\/v1\/github\/setup\/authorize/);
});
