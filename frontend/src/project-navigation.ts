export interface NavigationTicket {
  navigation: number;
  session: number;
}

export class ProjectNavigationOwner {
  private navigation = 0;
  private session = 0;

  begin(): NavigationTicket {
    return { navigation: ++this.navigation, session: this.session };
  }

  invalidate(): void {
    this.navigation++;
  }

  changeSession(): void {
    this.session++;
    this.navigation++;
  }

  isCurrent(ticket: NavigationTicket): boolean {
    return ticket.navigation === this.navigation && ticket.session === this.session;
  }
}

export async function runOwnedRequest<T>(
  owner: ProjectNavigationOwner,
  ticket: NavigationTicket,
  request: () => Promise<T>,
  onSuccess: (result: T) => void,
  onFailure: (error: unknown) => void,
): Promise<void> {
  try {
    const result = await request();
    if (owner.isCurrent(ticket)) onSuccess(result);
  } catch (error) {
    if (owner.isCurrent(ticket)) onFailure(error);
  }
}
