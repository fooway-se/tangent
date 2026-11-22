import { ApiFailure, api, apiBaseUrl } from './api.js';
import { INBOX_TABS, createEventRow, eventsForTab, inboxEventPagePath, mergeInboxEventPage, } from './inbox-events.js';
import { groupMyWorkTasks } from './my-work.js';
import { diffInboxCollections, nextInboxPollDelay, shouldDeferInboxUpdates, } from './inbox-polling.js';
export function initInboxUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const fetcher = options.fetcher ?? fetch;
    const myWorkTabsElement = doc.querySelector('#my-work-tabs');
    const myWorkInboxTab = doc.querySelector('#my-work-tab-inbox');
    const myWorkTasksTab = doc.querySelector('#my-work-tab-tasks');
    const myWorkInboxPanel = doc.querySelector('#my-work-inbox-panel');
    const myWorkTasksPanel = doc.querySelector('#my-work-tasks-panel');
    const myWorkTasksSummary = doc.querySelector('#my-work-tasks-summary');
    const myWorkTaskGroups = doc.querySelector('#my-work-task-groups');
    const myWorkTasksEmptyState = doc.querySelector('#my-work-tasks-empty-state');
    const inboxSummary = doc.querySelector('#inbox-summary');
    const inboxIssueList = doc.querySelector('#inbox-issue-list');
    const inboxEmptyState = doc.querySelector('#inbox-empty-state');
    const inboxTabsElement = doc.querySelector('#inbox-tabs');
    const inboxMarkAllReadButton = doc.querySelector('#inbox-mark-all-read');
    const inboxLoadMoreButton = doc.querySelector('#inbox-load-more');
    const listeners = new AbortController();
    let inboxIssues = [];
    let inboxEvents = [];
    let inboxEventCounts = { unread: 0, mentions: 0 };
    let inboxEventsHasMore = false;
    let inboxEventsNextCursor = null;
    let inboxMorePageLoading = false;
    let myWorkTab = 'inbox';
    let inboxTab = 'unread';
    let inboxIssuesEtag = null;
    let inboxEventsEtag = null;
    let inboxPollTimer = null;
    let inboxPollDelay = 1000;
    let inboxPollInFlight = false;
    let inboxPollRequestVersion = 0;
    let inboxPollHasDeferredChanges = false;
    let inboxMutationPending = 0;
    const inboxEventRowRenderSignatures = new WeakMap();
    function isPollingActive() {
        return options.isVisible();
    }
    function stopPolling() {
        if (inboxPollTimer !== null)
            window.clearTimeout(inboxPollTimer);
        inboxPollTimer = null;
        inboxPollRequestVersion += 1;
        inboxPollInFlight = false;
        inboxPollDelay = 1000;
        inboxIssuesEtag = null;
        inboxEventsEtag = null;
        inboxPollHasDeferredChanges = false;
    }
    function schedulePoll(delay = inboxPollDelay) {
        if (!isPollingActive()) {
            stopPolling();
            return;
        }
        if (inboxPollTimer !== null)
            window.clearTimeout(inboxPollTimer);
        inboxPollTimer = window.setTimeout(() => {
            inboxPollTimer = null;
            void pollNow();
        }, delay);
    }
    function inboxUpdatesAreDeferred() {
        return shouldDeferInboxUpdates({
            listFocused: inboxIssueList.contains(doc.activeElement) || myWorkTaskGroups.contains(doc.activeElement),
            mutationPending: inboxMutationPending > 0,
        });
    }
    function resumeDeferredPolling() {
        if (inboxPollHasDeferredChanges && isPollingActive() && !inboxUpdatesAreDeferred()) {
            inboxPollDelay = 1000;
            schedulePoll(0);
        }
    }
    async function fetchConditionalInboxCollection(path, key, etag) {
        const headers = new Headers();
        if (etag !== null)
            headers.set('If-None-Match', etag);
        const response = await fetcher(`${apiBaseUrl}${path}`, {
            headers,
            credentials: 'same-origin',
        });
        const responseEtag = response.headers.get('ETag') ?? etag;
        if (response.status === 304)
            return { items: null, etag: responseEtag };
        const payload = await response.json();
        if (!response.ok) {
            throw new ApiFailure(payload.error?.message ?? 'Could not refresh your inbox.', response.status);
        }
        return {
            items: Array.isArray(payload[key]) ? payload[key] : [],
            etag: responseEtag,
            hasMore: payload.has_more,
            nextCursor: payload.next_cursor,
            counts: payload.counts,
        };
    }
    async function pollNow() {
        if (!isPollingActive() || inboxPollInFlight)
            return;
        if (options.isDocumentHidden()) {
            inboxPollDelay = nextInboxPollDelay(inboxPollDelay, false, true);
            schedulePoll(inboxPollDelay);
            return;
        }
        const deferUpdatesAtStart = inboxUpdatesAreDeferred();
        const forceDeferredRefresh = inboxPollHasDeferredChanges && !deferUpdatesAtStart;
        const requestVersion = ++inboxPollRequestVersion;
        inboxPollInFlight = true;
        let changed = false;
        try {
            const [issuesResult, eventsResult] = await Promise.all([
                fetchConditionalInboxCollection('/inbox', 'issues', forceDeferredRefresh ? null : inboxIssuesEtag),
                fetchConditionalInboxCollection(inboxEventPagePath(inboxTab), 'events', forceDeferredRefresh ? null : inboxEventsEtag),
            ]);
            if (requestVersion !== inboxPollRequestVersion || !isPollingActive())
                return;
            const incomingIssues = issuesResult.items ?? inboxIssues;
            const incomingEvents = eventsResult.items === null
                ? inboxEvents
                : mergeInboxEventPage(inboxEvents, eventsResult.items);
            const issuesDiff = diffInboxCollections(inboxIssues, incomingIssues);
            const eventsDiff = diffInboxCollections(inboxEvents, incomingEvents);
            const issuesChanged = issuesDiff.added.length > 0 || issuesDiff.changed.length > 0
                || issuesDiff.removed.length > 0 || issuesDiff.orderChanged;
            const eventsChanged = eventsDiff.added.length > 0 || eventsDiff.changed.length > 0
                || eventsDiff.removed.length > 0 || eventsDiff.orderChanged;
            const incomingCounts = eventsResult.counts ?? inboxEventCounts;
            const countsChanged = incomingCounts.unread !== inboxEventCounts.unread
                || incomingCounts.mentions !== inboxEventCounts.mentions;
            changed = issuesChanged || eventsChanged || countsChanged;
            inboxIssuesEtag = issuesResult.etag;
            inboxEventsEtag = eventsResult.etag;
            const deferUpdates = deferUpdatesAtStart || inboxUpdatesAreDeferred();
            if (deferUpdates && changed) {
                inboxPollHasDeferredChanges = true;
            }
            else if (!deferUpdates) {
                inboxEventCounts = incomingCounts;
                if (eventsResult.hasMore !== undefined)
                    inboxEventsHasMore = eventsResult.hasMore;
                if (eventsResult.nextCursor !== undefined)
                    inboxEventsNextCursor = eventsResult.nextCursor;
                if (issuesChanged)
                    inboxIssues = incomingIssues;
                if (eventsChanged)
                    inboxEvents = incomingEvents;
                inboxPollHasDeferredChanges = false;
                if (issuesChanged && myWorkTab === 'tasks')
                    renderInboxIssues();
                if (eventsChanged || countsChanged) {
                    renderInboxTabs();
                    if (myWorkTab === 'inbox')
                        renderInboxEvents();
                }
            }
            inboxPollDelay = nextInboxPollDelay(inboxPollDelay, changed && !deferUpdates, false);
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            if (isPollingActive())
                options.report(error instanceof Error ? error.message : 'Could not refresh your inbox.', true);
            inboxPollDelay = nextInboxPollDelay(inboxPollDelay, false, false);
        }
        finally {
            if (requestVersion === inboxPollRequestVersion) {
                inboxPollInFlight = false;
                const readyToApplyDeferredChanges = inboxPollHasDeferredChanges && !inboxUpdatesAreDeferred();
                if (readyToApplyDeferredChanges)
                    inboxPollDelay = 1000;
                if (isPollingActive())
                    schedulePoll(readyToApplyDeferredChanges ? 0 : inboxPollDelay);
            }
        }
    }
    function renderMyWorkTabs() {
        const inboxSelected = myWorkTab === 'inbox';
        myWorkInboxTab.classList.toggle('is-active', inboxSelected);
        myWorkInboxTab.setAttribute('aria-selected', String(inboxSelected));
        myWorkInboxTab.tabIndex = inboxSelected ? 0 : -1;
        myWorkTasksTab.classList.toggle('is-active', !inboxSelected);
        myWorkTasksTab.setAttribute('aria-selected', String(!inboxSelected));
        myWorkTasksTab.tabIndex = inboxSelected ? -1 : 0;
        myWorkInboxPanel.hidden = !inboxSelected;
        myWorkTasksPanel.hidden = inboxSelected;
        inboxMarkAllReadButton.hidden = !inboxSelected || inboxTab === 'done';
    }
    function renderInboxTabs() {
        const existing = new Map(Array.from(inboxTabsElement.querySelectorAll(':scope > .inbox-tab'))
            .map((button) => [button.dataset.inboxTab ?? '', button]));
        for (const [index, tab] of INBOX_TABS.entries()) {
            let button = existing.get(tab.id);
            if (button === undefined) {
                button = doc.createElement('button');
                button.type = 'button';
                button.id = `inbox-tab-${tab.id}`;
                button.className = 'inbox-tab';
                button.dataset.inboxTab = tab.id;
                button.setAttribute('role', 'tab');
                button.addEventListener('click', () => selectInboxTab(tab.id), { signal: listeners.signal });
            }
            button.classList.toggle('is-active', tab.id === inboxTab);
            button.setAttribute('aria-selected', String(tab.id === inboxTab));
            button.tabIndex = tab.id === inboxTab ? 0 : -1;
            const count = tab.id === 'unread' ? inboxEventCounts.unread
                : tab.id === 'mentions' ? inboxEventCounts.mentions
                    : null;
            button.textContent = count === null || count === 0 ? tab.label : `${tab.label} ${count}`;
            placeNodeAtPosition(inboxTabsElement, button, index);
            existing.delete(tab.id);
        }
        for (const button of existing.values())
            button.remove();
        inboxMarkAllReadButton.hidden = myWorkTab !== 'inbox' || inboxTab === 'done';
    }
    function renderInboxEvents() {
        const events = inboxEvents;
        const unread = inboxEventCounts.unread;
        inboxSummary.textContent = `${unread} unread ${unread === 1 ? 'event' : 'events'}.`;
        reconcileInboxRows(inboxIssueList, events, 'eventId', inboxEventRowRenderSignatures, (event) => createEventRow(event, {
            open: (target) => {
                if (!target.read)
                    void updateEvent(target, { read: true });
                options.onOpenEvent(target);
            },
            toggleRead: (target) => void updateEvent(target, { read: !target.read }),
            toggleDone: (target) => void updateEvent(target, { done: !target.done, read: true }),
        }));
        inboxEmptyState.textContent = 'Nothing here.';
        inboxEmptyState.hidden = events.length > 0;
        inboxLoadMoreButton.hidden = !inboxEventsHasMore;
        inboxLoadMoreButton.disabled = inboxMorePageLoading;
    }
    function placeNodeAtPosition(parent, node, index) {
        if (parent.children.item(index) === node)
            return;
        parent.insertBefore(node, parent.children.item(index));
    }
    function reconcileInboxRows(list, items, dataKey, signatures, create) {
        const existingRows = new Map();
        const rowsFromOtherCollections = [];
        for (const row of Array.from(list.querySelectorAll(':scope > .inbox-issue-card'))) {
            const rowId = row.dataset[dataKey];
            if (rowId === undefined || !Number.isSafeInteger(Number(rowId)))
                rowsFromOtherCollections.push(row);
            else
                existingRows.set(Number(rowId), row);
        }
        const focused = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
        const focusedRow = focused?.closest('.inbox-issue-card') ?? null;
        const focusedRowId = focusedRow === null ? null : Number(focusedRow.dataset[dataKey]);
        const focusedIndex = focusedRow === null ? -1 : Array.from(list.children).indexOf(focusedRow);
        const focusSelector = focused?.matches('.issue-title-button') ? '.issue-title-button'
            : focused?.matches('.inbox-event-read') ? '.inbox-event-read'
                : focused?.matches('.inbox-event-done') ? '.inbox-event-done'
                    : null;
        const expectedIds = new Set();
        rowsFromOtherCollections.forEach((row) => row.remove());
        for (const [index, item] of items.entries()) {
            expectedIds.add(item.id);
            const existingRow = existingRows.get(item.id);
            const signature = inboxItemSignature(item);
            let row = existingRow;
            if (row === undefined || signatures.get(row) !== signature) {
                row = create(item);
                signatures.set(row, signature);
                if (existingRow !== undefined) {
                    row.classList.toggle('is-keyboard-selected', existingRow.classList.contains('is-keyboard-selected'));
                    existingRow.replaceWith(row);
                }
            }
            placeNodeAtPosition(list, row, index);
        }
        for (const [id, row] of existingRows)
            if (!expectedIds.has(id))
                row.remove();
        if (focusedRowId === null || focusSelector === null)
            return;
        const focusedReplacement = Array.from(list.querySelectorAll(':scope > .inbox-issue-card'))
            .find((row) => Number(row.dataset[dataKey]) === focusedRowId);
        const focusTarget = focusedReplacement?.querySelector(focusSelector);
        if (focusTarget !== null && focusTarget !== undefined && focusedRow !== focusedReplacement) {
            focusTarget.focus();
        }
        else if (focusedRow !== null && !focusedRow.isConnected) {
            const nextRow = list.children.item(Math.min(Math.max(focusedIndex, 0), list.children.length - 1));
            const nextFocusTarget = nextRow?.querySelector('.issue-title-button')
                ?? inboxTabsElement.querySelector('.inbox-tab.is-active');
            nextFocusTarget?.focus();
        }
    }
    function inboxItemSignature(item) {
        return JSON.stringify(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
    }
    async function loadMoreEvents() {
        if (inboxMorePageLoading || !inboxEventsHasMore || inboxEventsNextCursor === null)
            return;
        inboxMorePageLoading = true;
        const requestVersion = ++inboxPollRequestVersion;
        inboxPollInFlight = true;
        renderInboxEvents();
        try {
            const page = await fetchConditionalInboxCollection(inboxEventPagePath(inboxTab, inboxEventsNextCursor), 'events', null);
            if (requestVersion !== inboxPollRequestVersion || !isPollingActive() || page.items === null)
                return;
            inboxEvents = mergeInboxEventPage(inboxEvents, page.items);
            inboxEventCounts = page.counts ?? inboxEventCounts;
            inboxEventsHasMore = page.hasMore ?? false;
            inboxEventsNextCursor = page.nextCursor ?? null;
            renderInboxTabs();
            renderInboxEvents();
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not load older inbox events.', true);
        }
        finally {
            inboxMorePageLoading = false;
            if (requestVersion === inboxPollRequestVersion) {
                inboxPollInFlight = false;
                if (isPollingActive())
                    schedulePoll(1000);
            }
            renderInboxEvents();
        }
    }
    async function updateEvent(event, change) {
        inboxMutationPending += 1;
        try {
            const result = await request(`/inbox/events/${event.id}`, {
                method: 'PATCH',
                body: JSON.stringify(change),
            });
            inboxEvents = eventsForTab(inboxEvents.map((candidate) => candidate.id === event.id ? result.event : candidate), inboxTab);
            inboxEventsEtag = null;
            inboxPollDelay = 1000;
            renderInboxTabs();
            renderInboxEvents();
            inboxPollRequestVersion += 1;
            inboxPollInFlight = false;
            schedulePoll(0);
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not update the event.', true);
        }
        finally {
            inboxMutationPending -= 1;
            resumeDeferredPolling();
        }
    }
    async function markAllEventsRead() {
        inboxMutationPending += 1;
        try {
            await request('/inbox/events/read-all', { method: 'POST' });
            inboxEvents = inboxEvents.map((event) => ({ ...event, read: true }));
            if (inboxTab === 'unread') {
                inboxEvents = [];
                inboxEventsHasMore = false;
                inboxEventsNextCursor = null;
            }
            inboxEventCounts = { ...inboxEventCounts, unread: 0 };
            inboxEventsEtag = null;
            inboxPollDelay = 1000;
            renderInboxTabs();
            renderInboxEvents();
            inboxPollRequestVersion += 1;
            inboxPollInFlight = false;
            schedulePoll(0);
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not mark events as read.', true);
        }
        finally {
            inboxMutationPending -= 1;
            resumeDeferredPolling();
        }
    }
    function renderInboxIssues() {
        const projectCount = new Set(inboxIssues.map((issue) => issue.project_id)).size;
        myWorkTasksSummary.textContent = inboxIssues.length === 0
            ? 'Open issues assigned to you across your projects.'
            : `${inboxIssues.length} open ${inboxIssues.length === 1 ? 'issue' : 'issues'} assigned to you in ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}.`;
        const openGroups = new Map(Array.from(myWorkTaskGroups.querySelectorAll('.my-work-task-group'))
            .map((group) => [group.dataset.groupKey ?? '', group.open]));
        const selectedIssueId = myWorkTaskGroups.querySelector('.inbox-issue-card.is-keyboard-selected')?.dataset.issueId;
        const fragment = doc.createDocumentFragment();
        for (const project of groupMyWorkTasks(inboxIssues)) {
            const projectSection = doc.createElement('section');
            projectSection.className = 'my-work-project-group';
            projectSection.setAttribute('aria-label', project.projectName);
            const projectHeading = doc.createElement('h2');
            projectHeading.className = 'my-work-project-heading';
            projectHeading.textContent = project.projectName;
            projectSection.append(projectHeading);
            for (const milestone of project.milestones) {
                const group = doc.createElement('details');
                group.className = 'my-work-task-group';
                group.dataset.groupKey = milestone.key;
                group.open = openGroups.get(milestone.key) ?? true;
                const summary = doc.createElement('summary');
                summary.className = 'my-work-task-group-summary';
                const name = doc.createElement('span');
                name.className = 'my-work-task-group-name';
                name.textContent = milestone.name;
                const count = doc.createElement('span');
                count.className = 'my-work-task-group-count';
                count.textContent = `${milestone.tasks.length} ${milestone.tasks.length === 1 ? 'task' : 'tasks'}`;
                summary.append(name, count);
                if (milestone.dueDate !== null) {
                    const dueDate = doc.createElement('span');
                    dueDate.className = 'my-work-task-group-date';
                    dueDate.textContent = `Due ${options.formatDueDate(milestone.dueDate)}`;
                    summary.append(dueDate);
                }
                const list = doc.createElement('ul');
                list.className = 'issue-list inbox-issue-list';
                list.setAttribute('aria-label', `${project.projectName}, ${milestone.name}`);
                for (const issue of milestone.tasks) {
                    const row = createInboxIssueRow(issue);
                    if (String(issue.id) === selectedIssueId)
                        row.classList.add('is-keyboard-selected');
                    list.append(row);
                }
                group.append(summary, list);
                projectSection.append(group);
            }
            fragment.append(projectSection);
        }
        myWorkTaskGroups.replaceChildren(fragment);
        myWorkTasksEmptyState.textContent = 'You have no open issues assigned to you.';
        myWorkTasksEmptyState.hidden = inboxIssues.length > 0;
    }
    function createInboxIssueRow(issue) {
        const item = doc.createElement('li');
        item.className = 'issue-card inbox-issue-card';
        item.dataset.issueId = String(issue.id);
        const marker = doc.createElement('span');
        marker.className = `inbox-marker is-${issue.status}`;
        marker.setAttribute('aria-hidden', 'true');
        const content = doc.createElement('div');
        content.className = 'issue-content';
        const mainline = doc.createElement('div');
        mainline.className = 'issue-mainline';
        const key = doc.createElement('span');
        key.className = 'issue-key';
        key.textContent = `#${issue.id}`;
        const title = doc.createElement('button');
        title.className = 'issue-title issue-title-button';
        title.type = 'button';
        title.textContent = issue.title;
        title.setAttribute('aria-label', `Open ${issue.title} in ${issue.project_name}`);
        title.addEventListener('click', () => options.onOpenIssue(issue));
        const primary = doc.createElement('div');
        primary.className = 'inbox-issue-primary';
        const metadata = doc.createElement('div');
        metadata.className = 'issue-metadata inbox-issue-metadata';
        const status = doc.createElement('span');
        status.className = `inbox-issue-status is-${issue.status}`;
        status.textContent = options.issueStatusLabel(issue.status);
        metadata.append(status);
        if (issue.type !== 'task') {
            const type = doc.createElement('span');
            type.className = 'issue-type-tag';
            type.textContent = options.issueTypeLabel(issue.type);
            metadata.append(type);
        }
        if (issue.priority !== 'medium') {
            const priority = doc.createElement('span');
            priority.className = `issue-priority-tag is-${issue.priority}`;
            priority.textContent = `${options.issuePriorityLabel(issue.priority)} priority`;
            metadata.append(priority);
        }
        if (issue.due_date !== null) {
            const dueDate = doc.createElement('span');
            const overdue = options.isIssueOverdue(issue);
            dueDate.className = `issue-due-date-tag${overdue ? ' is-overdue' : ''}`;
            dueDate.textContent = `${overdue ? 'Overdue' : 'Due'} ${options.formatDueDate(issue.due_date)}`;
            metadata.append(dueDate);
        }
        const discussionIndicator = options.createDiscussionIndicator(issue.discussion_count ?? 0);
        if (discussionIndicator !== null)
            metadata.append(discussionIndicator);
        primary.append(title, metadata);
        mainline.append(key, primary);
        content.append(mainline);
        const updated = doc.createElement('time');
        updated.className = 'inbox-updated';
        updated.dateTime = issue.updated_at;
        updated.textContent = new Date(issue.updated_at).toLocaleString(undefined, {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        });
        item.append(marker, content, updated);
        return item;
    }
    function selectMyWorkTab(tab) {
        myWorkTab = tab;
        renderMyWorkTabs();
        if (tab === 'tasks')
            renderInboxIssues();
        else {
            renderInboxTabs();
            renderInboxEvents();
        }
        schedulePoll(0);
    }
    function selectInboxTab(tab) {
        inboxTab = tab;
        inboxEvents = [];
        inboxEventsEtag = null;
        inboxEventsHasMore = false;
        inboxEventsNextCursor = null;
        inboxLoadMoreButton.hidden = true;
        inboxPollRequestVersion += 1;
        inboxPollInFlight = false;
        renderInboxTabs();
        renderInboxEvents();
        schedulePoll(0);
    }
    function activeMyWorkListRoot() {
        return myWorkTab === 'tasks' ? myWorkTaskGroups : inboxIssueList;
    }
    function visibleIssueTitleButtons() {
        return Array.from(activeMyWorkListRoot().querySelectorAll('.issue-title-button'))
            .filter((button) => button.closest('.my-work-task-group')?.open !== false);
    }
    function selectedIssueButton() {
        const focused = doc.activeElement;
        const activeList = activeMyWorkListRoot();
        if (focused instanceof HTMLElement && activeList.contains(focused)) {
            const focusedRow = focused.closest('.inbox-issue-card');
            if (focusedRow !== null)
                return focusedRow.querySelector('.issue-title-button');
        }
        const selected = activeList.querySelector('.inbox-issue-card.is-keyboard-selected .issue-title-button');
        return selected?.closest('.my-work-task-group')?.open === false ? null : selected;
    }
    function updateIssueDiscussionCount(issueId, count) {
        inboxIssues = inboxIssues.map((issue) => issue.id === issueId && (issue.discussion_count ?? 0) !== count
            ? { ...issue, discussion_count: count }
            : issue);
        if (isPollingActive() && myWorkTab === 'tasks')
            renderInboxIssues();
    }
    function load() {
        renderMyWorkTabs();
        renderInboxTabs();
        if (!isPollingActive())
            return;
        if (myWorkTab === 'tasks')
            renderInboxIssues();
        else
            renderInboxEvents();
        inboxPollDelay = 1000;
        schedulePoll(0);
    }
    function clearForNavigation() {
        stopPolling();
        inboxIssues = [];
        inboxEvents = [];
        inboxEventCounts = { unread: 0, mentions: 0 };
        inboxEventsHasMore = false;
        inboxEventsNextCursor = null;
    }
    function reset() {
        clearForNavigation();
        inboxMorePageLoading = false;
        myWorkTab = 'inbox';
        inboxTab = 'unread';
        inboxIssueList.replaceChildren();
        myWorkTaskGroups.replaceChildren();
        inboxEmptyState.hidden = false;
        inboxEmptyState.textContent = 'Nothing here.';
        myWorkTasksEmptyState.hidden = false;
        myWorkTasksEmptyState.textContent = 'You have no open issues assigned to you.';
        renderMyWorkTabs();
        renderInboxTabs();
    }
    function resumePolling() {
        if (!isPollingActive())
            return;
        inboxPollDelay = 1000;
        schedulePoll(0);
    }
    function dispose() {
        listeners.abort();
        stopPolling();
    }
    myWorkInboxTab.addEventListener('click', () => selectMyWorkTab('inbox'), { signal: listeners.signal });
    myWorkTasksTab.addEventListener('click', () => selectMyWorkTab('tasks'), { signal: listeners.signal });
    myWorkTabsElement.addEventListener('keydown', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement) || event.altKey || event.ctrlKey || event.metaKey)
            return;
        const currentIndex = target === myWorkInboxTab ? 0 : target === myWorkTasksTab ? 1 : -1;
        if (currentIndex < 0)
            return;
        let nextIndex;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft')
            nextIndex = currentIndex === 0 ? 1 : 0;
        else if (event.key === 'Home')
            nextIndex = 0;
        else if (event.key === 'End')
            nextIndex = 1;
        else
            return;
        event.preventDefault();
        event.stopPropagation();
        const nextTab = nextIndex === 0 ? myWorkInboxTab : myWorkTasksTab;
        selectMyWorkTab(nextIndex === 0 ? 'inbox' : 'tasks');
        nextTab.focus();
    }, { signal: listeners.signal });
    inboxTabsElement.addEventListener('keydown', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement) || event.altKey || event.ctrlKey || event.metaKey)
            return;
        const currentIndex = INBOX_TABS.findIndex((tab) => tab.id === target.dataset.inboxTab);
        if (currentIndex < 0)
            return;
        let nextIndex;
        if (event.key === 'ArrowRight')
            nextIndex = (currentIndex + 1) % INBOX_TABS.length;
        else if (event.key === 'ArrowLeft')
            nextIndex = (currentIndex - 1 + INBOX_TABS.length) % INBOX_TABS.length;
        else if (event.key === 'Home')
            nextIndex = 0;
        else if (event.key === 'End')
            nextIndex = INBOX_TABS.length - 1;
        else
            return;
        const nextTab = INBOX_TABS[nextIndex];
        if (nextTab === undefined)
            return;
        event.preventDefault();
        event.stopPropagation();
        selectInboxTab(nextTab.id);
        inboxTabsElement.querySelector(`#inbox-tab-${nextTab.id}`)?.focus();
    }, { signal: listeners.signal });
    inboxMarkAllReadButton.addEventListener('click', () => { void markAllEventsRead(); }, { signal: listeners.signal });
    inboxLoadMoreButton.addEventListener('click', () => { void loadMoreEvents(); }, { signal: listeners.signal });
    return {
        load,
        pollNow,
        stopPolling,
        clearForNavigation,
        reset,
        isPollingActive,
        resumePolling,
        resumeDeferredUpdates: resumeDeferredPolling,
        visibleIssueTitleButtons,
        selectedIssueButton,
        hasSelectedIssue: () => selectedIssueButton() !== null,
        updateIssueDiscussionCount,
        updateEvent,
        markAllEventsRead,
        dispose,
    };
}
