export function shouldHideProjectSidebarVent(
  scrollSize: number,
  visibleSize: number,
): boolean {
  return visibleSize > 0 && scrollSize > visibleSize + 1;
}

export type ProjectSidebarLayoutStage =
  | 'normal'
  | 'vent-hidden'
  | 'buttons-compact'
  | 'scrollable';

export function getProjectSidebarLayoutStage(
  overflowsBeforeVent: boolean,
  overflowsAfterVent: boolean,
  projectLinksOverflowAfterCompactButtons: boolean,
): ProjectSidebarLayoutStage {
  if (!overflowsBeforeVent) return 'normal';
  if (!overflowsAfterVent) return 'vent-hidden';
  if (!projectLinksOverflowAfterCompactButtons) return 'buttons-compact';
  return 'scrollable';
}
