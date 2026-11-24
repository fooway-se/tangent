import { ApiFailure, api } from './api.js';
import { issueBranchName } from './issue-branch-name.js';
export function initIssueRelatedUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const issuePullRequests = required('#issue-pull-requests');
    const issuePullRequestsList = required('#issue-pull-requests-list');
    const issuePullRequestsEmpty = required('#issue-pull-requests-empty');
    const linkPullRequestButton = required('#link-pull-request-button');
    const copyIssueBranchButton = required('#copy-issue-branch-button');
    const issueCommits = required('#issue-commits');
    const issueCommitsList = required('#issue-commits-list');
    const issueCommitsEmpty = required('#issue-commits-empty');
    const issuePullRequestDialog = required('#issue-pull-request-dialog');
    const issuePullRequestForm = required('#issue-pull-request-form');
    const issuePullRequestClose = required('#issue-pull-request-close');
    const issuePullRequestCancel = required('#issue-pull-request-cancel');
    const issuePullRequestUrl = required('#issue-pull-request-url');
    const issuePullRequestMessage = required('#issue-pull-request-message');
    const issuePullRequestSubmit = required('#issue-pull-request-submit');
    const issueStatusHistory = required('#issue-status-history');
    const issueStatusHistoryCount = required('#issue-status-history-count');
    const issueStatusHistoryEmpty = required('#issue-status-history-empty');
    const issueStatusHistoryList = required('#issue-status-history-list');
    const listeners = new AbortController();
    let linkedPullRequests = [];
    let pullRequestsLoaded = false;
    let linkedCommits = [];
    let pullRequestsRequestVersion = 0;
    let commitsRequestVersion = 0;
    let statusHistoryRequestVersion = 0;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing issue relation element: ${selector}`);
        return element;
    }
    function renderPullRequests(message = '') {
        const issue = options.getIssue();
        const project = options.getProject();
        const user = options.getUser();
        const hasIssue = issue !== null;
        const canManage = hasIssue
            && project !== null
            && !options.isProjectReadOnly(project)
            && user?.role !== 'guest';
        const canLink = canManage && project !== null && project.github_repository !== null;
        const canCopyBranch = hasIssue && project !== null && project.github_repository !== null && user?.role !== 'guest';
        issuePullRequestsList.replaceChildren(...linkedPullRequests.map((pullRequest) => {
            const item = doc.createElement('li');
            item.className = 'issue-pull-request-row';
            const main = doc.createElement('div');
            main.className = 'issue-pull-request-main';
            const link = doc.createElement('a');
            link.className = 'issue-pull-request-link';
            link.href = pullRequest.html_url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = `${pullRequest.repository_full_name} #${pullRequest.pull_number} · ${pullRequest.title}`;
            const metadata = doc.createElement('div');
            metadata.className = 'issue-pull-request-meta';
            const state = doc.createElement('span');
            state.className = `issue-pull-request-state${pullRequest.state !== 'open' ? ' is-closed' : ''}`;
            state.textContent = `${pullRequest.is_draft ? 'Draft · ' : ''}${pullRequest.state}`;
            const author = doc.createElement('span');
            author.textContent = pullRequest.author_login === '' ? 'Author unknown' : `@${pullRequest.author_login}`;
            const updated = doc.createElement('time');
            updated.dateTime = pullRequest.github_updated_at;
            updated.textContent = `Updated ${new Date(`${pullRequest.github_updated_at}Z`).toLocaleDateString()}`;
            metadata.append(state, author, updated);
            main.append(link, metadata);
            for (const checkRun of pullRequest.check_runs ?? []) {
                const check = doc.createElement('a');
                const checkState = checkRun.conclusion ?? checkRun.status;
                check.className = `issue-pull-request-check is-${checkRun.status} is-${checkState}`;
                check.href = checkRun.html_url;
                check.target = '_blank';
                check.rel = 'noopener noreferrer';
                check.textContent = `${checkRun.name} · ${checkState.replaceAll('_', ' ')}`;
                check.setAttribute('aria-label', `${checkRun.name}: ${checkState.replaceAll('_', ' ')}`);
                main.append(check);
            }
            item.append(main);
            if (canManage && issue !== null) {
                const issueId = issue.id;
                const unlink = doc.createElement('button');
                unlink.type = 'button';
                unlink.className = 'button button-quiet';
                unlink.textContent = 'Unlink';
                unlink.setAttribute('aria-label', `Unlink pull request ${pullRequest.repository_full_name} #${pullRequest.pull_number}`);
                unlink.addEventListener('click', () => void unlinkIssuePullRequest(issueId, pullRequest.id, unlink));
                item.append(unlink);
            }
            return item;
        }));
        issuePullRequests.hidden = !hasIssue
            || ((project === null || project.github_repository === null) && linkedPullRequests.length === 0);
        issueCommits.hidden = !hasIssue || project === null || project.github_repository === null;
        linkPullRequestButton.hidden = !canLink;
        copyIssueBranchButton.hidden = !canCopyBranch;
        issuePullRequestsEmpty.hidden = linkedPullRequests.length > 0 || !pullRequestsLoaded;
        issuePullRequestsEmpty.textContent = message || 'No pull requests linked yet.';
    }
    function renderCommits(message = '') {
        const issue = options.getIssue();
        const project = options.getProject();
        const hasGitHub = issue !== null && project !== null && project.github_repository !== null;
        issueCommitsList.replaceChildren(...linkedCommits.map((commit) => {
            const item = doc.createElement('li');
            item.className = 'issue-commit-row';
            const link = doc.createElement('a');
            link.className = 'issue-commit-link';
            link.href = commit.html_url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const firstLine = commit.message.split(/\r?\n/, 1)[0]?.trim() ?? '';
            link.textContent = `${commit.repository_full_name} · ${commit.sha.slice(0, 7)} · ${firstLine || '(no commit message)'}`;
            const metadata = doc.createElement('span');
            metadata.className = 'issue-commit-meta';
            const author = commit.author_login === '' ? 'Author unknown' : `@${commit.author_login}`;
            const parsedDate = new Date(commit.committed_at.replace(' ', 'T') + 'Z');
            const date = Number.isNaN(parsedDate.getTime())
                ? commit.committed_at
                : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsedDate);
            metadata.textContent = `${author} · ${date}`;
            item.append(link, metadata);
            return item;
        }));
        issueCommits.hidden = !hasGitHub;
        issueCommitsEmpty.hidden = !hasGitHub || linkedCommits.length > 0;
        issueCommitsEmpty.textContent = message || 'No commits linked yet.';
        renderPullRequests();
    }
    async function loadPullRequests(issueId) {
        const requestVersion = ++pullRequestsRequestVersion;
        try {
            const result = await request(`/issues/${issueId}/pull-requests`);
            if (requestVersion !== pullRequestsRequestVersion || options.getIssue()?.id !== issueId)
                return;
            linkedPullRequests = result.pull_requests;
            pullRequestsLoaded = true;
            renderPullRequests();
        }
        catch (error) {
            if (requestVersion !== pullRequestsRequestVersion || options.getIssue()?.id !== issueId)
                return;
            linkedPullRequests = [];
            pullRequestsLoaded = true;
            renderPullRequests(error instanceof Error ? error.message : 'Could not load linked pull requests.');
        }
    }
    async function loadCommits(issueId) {
        const project = options.getProject();
        const user = options.getUser();
        if (options.getIssue()?.id !== issueId || project?.github_repository == null || user?.role === 'guest') {
            linkedCommits = [];
            renderCommits();
            return;
        }
        const requestVersion = ++commitsRequestVersion;
        renderCommits('Loading commits…');
        try {
            const result = await request(`/issues/${issueId}/commits`);
            if (requestVersion !== commitsRequestVersion || options.getIssue()?.id !== issueId)
                return;
            linkedCommits = result.commits;
            renderCommits();
        }
        catch (error) {
            if (requestVersion !== commitsRequestVersion || options.getIssue()?.id !== issueId)
                return;
            linkedCommits = [];
            renderCommits(error instanceof Error ? error.message : 'Could not load commits.');
        }
    }
    async function unlinkIssuePullRequest(issueId, pullRequestId, button) {
        button.disabled = true;
        try {
            await request(`/issues/${issueId}/pull-requests/${pullRequestId}`, { method: 'DELETE' });
            await loadPullRequests(issueId);
        }
        catch (error) {
            button.disabled = false;
            options.report(error instanceof Error ? error.message : 'Could not unlink pull request.', true);
        }
    }
    function createStatusHistoryRow(transition) {
        const item = doc.createElement('li');
        item.className = 'issue-status-history-item';
        const change = doc.createElement('span');
        change.className = 'issue-status-history-change';
        change.textContent = transition.from_status === null
            ? `Set to ${options.issueStatusLabel(transition.to_status)}`
            : `${options.issueStatusLabel(transition.from_status)} → ${options.issueStatusLabel(transition.to_status)}`;
        const actor = doc.createElement('span');
        actor.className = 'issue-status-history-actor';
        actor.textContent = transition.actor_name;
        const time = doc.createElement('time');
        time.dateTime = transition.created_at.replace(' ', 'T');
        const parsedDate = new Date(transition.created_at.replace(' ', 'T'));
        time.textContent = Number.isNaN(parsedDate.getTime())
            ? transition.created_at
            : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsedDate);
        item.append(change, actor, time);
        return item;
    }
    async function loadStatusHistory(issueId) {
        const requestVersion = ++statusHistoryRequestVersion;
        issueStatusHistory.hidden = false;
        issueStatusHistoryCount.textContent = '…';
        issueStatusHistoryList.replaceChildren();
        issueStatusHistoryEmpty.hidden = false;
        issueStatusHistoryEmpty.textContent = 'Loading status history…';
        try {
            const result = await request(`/issues/${issueId}/history`);
            if (requestVersion !== statusHistoryRequestVersion || options.getIssue()?.id !== issueId)
                return;
            issueStatusHistoryCount.textContent = String(result.transitions.length);
            issueStatusHistoryEmpty.hidden = result.transitions.length > 0;
            issueStatusHistoryEmpty.textContent = 'No status changes yet.';
            issueStatusHistoryList.replaceChildren(...result.transitions.map(createStatusHistoryRow));
        }
        catch (error) {
            if (requestVersion !== statusHistoryRequestVersion || options.getIssue()?.id !== issueId)
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            issueStatusHistoryCount.textContent = '—';
            issueStatusHistoryEmpty.hidden = false;
            issueStatusHistoryEmpty.textContent = 'Could not load status history.';
            options.report(error instanceof Error ? error.message : 'Could not load status history.', true);
        }
    }
    function openLinkDialog() {
        const issue = options.getIssue();
        const project = options.getProject();
        if (issue === null || project === null || project.github_repository === null
            || options.isProjectReadOnly(project))
            return;
        issuePullRequestForm.reset();
        issuePullRequestMessage.textContent = '';
        issuePullRequestMessage.classList.remove('is-error');
        issuePullRequestDialog.showModal();
        issuePullRequestUrl.focus();
    }
    async function submitLink(event) {
        event.preventDefault();
        const issueId = options.getIssue()?.id;
        const project = options.getProject();
        if (issueId === undefined || project === null || project.github_repository === null)
            return;
        issuePullRequestSubmit.disabled = true;
        issuePullRequestMessage.textContent = '';
        issuePullRequestMessage.classList.remove('is-error');
        try {
            await request(`/issues/${issueId}/pull-requests`, {
                method: 'POST',
                body: JSON.stringify({ url: issuePullRequestUrl.value }),
            });
            if (options.getIssue()?.id !== issueId)
                return;
            await loadPullRequests(issueId);
            issuePullRequestDialog.close();
            options.report('Pull request linked.');
        }
        catch (error) {
            issuePullRequestMessage.textContent = error instanceof Error ? error.message : 'Could not link pull request.';
            issuePullRequestMessage.classList.add('is-error');
            issuePullRequestUrl.focus();
        }
        finally {
            issuePullRequestSubmit.disabled = false;
        }
    }
    async function copyBranchName() {
        const issue = options.getIssue();
        const project = options.getProject();
        if (issue === null || project?.github_repository == null || options.getUser()?.role === 'guest')
            return;
        try {
            const copyText = options.copyText ?? ((value) => navigator.clipboard.writeText(value));
            await copyText(issueBranchName(issue.id, issue.title));
            options.report('Branch name copied.');
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not copy branch name.', true);
        }
    }
    linkPullRequestButton.addEventListener('click', openLinkDialog, { signal: listeners.signal });
    issuePullRequestClose.addEventListener('click', () => issuePullRequestDialog.close(), { signal: listeners.signal });
    issuePullRequestCancel.addEventListener('click', () => issuePullRequestDialog.close(), { signal: listeners.signal });
    issuePullRequestDialog.addEventListener('close', () => {
        issuePullRequestForm.reset();
        issuePullRequestMessage.textContent = '';
        issuePullRequestMessage.classList.remove('is-error');
        if (options.getIssue() !== null && options.isDetailVisible())
            linkPullRequestButton.focus();
    }, { signal: listeners.signal });
    issuePullRequestForm.addEventListener('submit', (event) => void submitLink(event), { signal: listeners.signal });
    copyIssueBranchButton.addEventListener('click', () => void copyBranchName(), { signal: listeners.signal });
    return {
        renderPullRequests,
        loadPullRequests,
        renderCommits,
        loadCommits,
        loadStatusHistory,
        isPullRequestDialogOpen: () => issuePullRequestDialog.open,
        closePullRequestDialog: () => {
            if (issuePullRequestDialog.open)
                issuePullRequestDialog.close();
        },
        reset: () => {
            linkedPullRequests = [];
            pullRequestsLoaded = false;
            linkedCommits = [];
            pullRequestsRequestVersion += 1;
            commitsRequestVersion += 1;
            renderPullRequests();
            renderCommits();
        },
        isStatusHistoryFocused: (target) => issueStatusHistory.open && target instanceof Node
            && issueStatusHistory.contains(target),
        closeStatusHistory: () => { issueStatusHistory.open = false; },
        dispose: () => {
            listeners.abort();
            pullRequestsRequestVersion += 1;
            commitsRequestVersion += 1;
            statusHistoryRequestVersion += 1;
        },
    };
}
