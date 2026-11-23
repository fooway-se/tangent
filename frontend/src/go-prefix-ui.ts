export interface GoPrefixContext {
  workspaceCount: number;
  hasProject: boolean;
  projectVisible: boolean;
  isAdmin: boolean;
  canUseRoadmap: boolean;
}

export interface GoPrefixUiOptions {
  hint: HTMLElement;
  workspaceOption: HTMLElement;
  projectOptions: HTMLElement;
  adminOption: HTMLElement;
  roadmapOption: HTMLElement;
  getContext: () => GoPrefixContext;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timer: number) => void;
}

export function initGoPrefixUi(options: GoPrefixUiOptions): {
  isPending: () => boolean;
  clear: () => void;
  start: () => void;
} {
  let pending = false;
  let timer: number | null = null;

  function clear(): void {
    pending = false;
    options.hint.hidden = true;
    if (timer !== null) options.clearTimeout(timer);
    timer = null;
  }

  function start(): void {
    clear();
    pending = true;
    const context = options.getContext();
    options.workspaceOption.hidden = context.workspaceCount < 2;
    options.projectOptions.hidden = !context.hasProject || !context.projectVisible;
    options.adminOption.hidden = !context.isAdmin;
    options.roadmapOption.hidden = !context.canUseRoadmap;
    options.hint.hidden = false;
    timer = options.setTimeout(clear, 1200);
  }

  return { isPending: () => pending, clear, start };
}
