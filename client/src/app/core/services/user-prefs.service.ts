import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export const DUE_REMINDER_PRESETS: { label: string; mins: number }[] = [
  { label: 'At 9 AM on due date',  mins: 0     },
  { label: '1 hour before',        mins: 60    },
  { label: '3 hours before',       mins: 180   },
  { label: '1 day before',         mins: 1440  },
  { label: '2 days before',        mins: 2880  },
  { label: '1 week before',        mins: 10080 },
];

export const DEFAULT_DUE_REMINDER_OFFSET = 1440; // 1 day before

@Injectable({ providedIn: 'root' })
export class UserPrefsService {
  private api = inject(ApiService);
  private _dueReminderOffset = signal<number>(DEFAULT_DUE_REMINDER_OFFSET);
  private loaded = false;

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.api.get<any>('/users/me').subscribe((u) => {
      if (u?.due_reminder_offset_mins != null) {
        this._dueReminderOffset.set(+u.due_reminder_offset_mins);
      }
    });
  }

  get dueReminderOffsetMins(): number {
    return this._dueReminderOffset();
  }

  setDueReminderOffsetMins(mins: number): void {
    this._dueReminderOffset.set(mins);
    this.api.patch('/users/me/due-reminder-offset', { offsetMins: mins }).subscribe();
  }

  /** Returns a datetime-local string (YYYY-MM-DDTHH:MM) for the reminder based on the due date. */
  calcDueReminderDatetime(dueDateStr: string): string {
    const baseMs = new Date(dueDateStr + 'T09:00:00').getTime();
    const remindMs = baseMs - this._dueReminderOffset() * 60 * 1000;
    const d = new Date(remindMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
