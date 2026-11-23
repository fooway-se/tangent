import { milestoneStatus } from './roadmap.js';
export function initRoadmapUi(options) {
    const { doc } = options;
    function formatRoadmapDate(value) {
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
        }).format(new Date(`${value}T00:00:00Z`));
    }
    function render(milestones) {
        const today = options.today?.() ?? new Date();
        const statuses = milestones.map((milestone) => milestoneStatus(milestone, today));
        const completed = statuses.filter((status) => status.key === 'complete').length;
        const needsAttention = statuses.filter((status) => status.key === 'needs-attention').length;
        const missedDeadline = statuses.filter((status) => status.key === 'missed-deadline').length;
        const summary = [
            ['Left', milestones.length - completed],
            ['Complete', completed],
            ['Needs attention', needsAttention],
            ['Missed deadline', missedDeadline],
        ];
        options.summary.replaceChildren(...summary.map(([label, value]) => {
            const item = doc.createElement('li');
            item.className = 'roadmap-summary-item';
            const count = doc.createElement('strong');
            count.className = 'roadmap-summary-count';
            count.textContent = String(value);
            const name = doc.createElement('span');
            name.textContent = label;
            item.append(count, name);
            return item;
        }));
        options.milestoneList.replaceChildren();
        options.emptyState.hidden = milestones.length > 0;
        milestones.forEach((milestone, index) => {
            const status = statuses[index];
            const item = doc.createElement('li');
            item.className = 'roadmap-milestone';
            item.dataset.status = status.key;
            const top = doc.createElement('div');
            top.className = 'roadmap-milestone-top';
            const titleBlock = doc.createElement('div');
            titleBlock.className = 'roadmap-milestone-title';
            const projectButton = doc.createElement('button');
            projectButton.type = 'button';
            projectButton.className = 'roadmap-project-link';
            projectButton.textContent = milestone.project_name;
            projectButton.setAttribute('aria-label', `Open ${milestone.project_name} issues`);
            projectButton.addEventListener('click', () => options.openProject(milestone.project_id));
            const title = doc.createElement('h2');
            title.textContent = milestone.name;
            titleBlock.append(projectButton, title);
            const badge = doc.createElement('span');
            badge.className = `roadmap-status is-${status.key}`;
            badge.textContent = status.label;
            top.append(titleBlock, badge);
            const details = doc.createElement('div');
            details.className = 'roadmap-milestone-details';
            const date = doc.createElement('span');
            date.className = 'roadmap-milestone-date';
            date.textContent = milestone.due_date === null ? 'No due date' : `Due ${formatRoadmapDate(milestone.due_date)}`;
            const workload = doc.createElement('span');
            workload.className = 'roadmap-milestone-workload';
            const teamMemberLabel = milestone.assigned_team_members === 1 ? 'team member assigned' : 'team members assigned';
            const unassignedLabel = milestone.tasks_without_team_assignee === 1 ? 'task without team assignment' : 'tasks without team assignment';
            workload.textContent = `${milestone.remaining_tasks} remaining · ${milestone.assigned_team_members} ${teamMemberLabel} · ${milestone.tasks_without_team_assignee} ${unassignedLabel}`;
            details.append(date, workload);
            const progress = doc.createElement('progress');
            progress.className = `roadmap-progress${status.key === 'complete' ? ' is-complete' : ''}`;
            progress.max = Math.max(1, milestone.total_tasks);
            progress.value = milestone.completed_tasks;
            progress.setAttribute('aria-label', `${milestone.completed_tasks} of ${milestone.total_tasks} tasks complete for ${milestone.name}`);
            const progressLabel = doc.createElement('span');
            progressLabel.className = 'roadmap-progress-label';
            progressLabel.textContent = `${milestone.completed_tasks} of ${milestone.total_tasks} tasks done`;
            item.append(top, details, progress, progressLabel);
            options.milestoneList.append(item);
        });
    }
    return { render };
}
