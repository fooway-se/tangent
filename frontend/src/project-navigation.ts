export interface NavigationTicket {
  navigation: number;
  session: number;
}

export class ProjectNavigationOwner {
  private navigation = 0;
  private session = 0;
  private controller: AbortController | null = null;

  begin(): NavigationTicket {
    this.abortRequest();
    this.controller = new AbortController();
    return { navigation: ++this.navigation, session: this.session };
  }

  invalidate(): void {
    this.navigation++;
    this.abortRequest();
  }

  changeSession(): void {
    this.session++;
    this.invalidate();
  }

  isCurrent(ticket: NavigationTicket): boolean {
    return ticket.navigation === this.navigation && ticket.session === this.session;
  }

  signalFor(ticket: NavigationTicket): AbortSignal | null {
    return this.isCurrent(ticket) ? this.controller?.signal ?? null : null;
  }

  finish(ticket: NavigationTicket): void {
    if (this.isCurrent(ticket)) this.controller = null;
  }

  private abortRequest(): void {
    this.controller?.abort();
    this.controller = null;
  }
}

export async function runOwnedRequest<T>(
  owner: ProjectNavigationOwner,
  ticket: NavigationTicket,
  request: (signal: AbortSignal) => Promise<T>,
  onSuccess: (result: T) => void,
  onFailure: (error: unknown) => void,
): Promise<void> {
  const signal = owner.signalFor(ticket);
  if (signal === null) return;

  try {
    const result = await request(signal);
    if (owner.isCurrent(ticket)) onSuccess(result);
  } catch (error) {
    if (owner.isCurrent(ticket)) onFailure(error);
  } finally {
    owner.finish(ticket);
  }
}
