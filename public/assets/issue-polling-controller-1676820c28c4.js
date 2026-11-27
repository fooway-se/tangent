import { bindRealtimePolling, shouldUsePolling } from './realtime-polling-9539ddcb4474.js';
import { diffConditionalIssueCollections, loadIssueCollections, nextIssuePollDelay, } from './issue-polling-83fefe215877.js';
export function initIssuePollingController(options) {
    let timer = null;
    let delay = 1000;
    let activeEtag = null;
    let deletedEtag = null;
    let hasDeferredChanges = false;
    let inFlightProjectId = null;
    let requestVersion = 0;
    function pause() {
        if (timer !== null)
            options.clearTimeout(timer);
        timer = null;
        requestVersion += 1;
        inFlightProjectId = null;
    }
    function stop(resetState = true) {
        pause();
        if (!resetState)
            return;
        delay = 1000;
        activeEtag = null;
        deletedEtag = null;
        hasDeferredChanges = false;
    }
    function schedule(nextDelay = delay) {
        const projectId = options.getProjectId();
        if (projectId === null || !options.isPollingActive(projectId)) {
            pause();
            return;
        }
        if (!shouldUsePolling(options.realtime)) {
            pause();
            return;
        }
        if (timer !== null)
            options.clearTimeout(timer);
        timer = options.setTimeout(() => {
            timer = null;
            void poll(projectId);
        }, nextDelay);
    }
    function resumeDeferred() {
        const projectId = options.getProjectId();
        if (hasDeferredChanges && projectId !== null && options.isPollingActive(projectId)
            && !options.issueUpdatesAreDeferred()) {
            delay = 1000;
            schedule(0);
        }
    }
    async function poll(projectId) {
        if (!options.isPollingActive(projectId))
            return;
        if (inFlightProjectId === projectId)
            return;
        if (options.isDocumentHidden()) {
            delay = nextIssuePollDelay(delay, false, true);
            schedule(delay);
            return;
        }
        const deferUpdatesAtStart = options.issueUpdatesAreDeferred();
        const forceDeferredRefresh = hasDeferredChanges && !deferUpdatesAtStart;
        const currentActiveEtag = forceDeferredRefresh ? null : activeEtag;
        const currentDeletedEtag = forceDeferredRefresh ? null : deletedEtag;
        const currentRequestVersion = ++requestVersion;
        inFlightProjectId = projectId;
        let changed = false;
        try {
            const collections = await loadIssueCollections(() => options.fetchConditionalIssueList(projectId, false, currentActiveEtag), () => options.fetchConditionalIssueList(projectId, true, currentDeletedEtag), options.isDeletedIssuesOpen());
            const activeResult = collections.active;
            const deletedResult = collections.deleted ?? { issues: null, etag: deletedEtag };
            if (currentRequestVersion !== requestVersion || !options.isPollingActive(projectId))
                return;
            const deferUpdates = deferUpdatesAtStart || options.issueUpdatesAreDeferred();
            const diffs = diffConditionalIssueCollections(options.getIssues(), activeResult.issues, options.getDeletedIssues(), deletedResult.issues);
            const activeDiff = diffs.active;
            const changedActive = activeDiff !== null
                && (activeDiff.added.length > 0 || activeDiff.changed.length > 0 || activeDiff.removed.length > 0);
            const deletedDiff = diffs.deleted;
            const changedDeleted = deletedDiff !== null
                && (deletedDiff.added.length > 0 || deletedDiff.changed.length > 0 || deletedDiff.removed.length > 0);
            changed = changedActive || changedDeleted;
            activeEtag = activeResult.etag;
            if (collections.deleted !== null)
                deletedEtag = deletedResult.etag;
            if (deferUpdates && changed) {
                hasDeferredChanges = true;
            }
            else if (!deferUpdates) {
                if (activeResult.issues !== null)
                    options.setIssues(activeResult.issues);
                if (deletedResult.issues !== null)
                    options.setDeletedIssues(deletedResult.issues);
                hasDeferredChanges = false;
                if (changed) {
                    const selectedIssue = options.getSelectedIssue();
                    if (selectedIssue !== null) {
                        const refreshedSelectedIssue = options.getIssues().find((issue) => issue.id === selectedIssue.id);
                        if (refreshedSelectedIssue !== undefined) {
                            options.setSelectedIssue(refreshedSelectedIssue);
                            if (activeDiff?.added.includes(selectedIssue.id) || activeDiff?.changed.includes(selectedIssue.id)) {
                                options.renderIssueDetail();
                                if (selectedIssue.status !== refreshedSelectedIssue.status) {
                                    void options.loadStatusHistory(selectedIssue.id);
                                }
                            }
                        }
                        else if (options.isIssueDetailVisible()) {
                            options.setSelectedIssue(null);
                            options.onIssueRemovedFromDetail();
                        }
                    }
                    options.renderBoard();
                }
                const selectedIssue = options.getSelectedIssue();
                if (options.isIssueDetailVisible() && selectedIssue !== null) {
                    void options.loadPullRequests?.(selectedIssue.id);
                }
            }
            delay = nextIssuePollDelay(delay, changed && !deferUpdates, false);
        }
        catch (error) {
            if (options.onError(error))
                return;
            delay = nextIssuePollDelay(delay, false, false);
        }
        finally {
            if (currentRequestVersion === requestVersion) {
                if (inFlightProjectId === projectId)
                    inFlightProjectId = null;
                const readyToApplyDeferredChanges = hasDeferredChanges && !options.issueUpdatesAreDeferred();
                if (readyToApplyDeferredChanges)
                    delay = 1000;
                if (options.isPollingActive(projectId))
                    schedule(readyToApplyDeferredChanges ? 0 : delay);
            }
        }
    }
    const unbindRealtime = bindRealtimePolling({
        realtime: options.realtime,
        isActive: () => {
            const projectId = options.getProjectId();
            return projectId !== null && options.isPollingActive(projectId);
        },
        pausePolling: pause,
        resumePolling: () => schedule(0),
        refresh: () => {
            const projectId = options.getProjectId();
            if (projectId !== null)
                void poll(projectId);
        },
    });
    return {
        pause,
        stop,
        resumeDeferred,
        isActive: (projectId) => options.isPollingActive(projectId),
        schedule,
        poll,
        getDelay: () => delay,
        resetDelay: () => { delay = 1000; },
        seedActiveEtag: (etag) => { activeEtag = etag; },
        seedDeletedEtag: (etag) => { deletedEtag = etag; },
        clearDeferredChanges: () => { hasDeferredChanges = false; },
        hasDeferredChanges: () => hasDeferredChanges,
        dispose: unbindRealtime,
    };
}
