import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-admin-maintenance',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h2>Maintenance</h2>

      <div class="section">
        <h3>Timezone</h3>
        <div class="card">
          <div class="card-row">
            <div class="row-info">
              <div class="row-label">Apply default timezone to all accounts</div>
              <div class="row-desc">
                Override every user's timezone with the current default.
                Individual overrides will be lost.
              </div>
            </div>
            <button class="btn-action" [disabled]="applying()" (click)="applyTimezone()">
              @if (applying()) {
                <span class="material-icons spin" style="font-size:14px">refresh</span>
                Applying…
              } @else if (appliedCount() !== null) {
                <span class="material-icons" style="font-size:14px">check</span>
                Updated {{ appliedCount() }} users
              } @else {
                <span class="material-icons" style="font-size:14px">sync</span>
                Apply to All
              }
            </button>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Notifications</h3>
        <div class="card">
          <div class="card-row">
            <div class="row-info">
              <div class="row-label">Reset overdue notification</div>
              <div class="row-desc">Clears today's overdue-check flag for your account so the popup shows again on next page load.</div>
            </div>
            <button class="btn-action" (click)="clearOverdue()">
              @if (overdueCleared()) {
                <span class="material-icons" style="font-size:14px">check</span>
                Cleared
              } @else {
                <span class="material-icons" style="font-size:14px">restart_alt</span>
                Reset
              }
            </button>
          </div>
          <div class="card-row">
            <div class="row-info">
              <div class="row-label">Send overdue digest now</div>
              <div class="row-desc">Clears the sent flag and immediately fires the overdue email digest for your account — useful for testing.</div>
            </div>
            <button class="btn-action" [disabled]="digestRunning()" (click)="runOverdueDigest()">
              @if (digestRunning()) {
                <span class="material-icons spin" style="font-size:14px">refresh</span>
                Sending…
              } @else if (digestSent()) {
                <span class="material-icons" style="font-size:14px">check</span>
                Sent
              } @else {
                <span class="material-icons" style="font-size:14px">send</span>
                Send Now
              }
            </button>
          </div>
          <div class="card-row">
            <div class="row-info">
              <div class="row-label">Run notification scheduler</div>
              <div class="row-desc">Checks and sends upcoming, past-due, and custom reminders now without waiting for the next cron tick.</div>
            </div>
            <button class="btn-action" [disabled]="notifRunning()" (click)="runNotifications()">
              @if (notifRunning()) {
                <span class="material-icons spin" style="font-size:14px">refresh</span>
                Running…
              } @else if (notifRanAt()) {
                <span class="material-icons" style="font-size:14px">check</span>
                Done ({{ notifRanAt() }})
              } @else {
                <span class="material-icons" style="font-size:14px">play_arrow</span>
                Run Now
              }
            </button>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Recurring Tasks</h3>
        <div class="card">
          <div class="card-row">
            <div class="row-info">
              <div class="row-label">Run recurring scheduler</div>
              <div class="row-desc">Spawns overdue recurring task occurrences now without waiting for midnight.</div>
            </div>
            <button class="btn-action" [disabled]="recurringRunning()" (click)="runRecurring()">
              @if (recurringRunning()) {
                <span class="material-icons spin" style="font-size:14px">refresh</span>
                Running…
              } @else if (recurringRanAt()) {
                <span class="material-icons" style="font-size:14px">check</span>
                Done ({{ recurringRanAt() }})
              } @else {
                <span class="material-icons" style="font-size:14px">play_arrow</span>
                Run Now
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; max-width: 680px; }
    h2 { margin: 0 0 20px; font-size: 17px; font-weight: 600; color: var(--text-primary); }

    .section { margin-bottom: 24px; }
    h3 { margin: 0 0 10px; font-size: 11px; font-weight: 700; text-transform: uppercase;
         letter-spacing: .5px; color: var(--text-muted); }

    .card {
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 10px; overflow: hidden;
    }
    .card-row {
      display: flex; align-items: center; gap: 16px;
      padding: 14px 16px;
    }
    .row-info { flex: 1; min-width: 0; }
    .row-label { font-size: 13px; font-weight: 500; color: var(--text-primary); margin-bottom: 2px; }
    .row-desc  { font-size: 12px; color: var(--text-muted); line-height: 1.4; }

    .btn-action {
      flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px;
      padding: 6px 14px; border-radius: 7px;
      border: 1px solid var(--surface-border);
      background: var(--surface-bg); cursor: pointer;
      font-family: inherit; font-size: 12px; font-weight: 500;
      color: var(--text-secondary); white-space: nowrap; transition: all 120ms;
      &:hover:not(:disabled) { border-color: var(--accent-color); color: var(--accent-color); }
      &:disabled { opacity: .5; cursor: default; }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin .8s linear infinite; }
  `],
})
export class AdminMaintenanceComponent {
  private api = inject(ApiService);

  applying        = signal(false);
  appliedCount    = signal<number | null>(null);
  overdueCleared  = signal(false);
  digestRunning   = signal(false);
  digestSent      = signal(false);
  notifRunning    = signal(false);
  notifRanAt      = signal('');
  recurringRunning = signal(false);
  recurringRanAt  = signal('');

  applyTimezone(): void {
    this.applying.set(true);
    this.appliedCount.set(null);
    this.api.post<{ updated: number }>('/admin/settings/apply-timezone', {}).subscribe({
      next: (res) => { this.applying.set(false); this.appliedCount.set(res.updated); },
      error: () => this.applying.set(false),
    });
  }

  clearOverdue(): void {
    this.api.post('/admin/clear-overdue-notified', {}).subscribe(() => {
      this.overdueCleared.set(true);
      setTimeout(() => this.overdueCleared.set(false), 2000);
    });
  }

  runOverdueDigest(): void {
    this.digestRunning.set(true);
    this.digestSent.set(false);
    this.api.post('/admin/run-overdue-digest', {}).subscribe({
      next: () => { this.digestRunning.set(false); this.digestSent.set(true); setTimeout(() => this.digestSent.set(false), 3000); },
      error: () => this.digestRunning.set(false),
    });
  }

  runNotifications(): void {
    this.notifRunning.set(true);
    this.notifRanAt.set('');
    this.api.post<any>('/admin/run-notifications', {}).subscribe({
      next: () => { this.notifRunning.set(false); this.notifRanAt.set(new Date().toLocaleTimeString()); },
      error: () => this.notifRunning.set(false),
    });
  }

  runRecurring(): void {
    this.recurringRunning.set(true);
    this.recurringRanAt.set('');
    this.api.post<any>('/admin/run-recurring', {}).subscribe({
      next: () => { this.recurringRunning.set(false); this.recurringRanAt.set(new Date().toLocaleTimeString()); },
      error: () => this.recurringRunning.set(false),
    });
  }
}
