import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const guestView = await readFile(new URL('../../frontend/src/guest-view.ts', import.meta.url), 'utf8');
const types = await readFile(new URL('../../frontend/src/types.ts', import.meta.url), 'utf8');
const projectNotesUi = await readFile(new URL('../../frontend/src/project-notes-ui.ts', import.meta.url), 'utf8');
const projectEditUi = await readFile(new URL('../../frontend/src/project-edit-ui.ts', import.meta.url), 'utf8');
const projectListUi = await readFile(new URL('../../frontend/src/project-list-ui.ts', import.meta.url), 'utf8');

test('project details provide admins an edit dialog for name, description, and status', () => {
  const projectView = html.slice(html.indexOf('id="project-view"'), html.indexOf('id="admin-view"'));
  const projectHeader = projectView.slice(0, projectView.indexOf('class="project-tabs"'));
  assert.match(projectHeader, /<header class="page-heading project-page-heading">[\s\S]*<h1 id="project-heading"[\s\S]*<div class="project-page-actions">[\s\S]*<button id="edit-project-button"[^>]*hidden[^>]*>Edit project/);
  assert.doesNotMatch(projectView.slice(projectView.indexOf('class="issue-progress-strip"'), projectView.indexOf('id="issues-view"')), /id="edit-project-button"/);
  assert.match(html, /<dialog id="project-edit-dialog"[^>]*aria-labelledby="project-edit-heading"/);
  assert.match(html, /id="project-edit-name"[^>]*name="name"[^>]*required/);
  assert.match(html, /id="project-edit-description-input"[^>]*name="description"/);
  assert.match(html, /id="project-edit-status"[^>]*name="status"[^>]*aria-describedby="project-edit-status-help"/);
  assert.match(html, /<option value="active">Active<\/option>/);
  assert.match(html, /<option value="paused">Paused<\/option>/);
  assert.match(html, /<option value="completed">Completed<\/option>/);
  assert.match(html, /<option value="archived">Archived<\/option>/);
  assert.match(html, /id="project-edit-status-help"[^>]*aria-live="polite"/);
  assert.match(html, /id="project-read-only-notice"[^>]*role="status" hidden/);
  assert.match(app, /editProjectButton\.hidden = user\.role !== 'admin'/);
  assert.match(projectEditUi, /editButton\.addEventListener\('click', open,/);
});

test('project edit form explains each work state and archive selection', () => {
  assert.match(types, /active: 'Normal work\.'/);
  assert.match(types, /paused: 'Temporarily on hold; it can be resumed/);
  assert.match(types, /completed: 'Finished and read-only/);
  assert.match(types, /archived: 'A housekeeping state that moves the project out of the active list/);
  assert.match(projectEditUi, /statusSelect\.addEventListener\('change', updateStatusHint,/);
  assert.match(projectEditUi, /let hint = PROJECT_STATUS_HINTS\[status\]/);
  assert.match(projectEditUi, /statusHelp\.textContent = hint/);
});

test('archived project details stay locked until the project is restored', () => {
  assert.match(projectEditUi, /const archivedLocked = project\?\.status === 'archived' && status === 'archived'/);
  assert.match(projectEditUi, /nameInput\.disabled = completedLocked \|\| archivedLocked/);
  assert.match(projectEditUi, /descriptionInput\.disabled = completedLocked \|\| archivedLocked/);
});

test('saving project details uses the existing PATCH endpoint and refreshes visible details', () => {
  assert.match(projectEditUi, /api<\{ project: Project \}>\(`\/projects\/\$\{projectId\}`,\s*\{\s*method: 'PATCH'/);
  assert.match(projectEditUi, /name: nameInput\.value[\s\S]*description: descriptionInput\.value[\s\S]*status: statusSelect\.value/);
  assert.match(app, /projectDescription\.textContent = project\.description/);
  assert.match(app, /projectHeading\.textContent = project\.name/);
  assert.match(app, /breadcrumbCurrent\.textContent = project\.name/);
});

test('project status labels reflect the selected lifecycle state', () => {
  assert.match(app, /function projectStatusLabel\(status: Project\['status'\]\): string[\s\S]*PROJECT_STATUS_LABELS\[status\]/);
  assert.match(app, /projectState\.textContent = projectStatusLabel\(project\.status\)/);
  assert.match(projectListUi, /state\.textContent = projectStatusLabel\(project\.status\)/);
  assert.match(types, /archived: 3/);
  assert.match(projectListUi, /const projects = \[\.\.\.result\.projects\]\.sort/);
});

test('empty project lists explain missing membership in the sidebar and main view', () => {
  assert.match(html, /id="project-sidebar-empty"[^>]*class="project-sidebar-empty"[^>]*role="status"[^>]*hidden/);
  const projectSidebar = html.slice(html.indexOf('class="sidebar-projects"'), html.indexOf('id="account-bar"'));
  assert.ok(projectSidebar.indexOf('id="sidebar-projects-heading"') < projectSidebar.indexOf('id="project-sidebar-empty"'));
  assert.ok(projectSidebar.indexOf('id="project-sidebar-empty"') < projectSidebar.indexOf('id="project-sidebar-list"'));
  assert.match(projectListUi, /function updateEmptyStates\(projects: readonly Project\[\]\)/);
  assert.match(projectListUi, /You're not a member of any projects yet\. Ask a workspace admin to add you\./);
  assert.match(projectListUi, /projectSidebarEmpty\.textContent = isAdmin \? 'No projects yet\.' : 'No project access yet\.'/);
});

test('completed and archived project controls switch to read-only in the project view', () => {
  assert.match(app, /function projectStatusIsReadOnly\(status: Project\['status'\]\): boolean/);
  const controls = app.slice(app.indexOf('function updateProjectReadOnlyNotice'), app.indexOf('function applyEditedProject'));
  assert.match(controls, /issueForm\.hidden = readOnly/);
  assert.match(controls, /issueDetailStatus\.disabled = readOnly/);
  assert.match(controls, /issueDiscussionUi\.setReadOnly\(readOnly\)/);
  assert.match(controls, /projectNotesUi\.setReadOnly\(readOnly\)/);
  assert.match(projectNotesUi, /projectNotesInput\.disabled = readOnly/);
});

test('the guest portal keeps completed and archived projects readable without write actions', () => {
  assert.match(guestView, /project: \{ id: number; name: string; status: 'active' \| 'paused' \| 'completed' \| 'archived' \}/);
  assert.match(guestView, /const readOnly = view\.project\.status === 'completed' \|\| view\.project\.status === 'archived'/);
  assert.match(guestView, /This project is read-only while it is/);
  assert.match(guestView, /if \(!readOnly\)[\s\S]{0,200}guest-write/);
  assert.match(guestView, /if \(readOnly\)[\s\S]{0,500}Approval is unavailable/);
  assert.match(guestView, /'button button-primary guest-approve-button', 'Approve'/);
});

test('project edit dialog participates in modal keyboard handling', () => {
  const context = app.slice(app.indexOf('function shortcutContext'), app.indexOf('function clearGoPrefix'));
  const dismiss = app.slice(app.indexOf('function dismissCurrentView'), app.indexOf('function focusIssueQuickAddReturnTarget'));
  assert.match(context, /modalOpen:[\s\S]*projectEditDialog\.open/);
  assert.match(dismiss, /if \(projectEditDialog\.open\)\s*\{\s*projectEditDialog\.close\(\);/);
});
