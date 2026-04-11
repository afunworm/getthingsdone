import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-smtp',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h2>SMTP / Email Configuration</h2>

      <div class="smtp-form">
        <div class="form-row">
          <div class="field">
            <label class="field-label">SMTP Host</label>
            <input class="field-input" [(ngModel)]="form.host" placeholder="smtp.example.com" />
          </div>
          <div class="field port-field">
            <label class="field-label">Port</label>
            <input class="field-input" type="number" [(ngModel)]="form.port" />
          </div>
        </div>

        <label class="checkbox-label">
          <input type="checkbox" [(ngModel)]="form.secure" />
          Use TLS/SSL
        </label>

        <div class="form-row">
          <div class="field">
            <label class="field-label">Username</label>
            <input class="field-input" [(ngModel)]="form.username" />
          </div>
          <div class="field">
            <label class="field-label">Password</label>
            <input class="field-input" type="password" [(ngModel)]="form.password"
              [placeholder]="hasPassword() ? '(unchanged)' : ''" />
          </div>
        </div>

        <div class="form-row">
          <div class="field">
            <label class="field-label">From address</label>
            <input class="field-input" [(ngModel)]="form.fromAddress" placeholder="noreply@example.com" />
          </div>
          <div class="field">
            <label class="field-label">From name</label>
            <input class="field-input" [(ngModel)]="form.fromName" placeholder="Get Things Done" />
          </div>
        </div>

        <div class="form-actions">
          <button class="btn btn-ghost" (click)="testConnection()" [disabled]="testing()">
            {{ testing() ? 'Testing...' : 'Test Connection' }}
          </button>
          <button class="btn btn-primary" (click)="save()">Save</button>
        </div>

        <div class="send-test-row">
          <input class="field-input" [(ngModel)]="testEmailTo" placeholder="Send test email to…" type="email" />
          <button class="btn btn-ghost" (click)="sendTestEmail()" [disabled]="sending() || !testEmailTo.trim()">
            {{ sending() ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; max-width: 520px; }
    h2 { margin: 0 0 14px; font-size: 17px; font-weight: 600; color: var(--text-primary); }
    .smtp-form {
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 10px; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .form-row { display: flex; gap: 10px; }
    .form-row .field { flex: 1; }
    .port-field { flex: 0 0 88px !important; }
    .field { display: flex; flex-direction: column; }
    .checkbox-label {
      display: flex; align-items: center; gap: 7px;
      font-size: 13px; color: var(--text-secondary); cursor: pointer;
      input { cursor: pointer; }
    }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
    .send-test-row {
      display: flex; gap: 8px; align-items: center;
      padding-top: 4px; border-top: 1px solid var(--surface-border); margin-top: 4px;
    }
    .send-test-row .field-input { flex: 1; }
  `],
})
export class AdminSmtpComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  form = { host: '', port: 587, secure: false, username: '', password: '', fromAddress: '', fromName: 'Get Things Done' };
  hasPassword = signal(false);
  testing = signal(false);
  sending = signal(false);
  testEmailTo = '';

  ngOnInit(): void {
    this.api.get<any>('/admin/smtp').subscribe((cfg) => {
      if (!cfg) return;
      this.form.host = cfg.host ?? '';
      this.form.port = cfg.port ?? 587;
      this.form.secure = !!cfg.secure;
      this.form.username = cfg.username ?? '';
      this.form.fromAddress = cfg.from_address ?? '';
      this.form.fromName = cfg.from_name ?? 'Get Things Done';
      this.hasPassword.set(cfg.hasPassword);
    });
  }

  save(): void {
    const body: any = { ...this.form };
    if (!this.form.password) delete body.password;
    this.api.patch('/admin/smtp', body).subscribe(() => {
      this.toast.show('SMTP configuration saved');
    });
  }

  sendTestEmail(): void {
    const to = this.testEmailTo.trim();
    if (!to) return;
    this.sending.set(true);
    this.api.post<any>('/admin/smtp/send-test', { to }).subscribe({
      next: (r) => {
        this.sending.set(false);
        this.toast.show(r.ok ? `Test email sent to ${to}` : 'Failed to send — check SMTP config', r.ok ? 'ok' : 'error');
        if (r.ok) this.testEmailTo = '';
      },
      error: () => { this.sending.set(false); this.toast.show('Failed to send test email', 'error'); },
    });
  }

  testConnection(): void {
    this.testing.set(true);
    this.api.post<any>('/admin/smtp/test', {}).subscribe({
      next: (r) => {
        this.testing.set(false);
        this.toast.show(r.ok ? 'Connection successful!' : `Failed: ${r.error}`, r.ok ? 'ok' : 'error');
      },
      error: () => { this.testing.set(false); this.toast.show('Connection test failed', 'error'); },
    });
  }
}
