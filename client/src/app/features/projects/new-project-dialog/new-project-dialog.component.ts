import { Component, OnInit, inject, signal, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AutocompleteSearchComponent, AutocompleteResult } from '../../../shared/components/autocomplete-search/autocomplete-search.component';

const COLOR_PRESETS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6',
  '#64748b', '#1e293b',
];

const EMOJI_PRESETS = [
  '📥','📬','📋','✅','🚀','⭐','🔥','💡','🎯','📊',
  '🛠️','🔧','📝','🗂️','🎨','🏆','💼','🔔','⚡','🌐',
  '🧩','📦','🔒','🌱','🤝','💬','🏗️','🎉','🔍','📌',
];

@Component({
  selector: 'app-new-project-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, AutocompleteSearchComponent],
  template: `
    <div class="dialog-card">
      <!-- Header -->
      <div class="dialog-header">
        <div class="dialog-title">
          <span class="inbox-icon" [style.background]="form.color">
            {{ form.emoji || name0 }}
          </span>
          {{ isEdit ? 'Edit Inbox' : 'New Inbox' }}
        </div>
        <button class="btn-icon" (click)="dialogRef.close()">
          <span class="material-icons" style="font-size:16px">close</span>
        </button>
      </div>

      <!-- Body -->
      <div class="dialog-body">

        <!-- Name -->
        <div class="field">
          <label class="field-label">Inbox name *</label>
          <input class="field-input" [(ngModel)]="form.name" placeholder="e.g. Product Team" />
        </div>

        <!-- Description -->
        <div class="field">
          <label class="field-label">Description</label>
          <textarea class="field-textarea" [(ngModel)]="form.description" rows="2" placeholder="Optional"></textarea>
        </div>

        <!-- Color -->
        <div class="field">
          <label class="field-label">Color</label>
          <div class="color-grid">
            @for (c of colorPresets; track c) {
              <button class="color-dot" [style.background]="c" [class.selected]="form.color === c"
                      (click)="form.color = c" [title]="c"></button>
            }
          </div>
        </div>

        <!-- Emoji -->
        <div class="field">
          <label class="field-label">Emoji</label>
          <div class="emoji-section">
            <div class="emoji-custom-row">
              <input
                #emojiInput
                class="field-input emoji-custom-input"
                [value]="form.emoji"
                (input)="onEmojiInput($event)"
                maxlength="2"
              />
              @if (form.emoji) {
                <button class="btn btn-ghost" style="padding:3px 8px;font-size:12px" (click)="form.emoji = ''">
                  Clear
                </button>
              }
            </div>
            <div class="emoji-grid">
              @for (e of emojiPresets; track e) {
                <button class="emoji-btn" [class.selected]="form.emoji === e" (click)="form.emoji = e">{{ e }}</button>
              }
            </div>
          </div>
        </div>

        <!-- Flow template (create always; edit admin-only) -->
        @if (!isEdit || isAdmin()) {
          <div class="field">
            <label class="field-label">Flow template</label>
            <select class="field-select" [(ngModel)]="form.flowTemplateId">
              @for (f of flows(); track f.id) {
                <option [value]="f.id">{{ f.name }}{{ f.is_default ? ' (default)' : '' }} — {{ stepLabels(f) }}</option>
              }
            </select>
          </div>
        }

        <!-- Due date -->
        <div class="field">
          <label class="field-label">Due date</label>
          <input class="field-input" type="date" [(ngModel)]="form.dueDateStr" />
        </div>

        <!-- Members -->
        <div class="field members-section">
          <label class="field-label">Members</label>

          <!-- Owner row -->
          <div class="member-row owner-row">
            <span class="member-avatar" [style.background]="form.color">
              {{ ownerName[0]?.toUpperCase() }}
            </span>
            <span class="member-name">{{ ownerName }}</span>
            <span class="owner-badge">Owner</span>
            @if (isEdit && canTransfer()) {
              <button class="btn btn-ghost transfer-btn" (click)="transferMode.set(!transferMode())">
                Transfer
              </button>
            }
          </div>

          <!-- Transfer ownership -->
          @if (transferMode()) {
            <div class="transfer-section">
              <label class="field-label" style="margin-bottom:4px">Transfer ownership to</label>
              <app-autocomplete-search
                placeholder="Search by name or email..."
                [excludeIds]="[project?.owner_id]"
                (selected)="doTransfer($event)"
              />
            </div>
          }

          <!-- Existing project members -->
          @if (currentMembers().length) {
            <div class="members-list">
              @for (m of currentMembers(); track m.id) {
                <div class="member-row">
                  <span class="member-avatar" [style.background]="m.team_name ? '#7b1fa2' : 'var(--accent-color)'">
                    {{ (m.user_name || m.team_name || '?')[0].toUpperCase() }}
                  </span>
                  <span class="member-name">{{ m.user_name || m.team_name }}</span>
                  <span class="member-type">{{ m.team_name ? 'Team' : 'User' }}</span>
                  <button class="btn-icon remove-btn" (click)="removeMember(m)" title="Remove">
                    <span class="material-icons" style="font-size:13px">close</span>
                  </button>
                </div>
              }
            </div>
          }

          <!-- Pending members (create mode) -->
          @if (!isEdit && pendingMembers().length) {
            <div class="members-list">
              @for (m of pendingMembers(); track m.id) {
                <div class="member-row">
                  <span class="member-avatar" [style.background]="m.isTeam ? '#7b1fa2' : 'var(--accent-color)'">
                    {{ m.name[0].toUpperCase() }}
                  </span>
                  <span class="member-name">{{ m.name }}</span>
                  <span class="member-type">{{ m.isTeam ? 'Team' : 'User' }}</span>
                  <button class="btn-icon remove-btn" (click)="removePending(m)" title="Remove">
                    <span class="material-icons" style="font-size:13px">close</span>
                  </button>
                </div>
              }
            </div>
          }

          <!-- Add member autocomplete -->
          @if (addingMember()) {
            <div class="add-member-section">
              <app-autocomplete-search
                style="flex:1;min-width:0"
                placeholder="Search users or teams..."
                [includeTeams]="true"
                [excludeIds]="currentExcludeIds()"
                (selected)="confirmAdd($event)"
              />
              <button class="btn-icon" style="flex-shrink:0" (click)="addingMember.set(false)">
                <span class="material-icons" style="font-size:15px">close</span>
              </button>
            </div>
          } @else {
            <button class="btn btn-ghost add-member-btn" (click)="openAdd()">
              <span class="material-icons" style="font-size:13px">person_add</span>
              Add member / team
            </button>
          }
        </div>

      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        @if (isEdit) {
          <button class="btn btn-danger" (click)="deleteInbox()">
            <span class="material-icons" style="font-size:14px">delete</span>
            Delete
          </button>
          <span style="flex:1"></span>
        }
        <button class="btn btn-ghost" (click)="dialogRef.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="!form.name.trim()" (click)="submit()">
          {{ isEdit ? 'Save' : 'Create Inbox' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .dialog-card {
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 12px; box-shadow: var(--shadow-md);
      display: flex; flex-direction: column; width: 100%; max-height: 90vh;
    }
    .dialog-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 16px 10px; border-bottom: 1px solid var(--surface-border); flex-shrink: 0;
    }
    .dialog-title {
      display: flex; align-items: center; gap: 9px;
      font-size: 15px; font-weight: 600; color: var(--text-primary);
    }
    .inbox-icon {
      width: 28px; height: 28px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 700; color: #fff; flex-shrink: 0;
    }

    .dialog-body {
      padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;
      overflow-y: auto; flex: 1;
    }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .dialog-footer {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px 14px; border-top: 1px solid var(--surface-border); flex-shrink: 0;
    }

    /* Color */
    .color-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .color-dot {
      width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent;
      cursor: pointer; padding: 0; transition: transform 100ms;
      &:hover { transform: scale(1.2); }
      &.selected { border-color: var(--text-primary); transform: scale(1.1); box-shadow: 0 0 0 2px white inset; }
    }

    /* Emoji */
    .emoji-section { display: flex; flex-direction: column; gap: 6px; }
    .emoji-custom-row { display: flex; align-items: center; gap: 6px; }
    .emoji-custom-input { width: 54px !important; font-size: 18px !important; text-align: center; padding: 2px 6px !important; }
    .emoji-grid { display: flex; flex-wrap: wrap; gap: 4px; }
    .emoji-btn {
      width: 30px; height: 30px; border-radius: 6px; border: 1.5px solid var(--surface-border);
      background: var(--surface-hover); cursor: pointer; font-size: 15px;
      display: flex; align-items: center; justify-content: center;
      transition: border-color 100ms, background 100ms;
      &:hover { border-color: var(--accent-color); }
      &.selected { border-color: var(--accent-color); background: color-mix(in srgb, var(--accent-color) 12%, transparent); }
    }

    /* Members */
    .members-section { gap: 6px; }
    .members-list { display: flex; flex-direction: column; gap: 3px; }
    .member-row {
      display: flex; align-items: center; gap: 7px;
      padding: 4px 6px; border-radius: 6px;
    }
    .owner-row { background: color-mix(in srgb, var(--accent-color) 6%, transparent); }
    .member-avatar {
      width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 600;
    }
    .member-name { font-size: 13px; color: var(--text-primary); flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .member-type { font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; flex-shrink: 0; }
    .owner-badge {
      padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 700;
      background: color-mix(in srgb, var(--accent-color) 15%, transparent);
      color: var(--accent-color); text-transform: uppercase; flex-shrink: 0;
    }
    .transfer-btn { font-size: 11px; padding: 2px 7px; flex-shrink: 0; }
    .remove-btn { margin-left: auto; color: var(--text-muted); &:hover { color: #d32f2f; } }

    .add-member-btn { align-self: flex-start; font-size: 12px; padding: 3px 8px; margin-top: 2px; }
    .add-member-section { display: flex; align-items: flex-start; gap: 6px; }

    /* Transfer */
    .transfer-section {
      padding: 10px; border-radius: 8px;
      background: color-mix(in srgb, var(--accent-color) 5%, transparent);
      border: 1px dashed color-mix(in srgb, var(--accent-color) 30%, transparent);
    }
  `],
})
export class NewProjectDialogComponent implements OnInit {
  dialogRef = inject(DialogRef<any>);
  data: any = inject(DIALOG_DATA);
  private api = inject(ApiService);
  private auth = inject(AuthService);

  flows = signal<any[]>([]);
  pendingMembers = signal<AutocompleteResult[]>([]);
  addingMember = signal(false);
  transferMode = signal(false);

  readonly colorPresets = COLOR_PRESETS;
  readonly emojiPresets = EMOJI_PRESETS;

  get isEdit(): boolean { return !!this.data?.project; }
  get project(): any { return this.data?.project; }
  get name0(): string { return this.form.name ? this.form.name[0].toUpperCase() : '?'; }
  get ownerName(): string {
    if (this.isEdit) return this.project.owner_name ?? 'Owner';
    return 'You';
  }

  form = {
    name: '',
    description: '',
    flowTemplateId: '',
    dueDateStr: '',
    color: '#6366f1',
    emoji: '',
  };

  // currentMembers live-updated in edit mode
  currentMembers = signal<any[]>([]);

  ngOnInit(): void {
    if (this.isEdit) {
      const p = this.project;
      this.form.name = p.name;
      this.form.description = p.description ?? '';
      this.form.color = p.color ?? '#6366f1';
      this.form.emoji = p.emoji ?? '';
      this.form.dueDateStr = p.due_date
        ? new Date(p.due_date * 1000).toLocaleDateString('en-CA')
        : '';
      this.form.flowTemplateId = p.flow_template_id ?? '';
      this.currentMembers.set(p.members ?? []);
    }

    this.api.get<any[]>('/flows').subscribe((flows) => {
      this.flows.set(flows);
      if (!this.isEdit) {
        const def = flows.find((f) => f.is_default) ?? flows[0];
        if (def) this.form.flowTemplateId = def.id;
      }
    });
  }

  isAdmin(): boolean { return this.auth.user()?.role === 'admin'; }

  canTransfer(): boolean { return true; }

  onEmojiInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    // Keep only the first grapheme cluster (handles multi-codepoint emoji)
    const seg = val ? [...new Intl.Segmenter().segment(val)][0]?.segment ?? '' : '';
    this.form.emoji = seg;
    (event.target as HTMLInputElement).value = seg;
  }

  stepLabels(flow: any): string {
    return (flow.steps as any[]).map((s) => (typeof s === 'string' ? s : s.label)).join(' → ');
  }

  // ── Add member ───────────────────────────────────────────
  currentExcludeIds(): string[] {
    const ownerId = this.isEdit ? this.project?.owner_id : null;
    const memberIds = this.isEdit
      ? this.currentMembers().map((m: any) => m.user_id || m.team_id)
      : this.pendingMembers().map((m) => m.id);
    return [ownerId, ...memberIds].filter(Boolean);
  }

  openAdd(): void { this.addingMember.set(true); }

  confirmAdd(r: AutocompleteResult): void {
    if (this.isEdit) {
      const dto = r.isTeam
        ? { teamId: r.id, permissions: ['view', 'create', 'complete'] }
        : { userId: r.id, permissions: ['view', 'create', 'complete'] };
      this.api.post<any>(`/projects/${this.project.id}/members`, dto).subscribe((updated) => {
        this.currentMembers.set(updated.members ?? []);
        this.addingMember.set(false);
      });
    } else {
      this.pendingMembers.update((list) => [...list, r]);
      this.addingMember.set(false);
    }
  }

  removeMember(m: any): void {
    this.api.delete(`/projects/${this.project.id}/members/${m.id}`).subscribe(() => {
      this.currentMembers.update((list) => list.filter((x) => x.id !== m.id));
    });
  }

  removePending(m: any): void {
    this.pendingMembers.update((list) => list.filter((p) => p.id !== m.id));
  }

  // ── Transfer ownership ───────────────────────────────────
  doTransfer(r: AutocompleteResult): void {
    this.api.patch<any>(`/projects/${this.project.id}/transfer`, { newOwnerId: r.id })
      .subscribe((updated) => this.dialogRef.close(updated));
  }

  // ── Submit ───────────────────────────────────────────────
  submit(): void {
    const body: any = {
      name: this.form.name.trim(),
      description: this.form.description.trim() || null,
      color: this.form.color,
      emoji: this.form.emoji || null,
      dueDate: this.form.dueDateStr
        ? Math.floor(new Date(this.form.dueDateStr + 'T00:00:00').getTime() / 1000)
        : null,
    };

    if (this.isEdit) {
      if (this.isAdmin() && this.form.flowTemplateId) {
        body.flowTemplateId = this.form.flowTemplateId;
      }
      this.api.patch<any>(`/projects/${this.project.id}`, body)
        .subscribe((p) => this.dialogRef.close(p));
    } else {
      body.flowTemplateId = this.form.flowTemplateId || undefined;
      body.memberUserIds = this.pendingMembers().filter((m) => !m.isTeam).map((m) => m.id);
      body.memberTeamIds = this.pendingMembers().filter((m) => m.isTeam).map((m) => m.id);
      this.api.post<any>('/projects', body).subscribe((p) => this.dialogRef.close(p));
    }
  }

  deleteInbox(): void {
    this.api.delete(`/projects/${this.project.id}`).subscribe(() => this.dialogRef.close('deleted'));
  }
}
