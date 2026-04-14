import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { ApiService } from './api.service';
import { ToastService } from './toast.service';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export interface AppNotification {
  id: string;
  type: string;
  payload: {
    type: string;
    title: string;
    body: string;
    link?: string;
    todoId?: string;
    projectId?: string;
  };
  is_read: boolean;
  created_at: number;
}

export interface NotificationSettings {
  on_task_created: boolean;
  on_task_deleted: boolean;
  on_task_updated: boolean;
  on_task_assigned: boolean;
  on_task_comment: boolean;
  on_upcoming: boolean;
  upcoming_hours: number;
  on_past_due: boolean;
  notify_app: boolean;
  notify_email: boolean;
  notify_toast: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api    = inject(ApiService);
  private toast  = inject(ToastService);
  private auth   = inject(AuthService);
  private router = inject(Router);

  notifications = signal<AppNotification[]>([]);
  unreadCount   = computed(() => this.notifications().filter((n) => !n.is_read).length);

  /** All user settings rows (global + per-project) */
  allSettings = signal<any[]>([]);

  /** Emits every incoming SSE payload — page components subscribe to trigger data refresh. */
  readonly refresh$ = new Subject<AppNotification['payload']>();

  private es: EventSource | null = null;
  private audioCtx: AudioContext | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  init(): void {
    this.loadNotifications();
    this.loadSettings();
    this.connectSSE();
  }

  destroy(): void {
    this.es?.close();
    this.es = null;
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  loadNotifications(): void {
    this.api.get<AppNotification[]>('/notifications').subscribe((list) =>
      this.notifications.set(list),
    );
  }

  loadSettings(): void {
    this.api.get<any[]>('/notifications/settings').subscribe((rows) =>
      this.allSettings.set(rows),
    );
  }

  /** Returns the effective (merged) settings for the current user for display purposes. */
  getEffectiveSettings(projectId: string | null): NotificationSettings {
    const rows = this.allSettings();
    const global = rows.find((r) => r.project_id == null);
    const proj   = projectId ? rows.find((r) => r.project_id === projectId) : null;
    const defaults: NotificationSettings = {
      on_task_created: true, on_task_deleted: true, on_task_updated: true,
      on_task_assigned: true, on_task_comment: true, on_upcoming: true, upcoming_hours: 24,
      on_past_due: true, notify_app: true, notify_email: false, notify_toast: true,
    };
    return {
      ...defaults,
      ...this.rowToSettings(global),
      ...this.rowToSettings(proj),
    };
  }

  private rowToSettings(row: any): Partial<NotificationSettings> {
    if (!row) return {};
    return {
      on_task_created:  !!row.on_task_created,
      on_task_deleted:  !!row.on_task_deleted,
      on_task_updated:  !!row.on_task_updated,
      on_task_assigned: !!row.on_task_assigned,
      on_task_comment:  !!row.on_task_comment,
      on_upcoming:      !!row.on_upcoming,
      upcoming_hours:   row.upcoming_hours ?? 24,
      on_past_due:      !!row.on_past_due,
      notify_app:       !!row.notify_app,
      notify_email:     !!row.notify_email,
      notify_toast:     !!row.notify_toast,
    };
  }

  upsertSettings(projectId: string | null, partial: Partial<NotificationSettings>): void {
    this.api.patch('/notifications/settings', { projectId, settings: partial }).subscribe(() =>
      this.loadSettings(),
    );
  }

  deleteProjectSettings(projectId: string): void {
    this.api.delete(`/notifications/settings/${projectId}`).subscribe(() =>
      this.loadSettings(),
    );
  }

  // ── SSE ───────────────────────────────────────────────────────────────────

  private connectSSE(): void {
    const token = this.auth.getToken();
    if (!token) return;

    this.es?.close();
    const url = `${environment.apiUrl}/notifications/stream?token=${encodeURIComponent(token)}`;
    this.es = new EventSource(url);

    this.es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);

        // ui_refresh is a silent data-refresh signal — no bell entry, no toast, no badge.
        if (payload.type === 'ui_refresh') {
          this.refresh$.next(payload);
          return;
        }

        // Prepend a fake notification row for immediate UI update
        const fake: AppNotification = {
          id: `tmp-${Date.now()}`,
          type: payload.type,
          payload,
          is_read: false,
          created_at: Math.floor(Date.now() / 1000),
        };
        this.notifications.update((list) => [fake, ...list]);
        this.refresh$.next(payload);

        // Show toast + ding if user has it enabled
        // task_reminder events are handled by the reminder modal in the shell — skip toast
        const global = this.allSettings().find((r) => r.project_id == null);
        const toastEnabled = global ? !!global.notify_toast : true;
        if (payload.type === 'task_reminder') {
          this.playDing();
        } else if (toastEnabled) {
          this.toast.showNotification(payload.title, payload.body, payload.link);
          this.playDing();
        }

        // Reload to get the real persisted row with actual ID
        this.loadNotifications();
      } catch { /* ignore malformed events */ }
    };

    this.es.onerror = () => {
      // Reconnect after 5 s on error
      this.es?.close();
      setTimeout(() => this.connectSSE(), 5000);
    };
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  markRead(id: string): void {
    this.api.patch(`/notifications/${id}/read`, {}).subscribe(() => {
      this.notifications.update((list) =>
        list.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
    });
  }

  markAllRead(): void {
    this.api.patch('/notifications/read-all', {}).subscribe(() => {
      this.notifications.update((list) => list.map((n) => ({ ...n, is_read: true })));
    });
  }

  clearAll(): void {
    this.api.delete('/notifications/all').subscribe(() => this.notifications.set([]));
  }

  navigateTo(notification: AppNotification): void {
    this.markRead(notification.id);
    const link = notification.payload?.link;
    if (link) this.router.navigateByUrl(link);
  }

  // ── Sound ─────────────────────────────────────────────────────────────────

  playDing(): void {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      const ctx = this.audioCtx;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1047, ctx.currentTime);          // C6
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch { /* AudioContext blocked by browser — ignore */ }
  }
}
