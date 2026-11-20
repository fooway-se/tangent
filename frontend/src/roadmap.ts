export interface RoadmapMilestone {
  id: number;
  project_id: number;
  project_name: string;
  project_status: 'active' | 'paused' | 'completed';
  name: string;
  due_date: string | null;
  total_tasks: number;
  completed_tasks: number;
  remaining_tasks: number;
  assigned_team_members: number;
  tasks_without_team_assignee: number;
}

export type RoadmapStatusKey =
  | 'complete'
  | 'missed-deadline'
  | 'needs-attention'
  | 'due-soon'
  | 'upcoming'
  | 'in-progress'
  | 'no-deadline';

export interface RoadmapStatus {
  key: RoadmapStatusKey;
  label: string;
}

const DAYS_UNTIL_DEADLINE_NEEDS_ATTENTION = 7;

export function milestoneStatus(milestone: RoadmapMilestone, today = new Date()): RoadmapStatus {
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const done = milestone.completed_tasks;
  const remaining = milestone.remaining_tasks;

  if (milestone.total_tasks > 0 && remaining === 0 && done === milestone.total_tasks) {
    return { key: 'complete', label: 'Complete' };
  }
  if (milestone.due_date !== null && milestone.due_date < todayText) {
    return { key: 'missed-deadline', label: 'Missed deadline' };
  }
  if (milestone.due_date !== null) {
    const daysUntil = calendarDaysBetween(todayText, milestone.due_date);
    if (daysUntil <= DAYS_UNTIL_DEADLINE_NEEDS_ATTENTION) {
      const tooMuchWorkForAssignedTeam = remaining > Math.max(2, milestone.assigned_team_members * 2);
      if (remaining > 0 && (milestone.tasks_without_team_assignee > 0 || tooMuchWorkForAssignedTeam)) {
        return { key: 'needs-attention', label: 'Needs attention' };
      }
      return { key: 'due-soon', label: 'Due soon' };
    }
    return done > 0 ? { key: 'in-progress', label: 'In progress' } : { key: 'upcoming', label: 'Upcoming' };
  }
  if (done > 0) return { key: 'in-progress', label: 'In progress' };
  return { key: 'no-deadline', label: 'No deadline' };
}

function calendarDaysBetween(from: string, to: string): number {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toTime - fromTime) / 86_400_000);
}
