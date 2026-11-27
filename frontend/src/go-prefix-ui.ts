export interface GoPrefixUiOptions {
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
    if (timer !== null) options.clearTimeout(timer);
    timer = null;
  }

  function start(): void {
    clear();
    pending = true;
    timer = options.setTimeout(clear, 1200);
  }

  return { isPending: () => pending, clear, start };
}
