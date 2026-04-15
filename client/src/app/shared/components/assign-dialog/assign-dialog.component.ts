import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/services/api.service';
import { forkJoin } from 'rxjs';

export interface Assignees {
  users: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}

@Component({
  selector: 'app-assign-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dialog-card">
      <div class="dialog-header">
        <span class="dialog-title">Assign Task</span>
        <button class="btn-icon" (click)="cancel()">
          <span class="material-icons" style="font-size:16px">close</span>
        </button>
      </div>

      <div class="search-bar">
        <span class="material-icons search-icon">search</span>
        <input
          class="search-input"
          [(ngModel)]="search"
          placeholder="Search people or departments..."
          autocomplete="off"
        />
      </div>

      @if (!loaded()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else {
        <div class="columns">
          <!-- Users column -->
          <div class="col">
            <div class="col-header">
              <span class="material-icons" style="font-size:14px">person</span>
              Users
            </div>
            <div class="col-list">
              @for (u of filteredUsers(); track u.id) {
                <button
                  class="assign-row"
                  [class.selected]="isUserAssigned(u.id)"
                  (click)="toggleUser(u)"
                >
                  <span class="avatar user-avatar">{{ u.name[0].toUpperCase() }}</span>
                  <div class="row-info">
                    <span class="row-name">{{ u.name }}</span>
                    @if (u.email) { <span class="row-sub">{{ u.email }}</span> }
                  </div>
                  <span class="check material-icons">
                    {{ isUserAssigned(u.id) ? 'check_box' : 'check_box_outline_blank' }}
                  </span>
                </button>
              }
              @if (filteredUsers().length === 0) {
                <div class="empty-col">No users found</div>
              }
            </div>
          </div>

          <!-- Departments column -->
          <div class="col">
            <div class="col-header">
              <span class="material-icons" style="font-size:14px">groups</span>
              Departments
            </div>
            <div class="col-list">
              @for (t of filteredTeams(); track t.id) {
                <button
                  class="assign-row"
                  [class.selected]="isTeamAssigned(t.id)"
                  (click)="toggleTeam(t)"
                >
                  <span class="avatar team-avatar">{{ t.name[0].toUpperCase() }}</span>
                  <span class="row-name" style="flex:1">{{ t.name }}</span>
                  <span class="check material-icons">
                    {{ isTeamAssigned(t.id) ? 'check_box' : 'check_box_outline_blank' }}
                  </span>
                </button>
              }
              @if (filteredTeams().length === 0) {
                <div class="empty-col">No departments found</div>
              }
            </div>
          </div>
        </div>

        <!-- Selected summary -->
        @if (totalAssigned > 0) {
          <div class="summary">
            <span class="summary-label">Assigned:</span>
            <div class="summary-chips">
              @for (u of draft().users; track u.id) {
                <span class="chip user-chip">
                  {{ u.name.split(' ')[0] }}
                  <button class="chip-remove" (click)="toggleUser(u)">
                    <span class="material-icons" style="font-size:11px">close</span>
                  </button>
                </span>
              }
              @for (t of draft().teams; track t.id) {
                <span class="chip team-chip">
                  {{ t.name }}
                  <button class="chip-remove" (click)="toggleTeam(t)">
                    <span class="material-icons" style="font-size:11px">close</span>
                  </button>
                </span>
              }
            </div>
          </div>
        }
      }

      <div class="dialog-footer">
        <button class="btn btn-ghost" (click)="cancel()">Cancel</button>
        <button class="btn btn-primary" [disabled]="saving()" (click)="done()">
          {{ saving() ? 'Saving…' : 'Done' }}
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
      padding: 14px 16px 10px; border-bottom: 1px solid var(--surface-border);
    }
    .dialog-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }

    .search-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; border-bottom: 1px solid var(--surface-border);
    }
    .search-icon { font-size: 18px; color: var(--text-muted); flex-shrink: 0; }
    .search-input {
      flex: 1; border: 0; background: transparent; outline: none;
      font-family: inherit; font-size: 14px; color: var(--text-primary);
      &::placeholder { color: var(--text-muted); }
    }

    .columns {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 0; flex: 1; overflow: hidden;
    }
    .col {
      display: flex; flex-direction: column; overflow: hidden;
      &:first-child { border-right: 1px solid var(--surface-border); }
    }
    .col-header {
      display: flex; align-items: center; gap: 5px;
      padding: 8px 12px 6px; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .4px; color: var(--text-muted);
      flex-shrink: 0;
    }
    .col-list { overflow-y: auto; flex: 1; padding: 4px; }

    .assign-row {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 6px 8px; border: 0; border-radius: 6px;
      background: transparent; cursor: pointer; text-align: left;
      transition: background 80ms;
      &:hover { background: var(--surface-hover); }
      &.selected { background: color-mix(in srgb, var(--accent-color) 8%, transparent); }
    }
    .avatar {
      width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 600;
    }
    .user-avatar { background: var(--accent-color); }
    .team-avatar { background: #7b1fa2; }
    .row-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .row-name { font-size: 13px; color: var(--text-primary); }
    .row-sub  { font-size: 11px; color: var(--text-muted); }
    .check { font-size: 18px !important; color: var(--accent-color); flex-shrink: 0; }
    .empty-col { padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center; }

    .summary {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 8px 14px; border-top: 1px solid var(--surface-border);
      font-size: 12px; color: var(--text-muted);
    }
    .summary-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 6px 2px 8px; border-radius: 20px;
      font-size: 11px; font-weight: 500;
    }
    .user-chip { background: color-mix(in srgb, var(--accent-color) 15%, transparent); color: var(--accent-color); }
    .team-chip { background: color-mix(in srgb, #7b1fa2 15%, transparent); color: #7b1fa2; }
    .chip-remove {
      display: inline-flex; align-items: center; justify-content: center;
      border: 0; background: transparent; cursor: pointer; padding: 0;
      color: inherit; opacity: .7; &:hover { opacity: 1; }
    }

    .dialog-footer {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 10px 16px 14px; border-top: 1px solid var(--surface-border);
    }

    .loading { display: flex; justify-content: center; padding: 32px; }
    .spinner {
      width: 28px; height: 28px;
      border: 3px solid var(--surface-border); border-top-color: var(--accent-color);
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class AssignDialogComponent implements OnInit {
  dialogRef = inject(DialogRef<Assignees | undefined>);
  data: { todoId: string | null; assignees: Assignees; projectId?: string | null } = inject(DIALOG_DATA);
  private api = inject(ApiService);

  search = '';
  allUsers = signal<any[]>([]);
  allTeams = signal<any[]>([]);
  /** Local draft — not persisted until Done is clicked */
  draft   = signal<Assignees>({ users: [], teams: [] });
  loaded  = signal(false);
  saving  = signal(false);

  /** Snapshot of what was already saved — used to compute the diff on Done */
  private original: Assignees = { users: [], teams: [] };

  ngOnInit(): void {
    const saved = this.data.assignees ?? { users: [], teams: [] };
    this.original = { users: [...saved.users], teams: [...saved.teams] };
    this.draft.set({ users: [...saved.users], teams: [...saved.teams] });
    const pid = this.data.projectId;
    const usersUrl = pid ? `/projects/${pid}/users` : '/users';
    const teamsUrl = pid ? `/projects/${pid}/teams` : '/teams';
    this.api.get<any[]>(usersUrl).subscribe((u) => this.allUsers.set(u));
    this.api.get<any[]>(teamsUrl).subscribe((t) => { this.allTeams.set(t); this.loaded.set(true); });
  }

  filteredUsers(): any[] {
    const q = this.search.toLowerCase().trim();
    return q ? this.allUsers().filter((u) =>
      u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)) : this.allUsers();
  }

  filteredTeams(): any[] {
    const q = this.search.toLowerCase().trim();
    return q ? this.allTeams().filter((t) => t.name.toLowerCase().includes(q)) : this.allTeams();
  }

  isUserAssigned(userId: string): boolean {
    return this.draft().users.some((u) => u.id === userId);
  }

  isTeamAssigned(teamId: string): boolean {
    return this.draft().teams.some((t) => t.id === teamId);
  }

  get totalAssigned(): number {
    const d = this.draft();
    return d.users.length + d.teams.length;
  }

  toggleUser(user: any): void {
    this.draft.update((d) => {
      const exists = d.users.some((u) => u.id === user.id);
      return {
        ...d,
        users: exists
          ? d.users.filter((u) => u.id !== user.id)
          : [...d.users, { id: user.id, name: user.name }],
      };
    });
  }

  toggleTeam(team: any): void {
    this.draft.update((d) => {
      const exists = d.teams.some((t) => t.id === team.id);
      return {
        ...d,
        teams: exists
          ? d.teams.filter((t) => t.id !== team.id)
          : [...d.teams, { id: team.id, name: team.name }],
      };
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  done(): void {
    // No todoId means caller just wants the selection — no API calls needed
    if (!this.data.todoId) {
      this.dialogRef.close(this.draft());
      return;
    }

    const { adds, removes } = this.diff();
    if (adds.length === 0 && removes.length === 0) {
      this.dialogRef.close(this.draft());
      return;
    }

    this.saving.set(true);
    const calls = [
      ...removes.map((r) =>
        r.type === 'user'
          ? this.api.delete<any>(`/todos/${this.data.todoId}/assignees/users/${r.id}`)
          : this.api.delete<any>(`/todos/${this.data.todoId}/assignees/teams/${r.id}`),
      ),
      ...adds.map((a) =>
        a.type === 'user'
          ? this.api.post<any>(`/todos/${this.data.todoId}/assignees`, { userId: a.id })
          : this.api.post<any>(`/todos/${this.data.todoId}/assignees`, { teamId: a.id }),
      ),
    ];

    forkJoin(calls).subscribe({
      next: (results) => {
        const last = results[results.length - 1] as any;
        this.saving.set(false);
        this.dialogRef.close(last?.assignees ?? this.draft());
      },
      error: () => {
        this.saving.set(false);
        this.dialogRef.close(this.draft());
      },
    });
  }

  private diff(): {
    adds:    { type: 'user' | 'team'; id: string }[];
    removes: { type: 'user' | 'team'; id: string }[];
  } {
    const d = this.draft();
    const o = this.original;

    const adds: { type: 'user' | 'team'; id: string }[] = [
      ...d.users.filter((u) => !o.users.some((x) => x.id === u.id)).map((u) => ({ type: 'user' as const, id: u.id })),
      ...d.teams.filter((t) => !o.teams.some((x) => x.id === t.id)).map((t) => ({ type: 'team' as const, id: t.id })),
    ];
    const removes: { type: 'user' | 'team'; id: string }[] = [
      ...o.users.filter((u) => !d.users.some((x) => x.id === u.id)).map((u) => ({ type: 'user' as const, id: u.id })),
      ...o.teams.filter((t) => !d.teams.some((x) => x.id === t.id)).map((t) => ({ type: 'team' as const, id: t.id })),
    ];

    return { adds, removes };
  }
}
