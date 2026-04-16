import { Injectable, signal, computed, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { SettingsService } from './settings.service';

const HIDDEN_KEY = 'hidden_inbox_ids';

@Injectable({ providedIn: 'root' })
export class InboxStoreService {
  private settings = inject(SettingsService);

  inboxes = signal<any[] | null>(null);

  private hiddenIds = signal<Set<string>>(new Set());

  visibleInboxes = computed(() =>
    (this.inboxes() ?? []).filter((p) => !this.hiddenIds().has(p.id)),
  );

  hiddenInboxes = computed(() =>
    (this.inboxes() ?? []).filter((p) => this.hiddenIds().has(p.id)),
  );

  /** Emit to force the inbox component to re-fetch its task list. */
  readonly reload$ = new Subject<void>();
  triggerReload(): void { this.reload$.next(); }

  set(list: any[]): void { this.inboxes.set(list); }

  /** Load hidden IDs from persisted settings. Call after settings are loaded. */
  loadHidden(): void {
    const raw = this.settings.get(HIDDEN_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    this.hiddenIds.set(new Set(ids));
  }

  hide(id: string): void {
    this.hiddenIds.update((s) => new Set([...s, id]));
    this.persistHidden();
  }

  unhide(id: string): void {
    this.hiddenIds.update((s) => { const n = new Set(s); n.delete(id); return n; });
    this.persistHidden();
  }

  isHidden(id: string): boolean {
    return this.hiddenIds().has(id);
  }

  private persistHidden(): void {
    this.settings.set(HIDDEN_KEY, JSON.stringify([...this.hiddenIds()]));
  }

  /** Reorder the list to match a stored order of project IDs. Unknown IDs are appended at end. */
  applyOrder(ids: string[]): void {
    if (!ids.length) return;
    this.inboxes.update((list) => {
      if (!list) return list;
      const map = new Map(list.map((p) => [p.id, p]));
      const ordered: any[] = [];
      for (const id of ids) {
        if (map.has(id)) { ordered.push(map.get(id)!); map.delete(id); }
      }
      for (const item of map.values()) ordered.push(item);
      return ordered;
    });
  }

  /** Move item at fromIndex to toIndex. */
  reorder(fromIndex: number, toIndex: number): void {
    this.inboxes.update((list) => {
      if (!list) return list;
      const arr = [...list];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return arr;
    });
  }

  add(inbox: any): void { this.inboxes.update((l) => [inbox, ...(l ?? [])]); }

  update(inbox: any): void {
    this.inboxes.update((l) => (l ?? []).map((p) => p.id === inbox.id ? { ...p, ...inbox } : p));
  }

  remove(id: string): void {
    this.inboxes.update((l) => (l ?? []).filter((p) => p.id !== id));
  }

  /** Adjust new_task_count / all_task_count locally after a mutation, so the sidebar updates immediately. */
  adjustCounts(projectId: string, newDelta: number, allDelta: number): void {
    this.inboxes.update((l) => (l ?? []).map((p) =>
      p.id === projectId ? {
        ...p,
        new_task_count: Math.max(0, (p.new_task_count ?? 0) + newDelta),
        all_task_count: Math.max(0, (p.all_task_count ?? 0) + allDelta),
      } : p,
    ));
  }
}
