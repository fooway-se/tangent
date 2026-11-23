export function initIssueDetailView(options) {
    const rowRenderSignatures = new WeakMap();
    function renderDetail() {
        const issue = options.getSelectedIssue();
        if (issue === null)
            return;
        const elements = options.elements;
        elements.issueDetailTitle.textContent = issue.title;
        elements.issueDetailType.textContent = options.issueTypeLabel(issue.type);
        elements.issueDetailPriority.textContent = options.issuePriorityLabel(issue.priority);
        const overdue = options.isIssueOverdue(issue);
        elements.issueDetailDueDate.textContent = issue.due_date === null
            ? 'None'
            : `${overdue ? 'Overdue · ' : ''}${options.formatIssueDueDate(issue.due_date)}`;
        elements.issueDetailDueDate.classList.toggle('is-overdue', overdue);
        elements.issueDetailAssignee.textContent = options.issueAssigneeLabel(issue.assignee_id);
        elements.issueDetailMilestone.textContent = options.getMilestones().find((milestone) => milestone.id === issue.milestone_id)?.name ?? 'None';
        elements.issueDetailOngoingRow.hidden = !issue.is_ongoing;
        elements.issueDetailSharing.textContent = issue.is_shared ? 'Shared' : 'Internal only';
        elements.issueDetailApproval.textContent = issue.approved_at !== null
            ? 'Approved'
            : issue.approval_requested_at !== null
                ? 'Requested'
                : 'Not requested';
        elements.issueDetailDescription.textContent = issue.description || 'No description yet.';
        elements.issueDetailDescription.classList.toggle('is-empty', issue.description === '');
        elements.issueDetailContext.textContent = issue.context;
        elements.issueDetailExpectedOutcome.textContent = issue.expected_outcome;
        elements.issueDetailAcceptanceCriteria.textContent = issue.acceptance_criteria;
        elements.issueDetailContextSection.hidden = issue.context === '';
        elements.issueDetailExpectedOutcomeSection.hidden = issue.expected_outcome === '';
        elements.issueDetailAcceptanceCriteriaSection.hidden = issue.acceptance_criteria === '';
        elements.issueDetailBrief.hidden = issue.context === ''
            && issue.expected_outcome === ''
            && issue.acceptance_criteria === '';
        elements.issueDetailStatusLabel.textContent = options.issueStatusLabel(issue.status);
        elements.issueDetailStatus.setAttribute('aria-label', `Change status for ${issue.title}. Current status: ${options.issueStatusLabel(issue.status)}.`);
        elements.issueSourceLink.hidden = issue.source_message_id === null;
        if (issue.source_message_id !== null) {
            elements.issueSourceLink.dataset.messageId = String(issue.source_message_id);
        }
        else {
            delete elements.issueSourceLink.dataset.messageId;
        }
        options.renderPullRequests();
    }
    function createDeletedRow(issue) {
        const item = options.doc.createElement('li');
        item.className = 'deleted-issue-item';
        item.dataset.issueId = String(issue.id);
        const content = options.doc.createElement('div');
        content.className = 'deleted-issue-content';
        const title = options.doc.createElement('strong');
        title.textContent = issue.title;
        const status = options.doc.createElement('span');
        status.className = 'deleted-issue-status';
        status.textContent = `Was ${options.issueStatusLabel(issue.status)}`;
        content.append(title, status);
        const restoreButton = options.doc.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'button button-secondary';
        restoreButton.textContent = 'Restore';
        const project = options.getProject();
        restoreButton.disabled = project !== null && options.isProjectReadOnly(project.status);
        restoreButton.dataset.issueId = String(issue.id);
        restoreButton.setAttribute('aria-label', `Restore ${issue.title}`);
        restoreButton.addEventListener('click', () => { void options.restoreIssue(issue, restoreButton); });
        item.append(content, restoreButton);
        return item;
    }
    function reconcileDeletedRows() {
        const existingRows = new Map(Array.from(options.deletedIssueList.querySelectorAll(':scope > .deleted-issue-item'))
            .map((row) => [Number(row.dataset.issueId), row]));
        const expectedIds = new Set();
        for (const [index, issue] of options.getDeletedIssues().entries()) {
            expectedIds.add(issue.id);
            const signature = JSON.stringify([issue.title, issue.status]);
            const existing = existingRows.get(issue.id);
            const row = existing !== undefined && rowRenderSignatures.get(existing) === signature
                ? existing
                : createDeletedRow(issue);
            if (row !== existing) {
                rowRenderSignatures.set(row, signature);
                if (existing !== undefined)
                    options.replaceRowPreservingFocus(existing, row);
            }
            options.placeNodeAtPosition(options.deletedIssueList, row, index);
        }
        options.deletedIssueList.querySelectorAll(':scope > .deleted-issue-item').forEach((row) => {
            if (!expectedIds.has(Number(row.dataset.issueId)))
                row.remove();
        });
    }
    return { renderDetail, reconcileDeletedRows };
}
