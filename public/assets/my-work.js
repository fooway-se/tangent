import { groupIssuesByMilestone } from './issue-board.js';
export function groupMyWorkTasks(tasks) {
    const tasksByProject = new Map();
    for (const task of tasks) {
        const projectTasks = tasksByProject.get(task.project_id) ?? [];
        projectTasks.push(task);
        tasksByProject.set(task.project_id, projectTasks);
    }
    return [...tasksByProject.entries()]
        .map(([projectId, projectTasks]) => {
        const milestonesById = new Map();
        for (const task of projectTasks) {
            if (task.milestone_id === null)
                continue;
            milestonesById.set(task.milestone_id, {
                id: task.milestone_id,
                name: task.milestone_name ?? `Milestone ${task.milestone_id}`,
                due_date: task.milestone_due_date ?? null,
            });
        }
        const firstTask = projectTasks[0];
        return {
            projectId,
            projectName: firstTask.project_name,
            milestones: groupIssuesByMilestone(projectTasks, [...milestonesById.values()]).map((group) => ({
                key: `${projectId}:${group.isOngoing ? 'ongoing' : group.milestoneId ?? 'none'}`,
                milestoneId: group.milestoneId,
                name: group.name,
                dueDate: group.dueDate,
                isOngoing: group.isOngoing,
                tasks: group.issues,
            })),
        };
    })
        .sort((left, right) => left.projectName.localeCompare(right.projectName, undefined, { sensitivity: 'base' })
        || left.projectId - right.projectId);
}
