import {
  Component, Input, Output, EventEmitter, inject, signal, computed, HostListener,
  OnInit, OnChanges, SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { UserPrefsService } from '../../../core/services/user-prefs.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-due-date-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (compact) {
      <div class="sch-wrap">
        <button
          class="trigger-btn"
          [class.trigger-active]="todo.due_date || todo.is_recurring"
          (click)="toggleOpen($event)"
          title="Due date / recurring"
        >
          <span class="material-icons" style="font-size:14px">event</span>
        </button>
        @if (open()) {
          <div class="sch-popover" (click)="$event.stopPropagation()">
            <div class="sch-field">
              <span class="material-icons" style="font-size:13px;color:var(--text-muted)">event</span>
              <input
                type="date"
                class="sch-date-inp"
                [ngModel]="dueDate()"
                (ngModelChange)="onDateChange($event)"
              />
              @if (dueDate()) {
                <button class="sch-x" (click)="onClear()">
                  <span class="material-icons" style="font-size:11px">close</span>
                </button>
              }
            </div>
            <div class="sch-field">
              <span class="material-icons" style="font-size:13px;color:var(--text-muted)">repeat</span>
              <label class="sch-lbl">
                <input type="checkbox" [ngModel]="recurring()" (ngModelChange)="recurring.set($event)" />
                Recurring
              </label>
            </div>
            @if (recurring()) {
              <div class="sch-field sch-recur">
                <span style="font-size:11px;color:var(--text-muted)">Every</span>
                <input
                  type="number"
                  class="sch-num"
                  [ngModel]="interval()"
                  (ngModelChange)="interval.set(+$event)"
                  min="1"
                />
                <select class="sch-sel" [ngModel]="type()" (ngModelChange)="type.set($event)">
                  <option value="daily">days</option>
                  <option value="weekly">weeks</option>
                  <option value="monthly">months</option>
                  <option value="yearly">years</option>
                </select>
              </div>
            }
            @if (recurring() && !dueDate()) {
              <p class="sch-recur-warn">
                <span class="material-icons" style="font-size:12px">warning</span>
                Due date required for recurring tasks.
              </p>
            }
            <div class="sch-footer">
              <button class="sch-save-btn" [disabled]="recurring() && !dueDate()" (click)="save()">Save</button>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="section">
        <div class="section-hdr">
          <span class="section-label">Due Date</span>
        </div>
        <div class="sch-body">
          <div class="sch-grid">
            <div class="sch-row">
              <span class="material-icons sch-icon">event</span>
              <input
                type="date"
                class="sch-date-input"
                [ngModel]="dueDate()"
                (ngModelChange)="onDateChange($event)"
              />
              @if (dueDate()) {
                <button class="sch-clear" (click)="onClear()">
                  <span class="material-icons" style="font-size:12px">close</span>
                </button>
              }
            </div>
            <div class="sch-row">
              <span class="material-icons sch-icon">repeat</span>
              <label class="sch-toggle-label">
                <input type="checkbox" [ngModel]="recurring()" (ngModelChange)="recurring.set($event)" />
                Recurring
              </label>
              @if (recurring()) {
                <span class="sch-every">every</span>
                <input
                  type="number"
                  class="sch-num"
                  min="1"
                  [ngModel]="interval()"
                  (ngModelChange)="interval.set(+$event)"
                />
                <select class="sch-type" [ngModel]="type()" (ngModelChange)="type.set($event)">
                  <option value="daily">days</option>
                  <option value="weekly">weeks</option>
                  <option value="monthly">months</option>
                  <option value="yearly">years</option>
                </select>
              }
            </div>
          </div>
          @if (nextOccurrences().length) {
            <div class="sch-occurrences">
              <span class="sch-occ-label">Next occurrences</span>
              @for (d of nextOccurrences(); track d) {
                <span class="sch-occ-date">{{ d }}</span>
              }
            </div>
          }
        </div>
        @if (recurring() && !dueDate()) {
          <p class="recur-warn">
            <span class="material-icons" style="font-size:13px">warning</span>
            A due date is required for recurring tasks.
          </p>
        }
        @if (schedSaved()) {
          <div class="sch-saved-msg">
            <span class="material-icons" style="font-size:13px">check_circle</span>
            Saved
          </div>
        } @else if (dirty()) {
          <div class="inline-actions" style="margin-top:8px">
            <button class="btn btn-primary btn-sm" [disabled]="recurring() && !dueDate()" (click)="save()">Save</button>
            <button class="btn btn-ghost btn-sm" (click)="reset()">Cancel</button>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    /* ── Compact mode ─────────────────────────────────── */
    .sch-wrap { position: relative; }

    .trigger-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 5px; border: 0;
      background: transparent; color: var(--text-muted);
      cursor: pointer; transition: background 120ms, color 120ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    .trigger-active { color: var(--accent-color); }

    .sch-popover {
      position: absolute; top: calc(100% + 4px); right: 0;
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 8px; box-shadow: var(--shadow-md);
      padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
      min-width: 210px; z-index: 100;
    }

    .sch-field { display: flex; align-items: center; gap: 6px; }

    .sch-recur { padding-left: 19px; }

    .sch-date-inp {
      flex: 1; padding: 3px 6px; border: 1px solid var(--surface-border); border-radius: 5px;
      background: var(--surface-hover); font-family: inherit; font-size: 11px;
      color: var(--text-primary); outline: none;
      &:focus { border-color: var(--accent-color); }
    }

    .sch-x {
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border: 0; border-radius: 3px;
      background: transparent; color: var(--text-muted); cursor: pointer;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    .sch-lbl {
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; color: var(--text-secondary); cursor: pointer;
      input { cursor: pointer; }
    }

    .sch-footer {
      display: flex; justify-content: flex-end; padding-top: 4px;
      border-top: 1px solid var(--surface-border); margin-top: 2px;
    }

    .sch-save-btn {
      padding: 3px 12px; border-radius: 5px; border: none; cursor: pointer;
      background: var(--accent-color); color: #fff;
      font-family: inherit; font-size: 11px; font-weight: 600;
      &:hover:not(:disabled) { opacity: 0.9; }
      &:disabled { opacity: 0.4; cursor: default; }
    }

    .sch-recur-warn {
      display: flex; align-items: center; gap: 4px; margin: 2px 0 4px;
      font-size: 11px; color: #e65100;
    }

    /* ── Full mode ────────────────────────────────────── */
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

    .sch-body { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }

    .sch-grid { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }

    .sch-row { display: flex; align-items: center; gap: 8px; }

    .sch-icon { font-size: 15px !important; color: var(--text-muted); flex-shrink: 0; }

    .sch-date-input {
      padding: 3px 8px; border: 1px solid var(--surface-border); border-radius: 6px;
      background: var(--surface-hover); font-family: inherit; font-size: 12px;
      color: var(--text-primary); outline: none;
      &:focus { border-color: var(--accent-color); }
    }

    .sch-clear {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border: 0; border-radius: 4px;
      background: transparent; color: var(--text-muted); cursor: pointer;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    .sch-toggle-label {
      display: flex; align-items: center; gap: 5px;
      font-size: 12px; color: var(--text-secondary); cursor: pointer;
      input { cursor: pointer; }
    }

    .sch-every { font-size: 12px; color: var(--text-muted); }

    .sch-num {
      width: 52px; padding: 3px 6px; border: 1px solid var(--surface-border); border-radius: 6px;
      background: var(--surface-hover); font-family: inherit; font-size: 12px;
      color: var(--text-primary); outline: none; text-align: center;
      &:focus { border-color: var(--accent-color); }
    }

    .sch-type {
      padding: 3px 6px; border: 1px solid var(--surface-border); border-radius: 6px;
      background: var(--surface-hover); font-family: inherit; font-size: 12px;
      color: var(--text-primary); outline: none; cursor: pointer;
      &:focus { border-color: var(--accent-color); }
    }

    .sch-occurrences {
      display: flex; flex-direction: column; gap: 3px;
      border-left: 2px solid var(--surface-border); padding-left: 12px;
    }

    .sch-occ-label {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: .4px; color: var(--text-muted); margin-bottom: 2px;
    }

    .sch-occ-date { font-size: 12px; color: var(--text-secondary); }

    .recur-warn {
      display: flex; align-items: center; gap: 5px; margin: 6px 0 0;
      font-size: 12px; color: #e65100;
    }

    .sch-saved-msg {
      display: inline-flex; align-items: center; gap: 4px;
      margin-top: 8px; font-size: 12px; font-weight: 500;
      color: var(--color-success, #2e7d32);
    }

    .inline-actions { display: flex; gap: 6px; margin-top: 6px; }
  `],
})
export class DueDateSectionComponent implements OnInit, OnChanges {
  private api       = inject(ApiService);
  private userPrefs = inject(UserPrefsService);
  private notifSvc  = inject(NotificationService);

  @Input({ required: true }) todo: any;
  @Input() compact = false;
  @Output() updated             = new EventEmitter<any>();
  @Output() dueDateDraftChanged = new EventEmitter<string>();

  open      = signal(false);
  dueDate   = signal('');
  recurring = signal(false);
  interval  = signal(1);
  type      = signal<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');

  private savedSchedule = signal({ dueDate: '', recurring: false, interval: 1, type: 'weekly' as 'daily' | 'weekly' | 'monthly' | 'yearly' });

  schedSaved = signal(false);

  dirty = computed(() => {
    const s = this.savedSchedule();
    return this.dueDate() !== s.dueDate ||
      this.recurring() !== s.recurring ||
      (this.recurring() && (this.interval() !== s.interval || this.type() !== s.type));
  });

  nextOccurrences = computed(() => {
    if (!this.recurring() || !this.dueDate()) return [];
    const interval = this.interval();
    const type = this.type();
    const dates: string[] = [];
    let cur = new Date(this.dueDate() + 'T00:00:00');
    for (let i = 0; i < 3; i++) {
      const originalDay = cur.getDate();
      const next = new Date(cur);
      if (type === 'daily') {
        next.setDate(next.getDate() + interval);
      } else if (type === 'weekly') {
        next.setDate(next.getDate() + interval * 7);
      } else if (type === 'monthly') {
        next.setMonth(next.getMonth() + interval);
        if (next.getDate() < originalDay) next.setDate(0);
      } else {
        next.setFullYear(next.getFullYear() + interval);
      }
      cur = next;
      dates.push(cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    }
    return dates;
  });

  ngOnInit(): void {
    const t = this.todo;
    const dd = t.due_date ? new Date(t.due_date * 1000).toLocaleDateString('en-CA') : '';
    const rr = !!t.is_recurring;
    const ri = t.recurrence_rule?.interval ?? 1;
    const rt = t.recurrence_rule?.type ?? 'weekly';
    this.dueDate.set(dd);
    this.recurring.set(rr);
    this.interval.set(ri);
    this.type.set(rt);
    this.savedSchedule.set({ dueDate: dd, recurring: rr, interval: ri, type: rt });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['todo'] && !changes['todo'].isFirstChange() && !this.open()) {
      const t = changes['todo'].currentValue;
      const dd = t.due_date ? new Date(t.due_date * 1000).toLocaleDateString('en-CA') : '';
      const rr = !!t.is_recurring;
      const ri = t.recurrence_rule?.interval ?? 1;
      const rt = t.recurrence_rule?.type ?? 'weekly';
      this.dueDate.set(dd);
      this.recurring.set(rr);
      this.interval.set(ri);
      this.type.set(rt);
      this.savedSchedule.set({ dueDate: dd, recurring: rr, interval: ri, type: rt });
    }
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.open.set(false);
  }

  toggleOpen(e: MouseEvent): void {
    e.stopPropagation();
    this.open.update(v => !v);
  }

  onDateChange(val: string): void {
    this.dueDate.set(val);
    if (!this.compact) this.dueDateDraftChanged.emit(val);
  }

  onClear(): void {
    this.onDateChange('');
  }

  reset(): void {
    const s = this.savedSchedule();
    this.dueDate.set(s.dueDate);
    this.recurring.set(s.recurring);
    this.interval.set(s.interval);
    this.type.set(s.type);
    if (!this.compact) this.dueDateDraftChanged.emit(s.dueDate);
  }

  save(): void {
    const prevDueDateStr = this.savedSchedule().dueDate;
    const dueDate = this.dueDate()
      ? Math.floor(new Date(this.dueDate() + 'T00:00:00').getTime() / 1000)
      : null;
    const recurrenceRule = this.recurring()
      ? { interval: this.interval(), type: this.type() }
      : null;
    this.api.patch<any>(`/todos/${this.todo.id}`, {
      dueDate, isRecurring: this.recurring(), recurrenceRule,
    }).subscribe(updatedTodo => {
      this.savedSchedule.set({
        dueDate: this.dueDate(),
        recurring: this.recurring(),
        interval: this.interval(),
        type: this.type(),
      });
      if (this.compact) {
        this.open.set(false);
        this.updated.emit(updatedTodo);
        if (this.dueDate() && this.dueDate() !== prevDueDateStr) {
          this.api.get<any[]>(`/notifications/reminders/${this.todo.id}`).subscribe(reminders => {
            if (!reminders.some(r => r.label === 'Due date' && !r.sent)) {
              this.userPrefs.load();
              const remindAt = Math.floor(
                new Date(this.userPrefs.calcDueReminderDatetime(this.dueDate())).getTime() / 1000,
              );
              const notifyEmail = this.notifSvc.getEffectiveSettings(null).email_upcoming;
              this.api.post<any>(`/notifications/reminders/${this.todo.id}`, {
                remindAt, label: 'Due date', notifyEmail,
              }).subscribe(() => {
                this.updated.emit({ ...updatedTodo, reminder_count: (updatedTodo.reminder_count ?? 0) + 1 });
              });
            }
          });
        }
      } else {
        this.schedSaved.set(true);
        setTimeout(() => this.schedSaved.set(false), 2000);
        this.updated.emit(updatedTodo);
        this.dueDateDraftChanged.emit('');
      }
    });
  }
}
