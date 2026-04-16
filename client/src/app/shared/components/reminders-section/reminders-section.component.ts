import {
  Component, Input, Output, EventEmitter, inject, signal, HostListener,
  OnInit, OnChanges, SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { UserPrefsService } from '../../../core/services/user-prefs.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-reminders-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (compact) {
      <div class="rem-wrap">
        <button
          class="trigger-btn"
          [class.trigger-active]="todo.reminder_count > 0"
          (click)="toggleOpen($event)"
          [title]="todo.reminder_count > 0 ? todo.reminder_count + ' active reminder(s)' : 'Set reminder'"
        >
          <span class="material-icons" style="font-size:14px">alarm</span>
        </button>
        @if (open()) {
          <div class="rem-popover" (click)="$event.stopPropagation()">
            <p class="rem-title">Remind me</p>
            @if (reminders().length) {
              <div class="rem-active-list">
                @for (r of reminders(); track r.id) {
                  <div class="rem-active-row">
                    <span class="material-icons" style="font-size:12px;color:#f57c00;flex-shrink:0">alarm</span>
                    <span class="rem-active-label">{{ r.label || (r.remind_at * 1000 | date:'MMM d, h:mm a') }}</span>
                    <button class="rem-active-del" (click)="deleteReminder(r.id)">
                      <span class="material-icons" style="font-size:11px">close</span>
                    </button>
                  </div>
                }
              </div>
              <div class="rem-divider"></div>
            }
            <button class="rem-btn" (click)="addReminderIn(1, 'day')">In 1 day</button>
            <button class="rem-btn" (click)="addReminderIn(3, 'day')">In 3 days</button>
            <button class="rem-btn" (click)="addReminderIn(1, 'week')">In 1 week</button>
            <div class="rem-divider"></div>
            <div class="rem-custom">
              <input
                type="datetime-local"
                class="rem-datetime"
                [(ngModel)]="customRemindAt"
                [min]="minDatetime"
              />
              <button class="rem-set-btn" [disabled]="!customRemindAt" (click)="addCustomReminder()">Set</button>
            </div>
          </div>
        }
      </div>
    }

    @if (!compact) {
      <div class="section">
        <div class="section-hdr">
          <span class="material-icons" style="font-size:14px;color:var(--text-muted)">alarm</span>
          <span class="section-label">Reminders</span>
          <span class="section-count">{{ reminders().length + (pendingDueDateReminder() ? 1 : 0) }}</span>
        </div>

        @if (pendingDueDateReminder(); as pending) {
          <div class="reminder-row reminder-pending" [class.reminder-new]="animatingIds().has('pending-due')">
            <span class="material-icons" style="font-size:14px;color:#f57c00">alarm_add</span>
            @if (editingReminderId() === 'pending-due') {
              <input
                type="datetime-local"
                class="reminder-date-input reminder-edit-input"
                [value]="pending.remindAt"
                (change)="onPendingReminderTimeChange($event)"
                (blur)="editingReminderId.set(null)"
                (keydown.escape)="editingReminderId.set(null)"
              />
            } @else {
              <span
                class="reminder-time reminder-time-editable"
                (click)="editingReminderId.set('pending-due')"
                title="Click to change time"
              >
                Due date — {{ formatCreateReminder(pending.remindAt) }}
              </span>
            }
            <span class="reminder-pending-badge">pending save</span>
            <button
              class="btn-icon reminder-email-toggle"
              [class.active]="pending.notifyEmail"
              (click)="togglePendingEmail()"
              [title]="pending.notifyEmail ? 'Email on (click to disable)' : 'Email off (click to enable)'"
            >
              <span class="material-icons" style="font-size:13px">email</span>
              <span class="reminder-email-label">Email</span>
            </button>
            <button class="btn-icon reminder-del" (click)="pendingDueDateReminder.set(null)">
              <span class="material-icons" style="font-size:13px">close</span>
            </button>
          </div>
        }

        @if (reminders().length || pendingDueDateReminder()) {
          <p class="reminder-edit-hint">Click a reminder time to change it.</p>
        }

        <div class="reminder-quick">
          <button class="reminder-quick-btn" (click)="addReminderIn(1, 'day')">In 1 day</button>
          <button class="reminder-quick-btn" (click)="addReminderIn(3, 'day')">In 3 days</button>
          <button class="reminder-quick-btn" (click)="addReminderIn(1, 'week')">In 1 week</button>
          <span class="reminder-sep">or</span>
          <input type="datetime-local" class="reminder-date-input" [(ngModel)]="customRemindAt" />
          @if (customRemindAt) {
            <button class="btn btn-primary btn-sm" (click)="addCustomReminder()">Set</button>
          }
        </div>

        @for (r of reminders(); track r.id) {
          <div class="reminder-row" [class.reminder-sent]="r.sent" [class.reminder-new]="animatingIds().has(r.id)">
            <span class="material-icons" style="font-size:14px;color:var(--text-muted)">
              {{ r.sent ? 'check_circle' : 'alarm' }}
            </span>
            @if (!r.sent && editingReminderId() === r.id) {
              <input
                type="datetime-local"
                class="reminder-date-input reminder-edit-input"
                [value]="reminderToDatetimeLocal(r.remind_at)"
                (change)="saveReminderTime(r, $event)"
                (blur)="editingReminderId.set(null)"
                (keydown.escape)="editingReminderId.set(null)"
              />
            } @else {
              <span
                class="reminder-time"
                [class.reminder-time-editable]="!r.sent"
                (click)="!r.sent && editingReminderId.set(r.id)"
                [title]="r.sent ? '' : 'Click to change time'"
              >
                {{ formatReminder(r) }}
              </span>
            }
            @if (r.sent) {
              <span class="reminder-sent-label">sent</span>
            }
            @if (!r.sent) {
              <button
                class="btn-icon reminder-email-toggle"
                [class.active]="r.notify_email"
                (click)="toggleReminderEmail(r)"
                [title]="r.notify_email ? 'Email on (click to disable)' : 'Email off (click to enable)'"
              >
                <span class="material-icons" style="font-size:13px">email</span>
                <span class="reminder-email-label">Email</span>
              </button>
              <button class="btn-icon reminder-del" (click)="deleteReminder(r.id)">
                <span class="material-icons" style="font-size:13px">close</span>
              </button>
            }
          </div>
        }

        @if (reminders().length === 0 && !pendingDueDateReminder()) {
          <p class="no-reminders">No reminders set</p>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    /* ── Compact trigger ──────────────────────────────── */
    .rem-wrap { position: relative; }

    .trigger-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 5px; border: 0;
      background: transparent; color: var(--text-muted);
      cursor: pointer; transition: background 120ms, color 120ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    .trigger-active { color: #f57c00 !important; }

    /* ── Compact popover ──────────────────────────────── */
    .rem-popover {
      position: absolute; top: calc(100% + 4px); right: 0;
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 8px; box-shadow: var(--shadow-md);
      padding: 6px; display: flex; flex-direction: column; gap: 3px;
      min-width: 190px; z-index: 100;
    }

    .rem-title {
      margin: 0 0 4px; padding: 0 4px;
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .4px; color: var(--text-muted);
    }

    .rem-btn {
      width: 100%; padding: 5px 8px; border: 0; border-radius: 5px;
      background: transparent; cursor: pointer; text-align: left;
      font-family: inherit; font-size: 12px; color: var(--text-secondary);
      transition: background 80ms, color 80ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    .rem-active-list { display: flex; flex-direction: column; gap: 1px; margin-bottom: 2px; }

    .rem-active-row {
      display: flex; align-items: center; gap: 5px;
      padding: 3px 4px; border-radius: 4px;
      background: color-mix(in srgb, #f57c00 8%, transparent);
    }

    .rem-active-label { flex: 1; font-size: 11px; color: var(--text-secondary); }

    .rem-active-del {
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; border: 0; border-radius: 3px;
      background: transparent; cursor: pointer; color: var(--text-muted); flex-shrink: 0;
      &:hover { background: var(--surface-hover); color: #d32f2f; }
    }

    .rem-divider { height: 1px; background: var(--surface-border); margin: 3px 0; }

    .rem-custom { display: flex; gap: 4px; align-items: center; padding: 2px 2px 0; }

    .rem-datetime {
      flex: 1; min-width: 0;
      padding: 4px 6px; border: 1px solid var(--surface-border); border-radius: 5px;
      background: var(--surface-hover); color: var(--text-primary);
      font-family: inherit; font-size: 11px; outline: none;
      &:focus { border-color: var(--accent-color); }
    }

    .rem-set-btn {
      padding: 4px 10px; border-radius: 5px; border: none; cursor: pointer;
      background: var(--accent-color); color: #fff;
      font-family: inherit; font-size: 11px; font-weight: 600; white-space: nowrap;
      &:hover:not(:disabled) { opacity: .88; }
      &:disabled { opacity: .45; cursor: default; }
    }

    /* ── Full section ─────────────────────────────────── */
    .section {
      padding: 10px 0; border-bottom: 1px solid var(--surface-border);
      &:last-child { border-bottom: 0; }
    }

    .section-hdr {
      display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
    }

    .section-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .4px; color: var(--text-muted);
    }

    .section-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px;
      background: var(--surface-hover); border-radius: 9px;
      font-size: 10px; font-weight: 700; color: var(--text-muted);
    }

    .reminder-quick {
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
      margin-bottom: 8px;
    }

    .reminder-quick-btn {
      font-size: 12px; padding: 3px 10px;
      border: 1px solid var(--surface-border); border-radius: 12px;
      background: transparent; cursor: pointer; color: var(--text-secondary);
      font-family: inherit; transition: border-color 100ms, color 100ms;
      &:hover { border-color: var(--accent-color); color: var(--accent-color); }
    }

    .reminder-sep { font-size: 12px; color: var(--text-muted); }

    .reminder-date-input {
      font-size: 12px; padding: 3px 7px;
      border: 1px solid var(--surface-border); border-radius: 6px;
      background: var(--surface-bg); color: var(--text-primary);
      font-family: inherit;
    }

    .reminder-row {
      display: flex; align-items: center; gap: 7px;
      padding: 5px 0; border-bottom: 1px solid var(--surface-border);
      &:last-of-type { border-bottom: 0; }
    }

    .reminder-sent { opacity: 0.55; }

    .reminder-time { flex: 1; font-size: 13px; color: var(--text-secondary); }

    .reminder-time-editable {
      cursor: pointer; border-radius: 4px; padding: 1px 3px; margin: -1px -3px;
      transition: background 80ms, color 80ms;
      &:hover { background: var(--surface-hover); color: var(--accent-color); }
    }

    .reminder-edit-input { flex: 1; }

    .reminder-sent-label {
      font-size: 10px; font-weight: 600; padding: 1px 6px;
      background: color-mix(in srgb, #43a047 15%, transparent);
      color: #43a047; border-radius: 8px;
    }

    .btn-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border-radius: 4px; border: 0;
      background: transparent; color: var(--text-muted); cursor: pointer;
      transition: background 80ms, color 80ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    .reminder-email-toggle {
      width: auto; height: 20px; padding: 0 6px; gap: 3px;
      opacity: 0; transition: opacity 120ms, color 120ms;
      color: var(--text-muted); border-radius: 10px;
      font-size: 11px; font-family: inherit;
      .reminder-row:hover & { opacity: 1; }
      &.active { color: var(--accent-color); opacity: 1; background: color-mix(in srgb, var(--accent-color) 10%, transparent); }
    }

    .reminder-email-label { font-size: 11px; font-weight: 500; }

    .reminder-del {
      width: 20px; height: 20px; opacity: 0;
      transition: opacity 120ms;
      .reminder-row:hover & { opacity: 1; }
    }

    .no-reminders { color: var(--text-muted); font-size: 13px; margin: 6px 0 0; }

    .reminder-edit-hint { font-size: 11px; color: var(--text-muted); margin: 0 0 6px; font-style: italic; }

    .reminder-pending {
      border: 1px dashed color-mix(in srgb, #f57c00 50%, transparent);
      border-radius: 6px; padding: 5px 8px; margin-bottom: 4px;
      background: color-mix(in srgb, #f57c00 6%, transparent);
    }

    .reminder-pending-badge {
      font-size: 10px; font-weight: 600; white-space: nowrap;
      padding: 1px 6px; border-radius: 8px;
      background: color-mix(in srgb, #f57c00 15%, transparent);
      color: #e65100;
    }

    @keyframes reminder-flash {
      0%   { background: color-mix(in srgb, #f57c00 35%, transparent); }
      100% { background: color-mix(in srgb, #f57c00 6%, transparent); }
    }

    @keyframes reminder-flash-real {
      0%   { background: color-mix(in srgb, #f57c00 30%, transparent); }
      100% { background: transparent; }
    }

    .reminder-pending.reminder-new { animation: reminder-flash 0.9s ease-out forwards; border-radius: 6px; }
    .reminder-row:not(.reminder-pending).reminder-new { animation: reminder-flash-real 1s ease-out forwards; border-radius: 5px; }

    .btn-sm { padding: 4px 12px; font-size: 12px; }
  `],
})
export class RemindersSectionComponent implements OnInit, OnChanges {
  private api       = inject(ApiService);
  private userPrefs = inject(UserPrefsService);
  private notifSvc  = inject(NotificationService);

  @Input({ required: true }) todo: any;
  @Input() compact = false;
  @Input() pendingDueDate = '';
  @Output() todoChanged = new EventEmitter<Partial<any>>();

  open                  = signal(false);
  reminders             = signal<any[]>([]);
  customRemindAt        = '';
  pendingDueDateReminder = signal<{ remindAt: string; notifyEmail: boolean; userEdited: boolean } | null>(null);
  animatingIds          = signal<Set<string>>(new Set());
  editingReminderId     = signal<string | null>(null);

  get minDatetime(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 5);
    return d.toISOString().slice(0, 16);
  }

  ngOnInit(): void {
    if (!this.compact) {
      this.api.get<any[]>(`/notifications/reminders/${this.todo.id}`).subscribe(r => this.reminders.set(r));
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['todo'] && !changes['todo'].isFirstChange()) {
      const prev = changes['todo'].previousValue?.due_date;
      const curr = changes['todo'].currentValue?.due_date;
      if (prev !== curr) {
        if (curr && this.pendingDueDateReminder()) {
          this.commitPendingReminder();
        } else if (!curr) {
          this.pendingDueDateReminder.set(null);
          const autoDue = this.reminders().find(r => r.label === 'Due date' && !r.sent);
          if (autoDue) {
            this.api.delete(`/notifications/reminders/item/${autoDue.id}`).subscribe(() => {
              this.reminders.update(list => list.filter(r => r.id !== autoDue.id));
              this.todoChanged.emit({ reminder_count: Math.max(0, (this.todo.reminder_count ?? 0) - 1) });
            });
          }
        }
      }
    }
    if (changes['pendingDueDate']) {
      this.updatePendingFromDueDate(changes['pendingDueDate'].currentValue ?? '');
    }
  }

  private updatePendingFromDueDate(dateStr: string): void {
    if (!dateStr) {
      if (this.pendingDueDateReminder() && !this.pendingDueDateReminder()!.userEdited) {
        this.pendingDueDateReminder.set(null);
      }
      return;
    }
    if (this.reminders().some(r => r.label === 'Due date' && !r.sent)) return;
    const existing = this.pendingDueDateReminder();
    if (existing?.userEdited) return;
    this.userPrefs.load();
    const remindAt = this.userPrefs.calcDueReminderDatetime(dateStr);
    const notifyEmail = this.notifSvc.getEffectiveSettings(null).notify_email;
    const isNew = !existing;
    this.pendingDueDateReminder.set({ remindAt, notifyEmail, userEdited: false });
    if (isNew) setTimeout(() => this.flashReminder('pending-due'), 30);
  }

  private commitPendingReminder(): void {
    const pending = this.pendingDueDateReminder();
    if (!pending) return;
    const remindAt = Math.floor(new Date(pending.remindAt).getTime() / 1000);
    this.api.post<any>(`/notifications/reminders/${this.todo.id}`, {
      remindAt, label: 'Due date', notifyEmail: pending.notifyEmail,
    }).subscribe(r => {
      this.reminders.update(list => [...list, r]);
      this.todoChanged.emit({ reminder_count: (this.todo.reminder_count ?? 0) + 1 });
      this.pendingDueDateReminder.set(null);
      this.flashReminder(r.id);
    });
  }

  flashReminder(id: string): void {
    this.animatingIds.update(s => { const n = new Set(s); n.add(id); return n; });
    setTimeout(() => this.animatingIds.update(s => { const n = new Set(s); n.delete(id); return n; }), 1100);
  }

  reminderToDatetimeLocal(remindAt: number): string {
    const d = new Date(remindAt * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  formatReminder(r: any): string {
    const d = new Date(r.remind_at * 1000);
    const now = new Date();
    const isSameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      ...(isSameYear ? {} : { year: 'numeric' }),
      hour: 'numeric', minute: '2-digit',
    });
  }

  formatCreateReminder(remindAt: string): string {
    const d = new Date(remindAt);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  onPendingReminderTimeChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (val) this.pendingDueDateReminder.update(p => p ? { ...p, remindAt: val, userEdited: true } : null);
    this.editingReminderId.set(null);
  }

  togglePendingEmail(): void {
    this.pendingDueDateReminder.update(p => p ? { ...p, notifyEmail: !p.notifyEmail } : null);
  }

  @HostListener('document:click')
  onDocClick(): void {
    if (this.compact) this.open.set(false);
  }

  toggleOpen(e: MouseEvent): void {
    e.stopPropagation();
    if (!this.open()) {
      this.customRemindAt = '';
      this.api.get<any[]>(`/notifications/reminders/${this.todo.id}`)
        .subscribe(r => this.reminders.set(r.filter(x => !x.sent)));
    }
    this.open.update(v => !v);
  }

  addReminderIn(amount: number, unit: 'day' | 'week'): void {
    const ms = unit === 'day' ? amount * 86400000 : amount * 7 * 86400000;
    const remindAt = Math.floor((Date.now() + ms) / 1000);
    const label = `In ${amount} ${unit}${amount !== 1 ? 's' : ''}`;
    const notifyEmail = this.notifSvc.getEffectiveSettings(null).notify_email;
    this.api.post<any>(`/notifications/reminders/${this.todo.id}`, { remindAt, label, notifyEmail })
      .subscribe(r => {
        this.reminders.update(list => [...list, r]);
        this.todoChanged.emit({ reminder_count: (this.todo.reminder_count ?? 0) + 1 });
        if (!this.compact) this.flashReminder(r.id);
        else this.open.set(false);
      });
  }

  addCustomReminder(): void {
    if (!this.customRemindAt) return;
    const remindAt = Math.floor(new Date(this.customRemindAt).getTime() / 1000);
    if (remindAt <= Math.floor(Date.now() / 1000)) return;
    const notifyEmail = this.notifSvc.getEffectiveSettings(null).notify_email;
    this.api.post<any>(`/notifications/reminders/${this.todo.id}`, { remindAt, notifyEmail })
      .subscribe(r => {
        this.reminders.update(list => [...list, r]);
        this.todoChanged.emit({ reminder_count: (this.todo.reminder_count ?? 0) + 1 });
        this.customRemindAt = '';
        if (!this.compact) this.flashReminder(r.id);
        else this.open.set(false);
      });
  }

  deleteReminder(id: string): void {
    this.api.delete(`/notifications/reminders/item/${id}`).subscribe(() => {
      this.reminders.update(list => list.filter(r => r.id !== id));
      this.todoChanged.emit({ reminder_count: Math.max(0, (this.todo.reminder_count ?? 0) - 1) });
    });
  }

  toggleReminderEmail(r: any): void {
    const notifyEmail = !r.notify_email;
    this.api.patch(`/notifications/reminders/item/${r.id}`, { notifyEmail }).subscribe(() => {
      this.reminders.update(list => list.map(x => x.id === r.id ? { ...x, notify_email: notifyEmail } : x));
    });
  }

  saveReminderTime(r: any, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (!val) { this.editingReminderId.set(null); return; }
    const remindAt = Math.floor(new Date(val).getTime() / 1000);
    this.editingReminderId.set(null);
    this.api.patch(`/notifications/reminders/item/${r.id}`, { remindAt }).subscribe(() => {
      this.reminders.update(list => list.map(x => x.id === r.id ? { ...x, remind_at: remindAt, sent: 0 } : x));
    });
  }
}
