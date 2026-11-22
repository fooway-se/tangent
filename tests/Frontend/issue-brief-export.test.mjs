import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatIssueMarkdown, formatIssuePrompt } from '../../public/assets/issue-export.js';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const promptUi = await readFile(new URL('../../frontend/src/issue-ai-prompt-ui.ts', import.meta.url), 'utf8');
const openapi = await readFile(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8');

test('guided AI prompt builder keeps the issue forms compact', () => {
  const quickAdd = html.slice(html.indexOf('<form id="issue-form"'), html.indexOf('<div class="issue-board-toolbar"'));
  const issueEditForm = html.slice(html.indexOf('<form id="issue-detail-edit-form"'), html.indexOf('<section id="issue-discussion"'));
  assert.doesNotMatch(quickAdd, /name="context"|name="expected_outcome"|name="acceptance_criteria"/);
  assert.doesNotMatch(issueEditForm, /name="context"|name="expected_outcome"|name="acceptance_criteria"/);

  for (const id of [
    'issue-ai-prompt-button',
    'issue-ai-prompt-dialog',
    'issue-ai-prompt-step-count',
    'issue-ai-prompt-step-context',
    'issue-ai-prompt-step-outcome',
    'issue-ai-prompt-step-criteria',
    'issue-ai-prompt-step-preview',
    'issue-ai-prompt-context',
    'issue-ai-prompt-outcome',
    'issue-ai-prompt-criteria',
    'issue-ai-prompt-back',
    'issue-ai-prompt-next',
    'issue-ai-prompt-skip',
    'issue-ai-prompt-preview',
    'issue-ai-prompt-save',
    'issue-ai-prompt-copy',
    'issue-ai-prompt-copy-markdown',
    'issue-ai-prompt-download',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} is available in the guided prompt flow`);
  }

  assert.match(html, /AI prompt context is optional/);
  assert.match(html, /Leave any answer blank or skip straight to preview\./);
  assert.match(html, /What should the AI know about how this works today\?/);
  assert.match(html, /Include relevant background, existing behavior, and constraints to preserve\./);
  assert.match(html, /What should someone be able to observe when this is done\?/);
  assert.match(html, /How will you verify the result\?/);
  assert.match(html, /List specific, testable outcomes, one per line\./);
  assert.match(promptUi, /issueAiPromptContext\.value = issue\.context/);
  assert.match(promptUi, /issueAiPromptOutcome\.value = issue\.expected_outcome/);
  assert.match(promptUi, /issueAiPromptCriteria\.value = issue\.acceptance_criteria/);
  assert.match(promptUi, /context:\s*draft\.context/);
  assert.match(promptUi, /expected_outcome:\s*draft\.expected_outcome/);
  assert.match(promptUi, /acceptance_criteria:\s*draft\.acceptance_criteria/);
  assert.match(promptUi, /formatIssueMarkdown\(draftIssue\(issue\)\)/);
  assert.match(promptUi, /formatIssuePrompt\(draftIssue\(issue\)\)/);
  assert.match(promptUi, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(promptUi, /issueAiPromptPreview\.select\(\)/);
  assert.match(promptUi, /new Blob\(\[markdown\], \{ type: 'text\/markdown;charset=utf-8' \}\)/);
  assert.match(openapi, /context: \{ type: string, maxLength: 10000/);
  assert.match(openapi, /expected_outcome: \{ type: string, maxLength: 10000/);
  assert.match(openapi, /acceptance_criteria: \{ type: string, maxLength: 10000/);
});

test('issue Markdown export includes metadata and structured brief sections', () => {
  const markdown = formatIssueMarkdown({
    id: 42,
    title: 'Add structured issue briefs',
    description: 'Help prepare clear implementation prompts.',
    status: 'doing',
    priority: 'high',
    due_date: '2026-11-30',
    type: 'feature',
    context: 'Issues need relevant product constraints.\nKeep existing descriptions intact.',
    expected_outcome: 'An implementer can understand the goal.',
    acceptance_criteria: 'The brief can be copied.\nThe Markdown includes every section.',
  });

  assert.match(markdown, /^# Issue #42: Add structured issue briefs/m);
  assert.match(markdown, /Status: In progress/);
  assert.match(markdown, /Priority: High/);
  assert.match(markdown, /Due date: 2026-11-30/);
  assert.match(markdown, /## Description\nHelp prepare clear implementation prompts\./);
  assert.match(markdown, /## Context\nIssues need relevant product constraints\.\nKeep existing descriptions intact\./);
  assert.match(markdown, /## Expected outcome\nAn implementer can understand the goal\./);
  assert.match(markdown, /## Acceptance criteria\n- \[ \] The brief can be copied\.\n- \[ \] The Markdown includes every section\./);
});

test('issue Markdown export uses the Testing status label', () => {
  const markdown = formatIssueMarkdown({
    id: 43,
    title: 'Run regression suite',
    description: '',
    status: 'testing',
    priority: 'medium',
    due_date: null,
    type: 'task',
    context: '',
    expected_outcome: '',
    acceptance_criteria: '',
  });

  assert.match(markdown, /Status: Testing/);
});

test('prompt export instructs implementation and omits empty brief sections', () => {
  const prompt = formatIssuePrompt({
    id: 7,
    title: 'Fix keyboard focus',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_date: null,
    type: 'bug',
    context: '',
    expected_outcome: 'Keyboard users can return to their previous focus target.',
    acceptance_criteria: '',
  });

  assert.match(prompt, /Implement this issue in the current codebase/);
  assert.match(prompt, /Implement this issue in the current codebase\.\n\n## Working approach\n- Inspect the relevant code and tests, then follow the project's conventions\./);
  assert.match(prompt, /Inspect the relevant code and tests, then follow the project's conventions/);
  assert.match(prompt, /Use TDD: add or update a test for the desired behavior, verify it fails when practical, implement the change, and run the relevant tests/);
  assert.match(prompt, /Treat the acceptance criteria as required outcomes/);
  assert.match(prompt, /\n\n## Completion report\nSummarize the changes and test results\./);
  assert.match(prompt, /Summarize the changes and test results/);
  assert.match(prompt, /# Issue #7: Fix keyboard focus/);
  assert.match(prompt, /## Expected outcome/);
  assert.doesNotMatch(prompt, /## Description|## Context|## Acceptance criteria/);
  assert.doesNotMatch(prompt, /Due date:/);
});
