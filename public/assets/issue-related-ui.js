import { ApiFailure, api } from './api.js';
export function initIssueRelatedUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const issuePullRequests = required('#issue-pull-requests');
    const issuePullRequestsList = required('#issue-pull-requests-list');
    const issuePullRequestsEmpty = required('#issue-pull-requests-empty');
    const linkPullRequestButton = required('#link-pull-request-button');
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
    let pullRequestsRequestVersion = 0;
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
        linkPullRequestButton.hidden = !canLink;
        issuePullRequestsEmpty.hidden = linkedPullRequests.length > 0;
        issuePullRequestsEmpty.textContent = message || 'No pull requests linked yet.';
    }
    async function loadPullRequests(issueId) {
        const requestVersion = ++pullRequestsRequestVersion;
        renderPullRequests('Loading pull requests…');
        try {
            const result = await request(`/issues/${issueId}/pull-requests`);
            if (requestVersion !== pullRequestsRequestVersion || options.getIssue()?.id !== issueId)
                return;
            linkedPullRequests = result.pull_requests;
            renderPullRequests();
        }
        catch (error) {
            if (requestVersion !== pullRequestsRequestVersion || options.getIssue()?.id !== issueId)
                return;
            linkedPullRequests = [];
            renderPullRequests(error instanceof Error ? error.message : 'Could not load linked pull requests.');
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
    return {
        renderPullRequests,
        loadPullRequests,
        loadStatusHistory,
        reset: () => {
            linkedPullRequests = [];
            pullRequestsRequestVersion += 1;
            renderPullRequests();
        },
        isStatusHistoryFocused: (target) => issueStatusHistory.open && target instanceof Node
            && issueStatusHistory.contains(target),
        closeStatusHistory: () => { issueStatusHistory.open = false; },
        dispose: () => {
            listeners.abort();
            pullRequestsRequestVersion += 1;
            statusHistoryRequestVersion += 1;
        },
    };
}
