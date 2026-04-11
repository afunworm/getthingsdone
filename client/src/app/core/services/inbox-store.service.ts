import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class InboxStoreService {
  inboxes = signal<any[] | null>(null);

  /** Emit to force the inbox component to re-fetch its task list. */
  readonly reload$ = new Subject<void>();
  triggerReload(): void { this.reload$.next(); }

  set(list: any[]): void { this.inboxes.set(list); }

  add(inbox: any): void { this.inboxes.update((l) => [inbox, ...(l ?? [])]); }

  update(inbox: any): void {
    this.inboxes.update((l) => (l ?? []).map((p) => p.id === inbox.id ? { ...p, ...inbox } : p));
  }

  remove(id: string): void {
    this.inboxes.update((l) => (l ?? []).filter((p) => p.id !== id));
  }
}
