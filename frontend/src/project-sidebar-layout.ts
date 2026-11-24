export function shouldHideProjectSidebarVent(
  scrollSize: number,
  visibleSize: number,
): boolean {
  return visibleSize > 0 && scrollSize > visibleSize + 1;
}
