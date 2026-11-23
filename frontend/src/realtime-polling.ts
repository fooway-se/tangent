import type { RealtimeUpdates } from './realtime-transport.js';

export interface RealtimePollingOptions {
  realtime?: RealtimeUpdates;
  isActive: () => boolean;
  pausePolling: () => void;
  resumePolling: () => void;
  refresh: () => void;
}

export function shouldUsePolling(realtime?: RealtimeUpdates): boolean {
  return realtime?.isConnected() !== true;
}

export function bindRealtimePolling(options: RealtimePollingOptions): () => void {
  const realtime = options.realtime;
  if (realtime === undefined) return () => undefined;

  const removeConnectionListener = realtime.onConnectionChange((connected) => {
    if (connected) {
      options.pausePolling();
      if (options.isActive()) options.refresh();
    } else if (options.isActive()) options.resumePolling();
  });
  const removeUpdateListener = realtime.onUpdate(() => {
    if (realtime.isConnected() && options.isActive()) options.refresh();
  });
  if (realtime.isConnected()) {
    options.pausePolling();
    if (options.isActive()) options.refresh();
  }

  return () => {
    removeConnectionListener();
    removeUpdateListener();
  };
}
