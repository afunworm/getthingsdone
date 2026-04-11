import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/services/api.service';
import { TeamDialogComponent } from './team-dialog.component';

@Component({
  selector: 'app-admin-teams',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>Teams</h2>
        <button class="btn btn-primary" (click)="openCreate()">
          <span class="material-icons" style="font-size:16px">add</span>
          New Team
        </button>
      </div>

      <div class="teams-grid">
        @for (team of teams(); track team.id) {
          <div class="team-card">
            <div class="team-header">
              <div class="team-icon">{{ team.name[0].toUpperCase() }}</div>
              <div class="team-info">
                <div class="team-name">{{ team.name }}</div>
                <div class="team-count">{{ team.member_count }} member{{ team.member_count !== 1 ? 's' : '' }}</div>
              </div>
              <div class="team-actions">
                <button class="btn-icon" (click)="openEdit(team)" title="Edit">
                  <span class="material-icons" style="font-size:15px">edit</span>
                </button>
              </div>
            </div>
            @if (team.description) {
              <p class="team-desc">{{ team.description }}</p>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    h2 { margin: 0; font-size: 17px; font-weight: 600; color: var(--text-primary); }

    .teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
    .team-card {
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 10px; padding: 14px 16px;
      display: flex; flex-direction: column; gap: 8px;
      cursor: pointer; transition: border-color 120ms, box-shadow 120ms;
      &:hover { border-color: var(--accent-color); box-shadow: var(--shadow-sm); }
    }
    .team-header { display: flex; align-items: center; gap: 10px; }
    .team-icon {
      width: 34px; height: 34px; background: #7b1fa2; color: #fff; flex-shrink: 0;
      border-radius: 6px; display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 14px;
    }
    .team-info { flex: 1; min-width: 0; }
    .team-name { font-weight: 600; font-size: 14px; color: var(--text-primary); }
    .team-count { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
    .team-actions { flex-shrink: 0; }
    .team-desc { margin: 0; font-size: 12px; color: var(--text-secondary); }
  `],
})
export class AdminTeamsComponent implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(Dialog);

  teams = signal<any[]>([]);

  ngOnInit(): void {
    this.api.get<any[]>('/teams').subscribe((t) => this.teams.set(t));
  }

  openCreate(): void {
    const ref = this.dialog.open(TeamDialogComponent, {
      width: '480px', maxHeight: '90vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: {},
    });
    ref.closed.subscribe((result: any) => {
      if (result?.action === 'created') {
        this.teams.update((list) => [...list, result.team]);
      }
    });
  }

  openEdit(team: any): void {
    // Fetch full team with members
    this.api.get<any>(`/teams/${team.id}`).subscribe((full) => {
      const ref = this.dialog.open(TeamDialogComponent, {
        width: '480px', maxHeight: '90vh', hasBackdrop: true,
        backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
        data: { team: full },
      });
      ref.closed.subscribe((result: any) => {
        if (result?.action === 'updated') {
          this.teams.update((list) => list.map((t) =>
            t.id === result.team.id ? { ...t, ...result.team, member_count: result.team.members?.length ?? t.member_count } : t
          ));
        } else if (result?.action === 'deleted') {
          this.teams.update((list) => list.filter((t) => t.id !== result.id));
        }
      });
    });
  }
}
