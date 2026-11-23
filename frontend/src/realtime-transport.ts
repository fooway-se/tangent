export interface RealtimeEventSource {
  readonly readyState?: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  close(): void;
}

export interface RealtimeUpdates {
  isConnected(): boolean;
  onUpdate(listener: () => void): () => void;
  onConnectionChange(listener: (connected: boolean) => void): () => void;
}

export interface RealtimeTransportOptions {
  url: string;
  eventSourceFactory?: (url: string) => RealtimeEventSource;
  setTimeout?: (callback: () => void, delay: number) => number;
  clearTimeout?: (timer: number) => void;
  connectionTimeoutMs?: number;
  heartbeatTimeoutMs?: number;
  disconnectGraceMs?: number;
  reconnectDelayMs?: number;
}

export interface RealtimeTransportController extends RealtimeUpdates {
  start(): void;
  stop(): void;
  dispose(): void;
}

const CONNECTION_TIMEOUT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;
const DISCONNECT_GRACE_MS = 5_000;
const RECONNECT_DELAY_MS = 30_000;
const EVENT_SOURCE_CLOSED = 2;

export function initRealtimeTransport(options: RealtimeTransportOptions): RealtimeTransportController {
  const createEventSource = options.eventSourceFactory
    ?? ((url: string) => new EventSource(url, { withCredentials: true }));
  const setTimeoutFn = options.setTimeout ?? ((callback, delay) => window.setTimeout(callback, delay));
  const clearTimeoutFn = options.clearTimeout ?? ((timer) => window.clearTimeout(timer));
  const connectionTimeoutMs = options.connectionTimeoutMs ?? CONNECTION_TIMEOUT_MS;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
  const disconnectGraceMs = options.disconnectGraceMs ?? DISCONNECT_GRACE_MS;
  const reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS;
  const updateListeners = new Set<() => void>();
  const connectionListeners = new Set<(connected: boolean) => void>();
  let source: RealtimeEventSource | null = null;
  let connected = false;
  let running = false;
  let connectionTimer: number | null = null;
  let heartbeatTimer: number | null = null;
  let disconnectTimer: number | null = null;
  let reconnectTimer: number | null = null;

  function clearTimer(timer: number | null): null {
    if (timer !== null) clearTimeoutFn(timer);
    return null;
  }

  function setConnected(nextConnected: boolean): void {
    if (connected === nextConnected) return;
    connected = nextConnected;
    for (const listener of connectionListeners) listener(connected);
  }

  function publishUpdate(): void {
    for (const listener of updateListeners) listener();
  }

  function stopSource(): void {
    if (source === null) return;
    source.close();
    source = null;
  }

  function scheduleReconnect(): void {
    if (!running || reconnectTimer !== null) return;
    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelayMs);
  }

  function usePollingFallback(expectedSource: RealtimeEventSource): void {
    if (source !== expectedSource || !running) return;
    connectionTimer = clearTimer(connectionTimer);
    heartbeatTimer = clearTimer(heartbeatTimer);
    disconnectTimer = clearTimer(disconnectTimer);
    stopSource();
    setConnected(false);
    scheduleReconnect();
  }

  function recordStreamActivity(expectedSource: RealtimeEventSource): void {
    if (source !== expectedSource || !running) return;
    heartbeatTimer = clearTimer(heartbeatTimer);
    disconnectTimer = clearTimer(disconnectTimer);
    heartbeatTimer = setTimeoutFn(() => {
      heartbeatTimer = null;
      usePollingFallback(expectedSource);
    }, heartbeatTimeoutMs);
  }

  function connect(): void {
    if (!running || source !== null) return;
    let nextSource: RealtimeEventSource;
    try {
      nextSource = createEventSource(options.url);
    } catch {
      scheduleReconnect();
      return;
    }
    source = nextSource;
    connectionTimer = setTimeoutFn(() => {
      connectionTimer = null;
      if (source === nextSource && !connected) usePollingFallback(nextSource);
    }, connectionTimeoutMs);

    nextSource.onopen = () => {
      if (source !== nextSource || !running) return;
      connectionTimer = clearTimer(connectionTimer);
      disconnectTimer = clearTimer(disconnectTimer);
      reconnectTimer = clearTimer(reconnectTimer);
      setConnected(true);
      recordStreamActivity(nextSource);
    };
    nextSource.onerror = () => {
      if (source !== nextSource || !running) return;
      if (nextSource.readyState === EVENT_SOURCE_CLOSED) {
        usePollingFallback(nextSource);
        return;
      }
      if (!connected || disconnectTimer !== null) return;
      disconnectTimer = setTimeoutFn(() => {
        disconnectTimer = null;
        usePollingFallback(nextSource);
      }, disconnectGraceMs);
    };
    nextSource.addEventListener('refresh', publishUpdate);
    nextSource.addEventListener('refresh', () => recordStreamActivity(nextSource));
    nextSource.addEventListener('heartbeat', () => recordStreamActivity(nextSource));
  }

  return {
    isConnected: () => connected,
    onUpdate: (listener) => {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    onConnectionChange: (listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    start: () => {
      if (running) return;
      running = true;
      connect();
    },
    stop: () => {
      running = false;
      connectionTimer = clearTimer(connectionTimer);
      heartbeatTimer = clearTimer(heartbeatTimer);
      disconnectTimer = clearTimer(disconnectTimer);
      reconnectTimer = clearTimer(reconnectTimer);
      stopSource();
      setConnected(false);
    },
    dispose: () => {
      running = false;
      connectionTimer = clearTimer(connectionTimer);
      heartbeatTimer = clearTimer(heartbeatTimer);
      disconnectTimer = clearTimer(disconnectTimer);
      reconnectTimer = clearTimer(reconnectTimer);
      stopSource();
      setConnected(false);
      updateListeners.clear();
      connectionListeners.clear();
    },
  };
}
