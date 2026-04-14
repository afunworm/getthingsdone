import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { PriorityService, PRIORITY_COLORS } from '../../../core/services/priority.service';

const TIMEZONES = Intl.supportedValuesOf('timeZone');

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h2>Settings</h2>

      <div class="section">
        <h3>Defaults</h3>
        <div class="card">
          <div class="card-row">
            <div class="row-info">
              <div class="row-label">Default timezone</div>
              <div class="row-desc">
                Applied to new users automatically on account creation.
                Affects when daily upcoming and past-due reminders reset.
                Users can override their own timezone in Settings.
              </div>
            </div>
            <select class="tz-select" (change)="saveTz($any($event.target).value)">
              @for (tz of timezones; track tz) {
                <option [value]="tz" [selected]="tz === defaultTz">{{ tz }}</option>
              }
            </select>
          </div>
        </div>
      </div>

      <!-- API Tokens -->
      <div class="section">
        <h3>API Tokens</h3>
        <div class="card">
          <!-- Existing tokens -->
          @for (tok of apiTokens(); track tok.id) {
            <div class="card-row token-row">
              <div class="row-info">
                <div class="row-label">{{ tok.name }}</div>
                <div class="row-desc">
                  Created {{ tok.created_at * 1000 | date:'MMM d, yyyy' }}
                  @if (tok.expires_at) {
                    · Expires {{ tok.expires_at * 1000 | date:'MMM d, yyyy' }}
                  } @else {
                    · Never expires
                  }
                  @if (tok.last_used_at) {
                    · Last used {{ tok.last_used_at * 1000 | date:'MMM d, yyyy' }}
                  }
                </div>
              </div>
              <button class="btn-revoke" (click)="revokeToken(tok.id)">
                <span class="material-icons" style="font-size:13px">delete</span>Revoke
              </button>
            </div>
          }
          @if (apiTokens().length === 0) {
            <div class="card-row" style="color:var(--text-muted);font-size:12px">No tokens yet.</div>
          }

          <!-- New token revealed after creation -->
          @if (newToken()) {
            <div class="token-reveal">
              <span class="material-icons" style="font-size:14px;color:#388e3c">check_circle</span>
              <span style="font-size:12px;color:var(--text-secondary)">Copy now — it won't be shown again:</span>
              <code class="token-code">{{ newToken() }}</code>
              <button class="btn-copy" (click)="copyToken()" [title]="copied() ? 'Copied!' : 'Copy'">
                <span class="material-icons" style="font-size:14px">{{ copied() ? 'check' : 'content_copy' }}</span>
              </button>
            </div>
          }

          <!-- Create form -->
          <div class="card-row create-row">
            <input class="label-input" [(ngModel)]="newTokenName" placeholder="Token name (e.g. My Script)" style="flex:1;width:auto" />
            <div class="expiry-wrap">
              <select class="tz-select" [(ngModel)]="newTokenExpiry" style="width:160px">
                <option value="">Never expires</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
                <option value="custom">Custom date…</option>
              </select>
              @if (newTokenExpiry === 'custom') {
                <input type="date" class="tz-select" style="width:160px;margin-top:4px"
                  [(ngModel)]="newTokenCustomDate"
                  [min]="tomorrow()" />
              }
            </div>
            <button class="btn-apply" [disabled]="!newTokenName.trim() || creatingToken() || (newTokenExpiry === 'custom' && !newTokenCustomDate)" (click)="createToken()">
              @if (creatingToken()) {
                <span class="material-icons spin" style="font-size:14px">refresh</span>
              } @else {
                <span class="material-icons" style="font-size:14px">add</span>
              }
              Create Token
            </button>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>File Uploads</h3>
        <div class="card">
          <div class="card-row" style="align-items:flex-start">
            <div class="row-info">
              <div class="row-label">Allowed extensions</div>
              <div class="row-desc">Comma-separated list of permitted file extensions (without dots). Users will be blocked from uploading anything not on this list.</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
              <input class="label-input" style="width:240px"
                [(ngModel)]="allowedExtensions"
                placeholder="jpg,png,pdf,zip…" />
              <button class="btn-apply" (click)="saveAllowedExtensions()">
                @if (extSaved()) {
                  <span class="material-icons" style="font-size:14px">check</span>
                  Saved
                } @else {
                  Save
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Priority Labels</h3>
        <div class="card">
          @for (lvl of [1,2,3]; track lvl) {
            <div class="card-row">
              <div class="row-info">
                <div class="row-label" [style.color]="COLORS[lvl]">
                  <span class="material-icons" style="font-size:14px;vertical-align:middle">priority_high</span>
                  Level {{ lvl }}
                </div>
                <div class="row-desc">Label shown on tasks and filter chips</div>
              </div>
              <input
                class="label-input"
                [(ngModel)]="priLabels[lvl.toString()]"
                [placeholder]="lvl === 3 ? 'Urgent' : lvl === 2 ? 'Medium' : 'Low'"
                [style.border-color]="COLORS[lvl]"
              />
            </div>
          }
          <div class="card-row" style="justify-content:flex-end">
            <button class="btn-apply" (click)="savePriorityLabels()">
              @if (priSaved()) {
                <span class="material-icons" style="font-size:14px">check</span>
                Saved
              } @else {
                Save Labels
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
      border-bottom: 1px solid var(--surface-border);
      &:last-child { border-bottom: 0; }
    }
    .row-info { flex: 1; min-width: 0; }
    .row-label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .row-desc  { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

    .tz-select {
      flex-shrink: 0; width: 220px;
      padding: 6px 10px; border-radius: 6px;
      border: 1px solid var(--surface-border);
      background: var(--surface-bg); color: var(--text-primary);
      font-family: inherit; font-size: 13px; cursor: pointer;
    }

    .label-input {
      flex-shrink: 0; width: 160px;
      padding: 6px 10px; border-radius: 6px;
      border: 1px solid var(--surface-border);
      background: var(--surface-bg); color: var(--text-primary);
      font-family: inherit; font-size: 13px; font-weight: 600;
      outline: none;
      &:focus { box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 20%, transparent); }
    }

    .btn-apply {
      flex-shrink: 0;
      display: inline-flex; align-items: center; gap: 5px;
      padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer;
      background: var(--accent-color); color: #fff;
      font-family: inherit; font-size: 12px; font-weight: 600; white-space: nowrap;
      &:hover:not(:disabled) { opacity: .88; }
      &:disabled { opacity: .55; cursor: default; }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin .8s linear infinite; }

    .token-row { flex-wrap: wrap; gap: 8px; }
    .btn-revoke {
      flex-shrink: 0;
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 6px; border: 1px solid #d32f2f;
      background: transparent; cursor: pointer; color: #d32f2f;
      font-family: inherit; font-size: 11px; font-weight: 600;
      transition: all 120ms;
      &:hover { background: rgba(211,47,47,.08); }
    }
    .token-reveal {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 10px 16px; background: color-mix(in srgb, #388e3c 8%, transparent);
      border-bottom: 1px solid var(--surface-border);
    }
    .token-code {
      flex: 1; min-width: 0; word-break: break-all;
      font-family: monospace; font-size: 12px; color: var(--text-primary);
      background: var(--surface-bg); padding: 4px 8px; border-radius: 4px;
    }
    .btn-copy {
      flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--surface-border);
      background: transparent; cursor: pointer; color: var(--text-muted);
      transition: all 120ms;
      &:hover { color: var(--text-primary); background: var(--surface-hover); }
    }
    .create-row { gap: 8px; flex-wrap: wrap; }
    .expiry-wrap { flex-shrink: 0; }
  `],
})
export class AdminSettingsComponent implements OnInit {
  private api     = inject(ApiService);
  prioritySvc     = inject(PriorityService);
  readonly COLORS = PRIORITY_COLORS;

  defaultTz    = 'UTC';
  timezones    = TIMEZONES;

  // API Tokens
  apiTokens    = signal<any[]>([]);
  newTokenName = '';
  newTokenExpiry = '';
  newTokenCustomDate = '';
  newToken     = signal<string | null>(null);
  copied       = signal(false);
  creatingToken = signal(false);

  // File uploads
  allowedExtensions = 'jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,txt,zip,mp4,mov';
  extSaved = signal(false);

  // Priority labels — editable copies of the signal values
  priLabels: Record<string, string> = { '1': 'Low', '2': 'Medium', '3': 'Urgent' };
  priSaved  = signal(false);

  ngOnInit(): void {
    this.api.get<Record<string, string>>('/admin/settings').subscribe((s) => {
      if (s['default_timezone']) this.defaultTz = s['default_timezone'];
      if (s['priority_labels']) {
        try { this.priLabels = { ...JSON.parse(s['priority_labels']) }; } catch { /* keep defaults */ }
      }
      if (s['allowed_upload_extensions']) this.allowedExtensions = s['allowed_upload_extensions'];
    });
    this.loadTokens();
  }

  loadTokens(): void {
    this.api.get<any[]>('/admin/api-tokens').subscribe((t) => this.apiTokens.set(t));
  }

  tomorrow(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('en-CA');
  }

  createToken(): void {
    const name = this.newTokenName.trim();
    if (!name) return;
    this.creatingToken.set(true);
    let expiresAt: number | null = null;
    if (this.newTokenExpiry === 'custom') {
      expiresAt = this.newTokenCustomDate
        ? Math.floor(new Date(this.newTokenCustomDate + 'T23:59:59').getTime() / 1000)
        : null;
    } else if (this.newTokenExpiry) {
      expiresAt = Math.floor(Date.now() / 1000) + +this.newTokenExpiry * 86400;
    }
    this.api.post<any>('/admin/api-tokens', { name, expiresAt }).subscribe({
      next: (res) => {
        this.creatingToken.set(false);
        this.newToken.set(res.token);
        this.newTokenName = '';
        this.newTokenExpiry = '';
        this.newTokenCustomDate = '';
        this.loadTokens();
      },
      error: () => this.creatingToken.set(false),
    });
  }

  revokeToken(id: string): void {
    this.api.delete(`/admin/api-tokens/${id}`).subscribe(() => {
      this.apiTokens.update((t) => t.filter((x) => x.id !== id));
      if (this.newToken()) this.newToken.set(null);
    });
  }

  copyToken(): void {
    navigator.clipboard.writeText(this.newToken() ?? '');
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  saveTz(value: string): void {
    this.defaultTz = value;
    this.api.patch('/admin/settings', { key: 'default_timezone', value }).subscribe();
  }

  saveAllowedExtensions(): void {
    const value = this.allowedExtensions.trim();
    this.api.patch('/admin/settings', { key: 'allowed_upload_extensions', value }).subscribe(() => {
      this.extSaved.set(true);
      setTimeout(() => this.extSaved.set(false), 2000);
    });
  }

  savePriorityLabels(): void {
    this.api.patch('/admin/settings', { key: 'priority_labels', value: JSON.stringify(this.priLabels) })
      .subscribe(() => {
        this.prioritySvc.labels.set({ ...this.priLabels });
        this.priSaved.set(true);
        setTimeout(() => this.priSaved.set(false), 2000);
      });
  }
}
