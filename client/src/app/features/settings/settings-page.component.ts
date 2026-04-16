import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService, NotificationSettings } from '../../core/services/notification.service';
import { InboxStoreService } from '../../core/services/inbox-store.service';
import { AuthService } from '../../core/auth/auth.service';
import { ApiService } from '../../core/services/api.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { UserPrefsService, DUE_REMINDER_PRESETS } from '../../core/services/user-prefs.service';

const TIMEZONES = Intl.supportedValuesOf('timeZone');

type BellKey  = Extract<keyof NotificationSettings, `on_${string}`>;
type EmailKey = Extract<keyof NotificationSettings, `email_${string}`>;

interface EventRow {
  bellKey:  BellKey;
  emailKey: EmailKey;
  label: string;
  description: string;
  icon: string;
}

// All 7 events shown in global settings
const EVENT_ROWS: EventRow[] = [
  { bellKey: 'on_task_created',  emailKey: 'email_task_created',  label: 'Task created',        description: 'When a new task is added to a project you belong to',                   icon: 'add_circle_outline'  },
  { bellKey: 'on_task_deleted',  emailKey: 'email_task_deleted',  label: 'Task deleted',        description: 'When a task is removed from a project',                                 icon: 'delete_outline'      },
  { bellKey: 'on_task_updated',  emailKey: 'email_task_updated',  label: 'Task updated',        description: "When a task's title, description, or due date changes",                 icon: 'edit'                },
  { bellKey: 'on_task_assigned', emailKey: 'email_task_assigned', label: 'Task assigned',       description: 'When a task is assigned or unassigned to you or your department',       icon: 'person_add'          },
  { bellKey: 'on_task_comment',  emailKey: 'email_task_comment',  label: 'Comments',            description: 'When someone leaves a comment on a task',                               icon: 'chat_bubble_outline' },
  { bellKey: 'on_upcoming',      emailKey: 'email_upcoming',      label: 'Upcoming reminders',  description: 'In-app reminder alert before a task\'s due date',                       icon: 'alarm'               },
  { bellKey: 'on_past_due',      emailKey: 'email_past_due',      label: 'Overdue tasks',       description: 'Daily summary of tasks that are past their due date',                   icon: 'schedule'            },
];

// Per-inbox overrides only show project-scoped task events
const INBOX_EVENT_ROWS: EventRow[] = EVENT_ROWS.slice(0, 5);

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
      </div>

      <div class="settings-layout">
        <!-- Sidebar nav -->
        <nav class="settings-nav">
          @for (tab of tabs; track tab.key) {
            <button class="sn-item" [class.sn-active]="activeTab() === tab.key"
              [id]="'tour-' + tab.key + '-tab'"
              (click)="activeTab.set(tab.key)">
              <span class="material-icons sn-icon">{{ tab.icon }}</span>
              {{ tab.label }}
            </button>
          }
        </nav>

        <!-- Content -->
        <div class="settings-content">

          <!-- ── General tab ──────────────────────────────────────────── -->
          @if (activeTab() === 'general') {
            <div class="section-block">
              <h2 class="section-title">General</h2>
              <p class="section-desc">Basic preferences that apply across the app.</p>
            </div>

            <div class="card">
              <div class="card-hdr">Regional</div>
              <div id="tour-timezone" class="general-row">
                <div class="general-info">
                  <div class="general-label">Timezone</div>
                  <div class="general-desc">Used for date display and reminder scheduling. Defaults to the server's configured timezone.</div>
                </div>
                <select class="tz-select" (change)="saveTimezone($any($event.target).value)">
                  @for (tz of timezones; track tz) {
                    <option [value]="tz" [selected]="tz === timezone">{{ tz }}</option>
                  }
                </select>
              </div>
            </div>

            <div class="card" style="margin-top:16px">
              <div class="card-hdr">Task reminders</div>
              <div id="tour-reminder" class="general-row">
                <div class="general-info">
                  <div class="general-label">Default due date reminder</div>
                  <div class="general-desc">When a task is created or updated with a due date, a reminder is automatically added at this offset.</div>
                </div>
                <div class="due-reminder-wrap">
                  <select class="tz-select" [ngModel]="dueReminderSelectValue()"
                    (ngModelChange)="onDueReminderSelectChange($event)">
                    @for (p of DUE_REMINDER_PRESETS; track p.mins) {
                      <option [value]="p.mins">{{ p.label }}</option>
                    }
                    <option value="custom">Custom</option>
                  </select>
                  @if (dueReminderIsCustom()) {
                    <div class="custom-offset-row">
                      <input type="number" class="hours-input" min="1"
                        [ngModel]="customOffsetHours"
                        (ngModelChange)="onCustomHoursChange($event)" />
                      hours before
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="card" style="margin-top:16px">
              <div class="card-hdr">Onboarding</div>
              <div class="general-row">
                <div class="general-info">
                  <div class="general-label">Feature tour</div>
                  <div class="general-desc">Revisit the onboarding guide to learn about key features and update your preferences.</div>
                </div>
                <button id="tour-restart-btn" class="restart-tour-btn" (click)="onboarding.restart()">
                  <span class="material-icons" style="font-size:15px">play_circle_outline</span>
                  Restart tour
                </button>
              </div>
            </div>
          }

          <!-- ── Notifications tab ─────────────────────────────────────── -->
          @if (activeTab() === 'notifications') {
            <div id="tour-notifications">
            <div class="section-block">
              <h2 class="section-title">Notification preferences</h2>
              <p class="section-desc">
                Control what you're notified about and how. Use the
                <span class="material-icons" style="font-size:13px;vertical-align:middle">notifications</span>
                icon to toggle in-app + toast alerts and the
                <span class="material-icons" style="font-size:13px;vertical-align:middle">email</span>
                icon to toggle email delivery — per event.
                Project-specific overrides can be set from the bell icon next to each inbox in the sidebar.
              </p>
            </div>

            <!-- Event toggles -->
            <div class="card">
              <div class="card-hdr">
                What you'll be notified about
                <div class="ch-legend">
                  <span class="material-icons ch-legend-icon" title="In-app + toast">notifications</span>
                  <span class="material-icons ch-legend-icon" title="Email">email</span>
                </div>
              </div>
              <div class="event-rows">
                @for (row of eventRows; track row.bellKey) {
                  <div class="event-row">
                    <span class="material-icons event-icon">{{ row.icon }}</span>
                    <div class="event-info">
                      <div class="event-label">{{ row.label }}</div>
                      <div class="event-desc">{{ row.description }}</div>
                    </div>
                    <button class="ch-btn" [class.ch-on]="globalSettings()[row.bellKey]"
                      (click)="saveGlobal(row.bellKey, !globalSettings()[row.bellKey])"
                      title="In-app + toast">
                      <span class="material-icons">{{ globalSettings()[row.bellKey] ? 'notifications' : 'notifications_off' }}</span>
                    </button>
                    <button class="ch-btn" [class.ch-on]="globalSettings()[row.emailKey]"
                      (click)="saveGlobal(row.emailKey, !globalSettings()[row.emailKey])"
                      title="Email ({{ userEmail() }})">
                      <span class="material-icons">{{ globalSettings()[row.emailKey] ? 'email' : 'mail_outline' }}</span>
                    </button>
                  </div>
                }
              </div>
            </div>

            <!-- Per-project overrides -->
            @if ((inboxes()?.length ?? 0) > 0) {
              <div class="card" style="margin-top:16px">
                <div class="card-hdr">
                  Per-inbox overrides
                  <span class="card-hdr-note">Overrides apply only to that inbox</span>
                </div>
                <div class="inbox-override-list">
                  @for (inbox of (inboxes() ?? []); track inbox.id) {
                    <div class="inbox-override-row">
                      <div class="inbox-meta">
                        <span class="inbox-dot" [style.background]="inbox.color || 'var(--accent-color)'">
                          {{ inbox.emoji || inbox.name[0].toUpperCase() }}
                        </span>
                        <span class="inbox-name">{{ inbox.name }}</span>
                        @if (hasOverride(inbox.id)) {
                          <span class="override-badge">custom</span>
                        }
                      </div>
                      <button class="configure-btn" (click)="toggleInboxExpand(inbox.id)">
                        <span class="material-icons" style="font-size:14px">
                          {{ expandedInbox() === inbox.id ? 'expand_less' : 'tune' }}
                        </span>
                        {{ expandedInbox() === inbox.id ? 'Collapse' : 'Configure' }}
                      </button>
                    </div>
                    @if (expandedInbox() === inbox.id) {
                      <div class="inbox-expand">
                        <div class="ie-header">
                          <span class="material-icons ie-ch-legend" title="In-app + toast">notifications</span>
                          <span class="material-icons ie-ch-legend" title="Email">email</span>
                        </div>
                        @for (row of inboxEventRows; track row.bellKey) {
                          <div class="ie-row">
                            <span class="material-icons ie-icon">{{ row.icon }}</span>
                            <span class="ie-label">{{ row.label }}</span>
                            <button class="ie-ch-btn" [class.ie-ch-on]="projSettings(inbox.id)[row.bellKey]"
                              (click)="saveProj(inbox.id, row.bellKey, !projSettings(inbox.id)[row.bellKey])"
                              title="In-app + toast">
                              <span class="material-icons">{{ projSettings(inbox.id)[row.bellKey] ? 'notifications' : 'notifications_off' }}</span>
                            </button>
                            <button class="ie-ch-btn" [class.ie-ch-on]="projSettings(inbox.id)[row.emailKey]"
                              (click)="saveProj(inbox.id, row.emailKey, !projSettings(inbox.id)[row.emailKey])"
                              title="Email">
                              <span class="material-icons">{{ projSettings(inbox.id)[row.emailKey] ? 'email' : 'mail_outline' }}</span>
                            </button>
                          </div>
                        }
                        @if (hasOverride(inbox.id)) {
                          <button class="reset-btn" (click)="resetProj(inbox.id)">
                            <span class="material-icons" style="font-size:13px">refresh</span>
                            Reset to global defaults
                          </button>
                        }
                      </div>
                    }
                  }
                </div>
              </div>
            }
            </div><!-- /tour-notifications -->
          }

        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 32px 40px; max-width: 860px; margin: 0 auto; }
    .page-header { margin-bottom: 28px; }
    .page-title { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0; }

    .settings-layout { display: flex; gap: 28px; }

    /* Settings nav */
    .settings-nav { width: 160px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; }
    .sn-item {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px; border: 0; background: transparent;
      border-radius: 7px; cursor: pointer; font-size: 13px;
      font-weight: 450; color: var(--text-secondary); text-align: left;
      font-family: inherit; transition: background 100ms, color 100ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.sn-active {
        background: color-mix(in srgb, var(--accent-color) 13%, transparent);
        color: var(--accent-color); font-weight: 500;
        .sn-icon { color: var(--accent-color); }
      }
    }
    .sn-icon { font-size: 16px; width: 16px; height: 16px; opacity: 0.7; }

    /* Content */
    .settings-content { flex: 1; min-width: 0; }

    .section-block { margin-bottom: 20px; }
    .section-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0 0 6px; }
    .section-desc { font-size: 13px; color: var(--text-secondary); margin: 0; }

    /* Card */
    .card {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 10px; overflow: hidden;
    }
    .card-hdr {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--surface-border);
      font-size: 13px; font-weight: 600; color: var(--text-primary);
    }
    .card-hdr-note { font-size: 11px; font-weight: 400; color: var(--text-muted); margin-left: auto; }

    /* General tab */
    .general-row {
      display: flex; align-items: center; gap: 16px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--surface-border);
      &:last-child { border-bottom: 0; }
    }
    .general-info { flex: 1; min-width: 0; }
    .general-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
    .general-desc  { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .tz-select {
      flex-shrink: 0; width: 210px;
      padding: 6px 10px; border-radius: 6px;
      border: 1px solid var(--surface-border);
      background: var(--surface-bg); color: var(--text-primary);
      font-family: inherit; font-size: 13px; cursor: pointer;
    }

    /* Events */
    .event-rows { }
    .event-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px 10px 16px;
      border-bottom: 1px solid var(--surface-border);
      &:last-child { border-bottom: 0; }
    }
    .event-icon { font-size: 18px; flex-shrink: 0; color: var(--text-muted); }
    .event-info { flex: 1; min-width: 0; }
    .event-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
    .event-desc  { font-size: 12px; color: var(--text-muted); margin-top: 1px; }

    /* Channel icon header in card-hdr */
    .ch-legend { display: flex; gap: 4px; margin-left: auto; }
    .ch-legend-icon { font-size: 14px; color: var(--text-muted); width: 28px; text-align: center; }

    /* Channel icon toggle buttons */
    .ch-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 6px; border: 0; flex-shrink: 0;
      background: transparent; color: var(--text-muted); cursor: pointer;
      transition: background 120ms, color 120ms;
      .material-icons { font-size: 16px; }
      &:hover { background: var(--surface-hover); color: var(--text-secondary); }
      &.ch-on { color: var(--accent-color); }
    }

    /* Per-project overrides */
    .inbox-override-list { }
    .inbox-override-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid var(--surface-border);
    }
    .inbox-meta { display: flex; align-items: center; gap: 8px; }
    .inbox-dot {
      width: 22px; height: 22px; border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: #fff; flex-shrink: 0;
    }
    .inbox-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
    .override-badge {
      font-size: 10px; font-weight: 600; padding: 1px 6px;
      background: color-mix(in srgb, var(--accent-color) 15%, transparent);
      color: var(--accent-color); border-radius: 8px;
    }
    .configure-btn {
      display: flex; align-items: center; gap: 4px;
      font-size: 12px; color: var(--accent-color);
      background: transparent; border: 0; cursor: pointer;
      padding: 4px 8px; border-radius: 5px;
      font-family: inherit;
      &:hover { background: color-mix(in srgb, var(--accent-color) 10%, transparent); }
    }
    .inbox-expand {
      padding: 6px 12px 10px 16px;
      background: var(--surface-bg);
      border-bottom: 1px solid var(--surface-border);
      display: flex; flex-direction: column; gap: 2px;
    }
    .ie-header {
      display: flex; justify-content: flex-end; gap: 4px;
      padding-right: 2px; margin-bottom: 2px;
    }
    .ie-ch-legend { font-size: 13px; color: var(--text-muted); width: 28px; text-align: center; }
    .ie-row {
      display: flex; align-items: center; gap: 8px;
      padding: 3px 0;
    }
    .ie-icon  { font-size: 15px; color: var(--text-muted); flex-shrink: 0; }
    .ie-label { font-size: 13px; color: var(--text-secondary); flex: 1; }
    .ie-ch-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 6px; border: 0; flex-shrink: 0;
      background: transparent; color: var(--text-muted); cursor: pointer;
      transition: background 120ms, color 120ms;
      .material-icons { font-size: 15px; }
      &:hover { background: var(--surface-hover); color: var(--text-secondary); }
      &.ie-ch-on { color: var(--accent-color); }
    }
    .reset-btn {
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; color: var(--text-muted);
      background: transparent; border: 1px solid var(--surface-border);
      cursor: pointer; padding: 4px 8px; border-radius: 5px;
      font-family: inherit; margin-top: 6px; width: fit-content;
      &:hover { color: #e53935; border-color: #e53935; }
    }
    .due-reminder-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
    .custom-offset-row {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: var(--text-secondary);
    }
    .hours-input {
      width: 60px; padding: 4px 8px; border-radius: 6px;
      border: 1px solid var(--surface-border);
      background: var(--surface-bg); color: var(--text-primary);
      font-family: inherit; font-size: 13px; text-align: center;
    }
    .restart-tour-btn {
      display: flex; align-items: center; gap: 6px; flex-shrink: 0;
      font-size: 13px; font-weight: 500; color: var(--accent-color);
      background: color-mix(in srgb, var(--accent-color) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent-color) 30%, transparent);
      cursor: pointer; padding: 7px 14px; border-radius: 7px;
      font-family: inherit; transition: background 120ms;
      &:hover { background: color-mix(in srgb, var(--accent-color) 18%, transparent); }
    }
  `],
})
export class SettingsPageComponent implements OnInit {
  private notifSvc  = inject(NotificationService);
  private inboxStore = inject(InboxStoreService);
  private auth      = inject(AuthService);
  onboarding        = inject(OnboardingService);
  private userPrefs = inject(UserPrefsService);

  tabs = [
    { key: 'general',       label: 'General',       icon: 'tune'          },
    { key: 'notifications', label: 'Notifications', icon: 'notifications' },
  ];

  private api = inject(ApiService);

  readonly DUE_REMINDER_PRESETS = DUE_REMINDER_PRESETS;

  activeTab       = signal('general');
  expandedInbox   = signal<string | null>(null);
  eventRows       = EVENT_ROWS;
  inboxEventRows  = INBOX_EVENT_ROWS;
  inboxes         = this.inboxStore.inboxes;
  userEmail     = computed(() => this.auth.user()?.email ?? '');
  timezone  = 'UTC';
  timezones = TIMEZONES;

  customOffsetHours = 24;

  dueReminderIsCustom = computed(() => {
    const mins = this.userPrefs.dueReminderOffsetMins;
    return !DUE_REMINDER_PRESETS.some((p) => p.mins === mins);
  });

  dueReminderSelectValue = computed(() =>
    this.dueReminderIsCustom() ? 'custom' : String(this.userPrefs.dueReminderOffsetMins),
  );

  globalSettings = computed(() =>
    this.notifSvc.getEffectiveSettings(null),
  );

  ngOnInit(): void {
    this.notifSvc.loadSettings();
    this.userPrefs.load();
    this.api.get<any>('/users/me').subscribe((u) => {
      if (u?.timezone) this.timezone = u.timezone;
      if (u?.due_reminder_offset_mins != null) {
        const mins = +u.due_reminder_offset_mins;
        const isPreset = DUE_REMINDER_PRESETS.some((p) => p.mins === mins);
        if (!isPreset) this.customOffsetHours = Math.round(mins / 60) || 1;
      }
    });
  }

  onDueReminderSelectChange(val: string): void {
    if (val === 'custom') {
      this.userPrefs.setDueReminderOffsetMins(this.customOffsetHours * 60);
    } else {
      this.userPrefs.setDueReminderOffsetMins(+val);
    }
  }

  onCustomHoursChange(hours: number): void {
    this.customOffsetHours = hours;
    if (hours > 0) this.userPrefs.setDueReminderOffsetMins(hours * 60);
  }

  saveTimezone(tz: string): void {
    this.timezone = tz;
    this.api.patch('/users/me/timezone', { timezone: tz }).subscribe();
  }

  saveGlobal(key: string, value: any): void {
    this.notifSvc.upsertSettings(null, { [key]: value });
  }

  projSettings(projectId: string): NotificationSettings {
    return this.notifSvc.getEffectiveSettings(projectId);
  }

  hasOverride(projectId: string): boolean {
    return this.notifSvc.allSettings().some((r) => r.project_id === projectId);
  }

  saveProj(projectId: string, key: string, value: any): void {
    this.notifSvc.upsertSettings(projectId, { [key]: value });
  }

  resetProj(projectId: string): void {
    this.notifSvc.deleteProjectSettings(projectId);
    this.expandedInbox.set(null);
  }

  toggleInboxExpand(id: string): void {
    this.expandedInbox.update((v) => (v === id ? null : id));
  }
}
