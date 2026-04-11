import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/services/api.service';
import { AutocompleteSearchComponent, AutocompleteResult } from '../../../shared/components/autocomplete-search/autocomplete-search.component';

@Component({
  selector: 'app-team-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, AutocompleteSearchComponent],
  template: `
    <div class="dialog-card">
      <div class="dialog-header">
        <div class="dialog-title">{{ isCreate ? 'New Team' : 'Edit Team' }}</div>
        <button class="btn-icon" (click)="dialogRef.close()">
          <span class="material-icons" style="font-size:16px">close</span>
        </button>
      </div>

      <div class="dialog-body">
        <div class="field">
          <label class="field-label">Name *</label>
          <input class="field-input" [(ngModel)]="name" placeholder="e.g. Engineering" />
        </div>
        <div class="field">
          <label class="field-label">Description</label>
          <input class="field-input" [(ngModel)]="desc" placeholder="Optional" />
        </div>

        @if (!isCreate) {
          <div class="field members-section">
            <label class="field-label">Members</label>

            @if (members().length) {
              <div class="members-list">
                @for (m of members(); track m.id) {
                  <div class="member-row">
                    <span class="member-avatar">{{ m.name[0].toUpperCase() }}</span>
                    <span class="member-name">{{ m.name }}</span>
                    @if (m.role === 'lead') {
                      <span class="role-badge">Lead</span>
                    }
                    <button class="btn-icon remove-btn" (click)="removeMember(m.id)" title="Remove">
                      <span class="material-icons" style="font-size:13px">close</span>
                    </button>
                  </div>
                }
              </div>
            }

            @if (addingMember()) {
              <div class="add-row">
                <app-autocomplete-search
                  style="flex:1;min-width:0"
                  placeholder="Search by name or email..."
                  [excludeIds]="memberIds()"
                  (selected)="onUserSelected($event)"
                />
                <select class="field-select" style="width:90px;flex-shrink:0" [(ngModel)]="addRole">
                  <option value="member">Member</option>
                  <option value="lead">Lead</option>
                </select>
                <button class="btn-icon" style="flex-shrink:0" (click)="addingMember.set(false)">
                  <span class="material-icons" style="font-size:15px">close</span>
                </button>
              </div>
            } @else {
              <button class="btn btn-ghost add-btn" (click)="addingMember.set(true)">
                <span class="material-icons" style="font-size:13px">person_add</span>
                Add member
              </button>
            }
          </div>
        }
      </div>

      <div class="dialog-footer">
        @if (!isCreate) {
          <button class="btn btn-danger" (click)="deleteTeam()">
            <span class="material-icons" style="font-size:14px">delete</span>
            Delete
          </button>
          <span style="flex:1"></span>
        }
        <button class="btn btn-ghost" (click)="dialogRef.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="!name.trim()" (click)="submit()">
          {{ isCreate ? 'Create' : 'Save' }}
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
    .dialog-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
    .dialog-body {
      padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;
      overflow-y: auto; flex: 1;
    }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .dialog-footer {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px 14px; border-top: 1px solid var(--surface-border); flex-shrink: 0;
    }

    .members-section { gap: 8px; }
    .members-list { display: flex; flex-direction: column; gap: 3px; }
    .member-row {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 8px; border-radius: 6px; background: var(--surface-hover);
    }
    .member-avatar {
      width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
      background: var(--accent-color); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 600;
    }
    .member-name { flex: 1; font-size: 13px; color: var(--text-primary); }
    .role-badge {
      padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 700;
      background: color-mix(in srgb, #7b1fa2 15%, transparent); color: #7b1fa2;
      text-transform: uppercase; flex-shrink: 0;
    }
    .remove-btn { margin-left: auto; color: var(--text-muted); &:hover { color: #d32f2f; } }

    .add-btn { align-self: flex-start; font-size: 12px; padding: 3px 8px; }
    .add-row { display: flex; align-items: flex-start; gap: 6px; }
  `],
})
export class TeamDialogComponent implements OnInit {
  dialogRef = inject(DialogRef<any>);
  data: any = inject(DIALOG_DATA);
  private api = inject(ApiService);

  get isCreate(): boolean { return !this.data?.team; }
  get team(): any { return this.data?.team; }

  name = '';
  desc = '';
  members = signal<any[]>([]);

  addingMember = signal(false);
  addRole: 'member' | 'lead' = 'member';

  ngOnInit(): void {
    if (!this.isCreate) {
      this.name = this.team.name;
      this.desc = this.team.description ?? '';
      this.members.set(this.team.members ?? []);
    }
  }

  memberIds(): string[] {
    return this.members().map((m: any) => m.id);
  }

  onUserSelected(r: AutocompleteResult): void {
    this.api.post<any>(`/teams/${this.team.id}/members`, { userId: r.id, role: this.addRole })
      .subscribe((updated) => {
        this.members.set(updated.members ?? []);
      });
  }

  removeMember(userId: string): void {
    this.api.delete(`/teams/${this.team.id}/members/${userId}`).subscribe((updated: any) => {
      this.members.set(updated.members ?? []);
    });
  }

  submit(): void {
    const body = { name: this.name.trim(), description: this.desc.trim() || undefined };
    if (this.isCreate) {
      this.api.post<any>('/teams', body).subscribe((t) => this.dialogRef.close({ action: 'created', team: t }));
    } else {
      this.api.patch<any>(`/teams/${this.team.id}`, body)
        .subscribe((t) => this.dialogRef.close({ action: 'updated', team: { ...t, members: this.members() } }));
    }
  }

  deleteTeam(): void {
    this.api.delete(`/teams/${this.team.id}`).subscribe(() => this.dialogRef.close({ action: 'deleted', id: this.team.id }));
  }
}
