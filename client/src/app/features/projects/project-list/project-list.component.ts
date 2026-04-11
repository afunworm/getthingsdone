import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/services/api.service';
import { InboxStoreService } from '../../../core/services/inbox-store.service';
import { NewProjectDialogComponent } from '../new-project-dialog/new-project-dialog.component';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="header-left">
          <span class="material-icons" style="font-size:20px;color:var(--accent-color)">folder_open</span>
          <div>
            <h1>Inboxes</h1>
            <p>{{ projects().length }} inbox{{ projects().length !== 1 ? 'es' : '' }}</p>
          </div>
        </div>
        <button class="btn btn-primary" (click)="openCreate()">
          <span class="material-icons" style="font-size:16px">add</span>
          New Inbox
        </button>
      </div>

      @if (loading()) {
        <div class="project-grid">
          @for (_ of [1,2,3]; track $index) {
            <div class="skeleton-card"></div>
          }
        </div>
      } @else if (projects().length === 0) {
        <div class="empty-state">
          <span class="material-icons" style="font-size:36px">folder_open</span>
          <h3>No inboxes yet</h3>
          <p>Create your first shared inbox to get started</p>
          <button class="btn btn-primary" (click)="openCreate()">Create Inbox</button>
        </div>
      } @else {
        <div class="project-grid">
          @for (p of projects(); track p.id) {
            <div class="project-card-wrap">
              <a class="project-card" [routerLink]="['/projects', p.id]">
                <div class="card-header">
                  <div class="project-icon" [style.background]="p.color || 'var(--accent-color)'">
                    {{ p.emoji || p.name[0].toUpperCase() }}
                  </div>
                  <div class="project-info">
                    <h3>{{ p.name }}</h3>
                    @if (p.description) {
                      <p class="truncate">{{ p.description }}</p>
                    }
                  </div>
                </div>

                <div class="card-meta">
                  <span class="meta-chip">
                    <span class="material-icons" style="font-size:12px">check_box</span>
                    {{ p.todo_count }} tasks
                  </span>
                  <span class="meta-chip">
                    <span class="material-icons" style="font-size:12px">group</span>
                    {{ memberSummary(p) }}
                  </span>
                  @if (p.due_date) {
                    <span class="meta-chip" [class.overdue]="p.due_date * 1000 < now">
                      <span class="material-icons" style="font-size:12px">event</span>
                      {{ p.due_date * 1000 | date:'MMM d' }}
                    </span>
                  }
                </div>

                <div class="flow-dots">
                  @for (step of p.flow_steps; track $index) {
                    <span class="flow-dot" [style.background]="$index === 0 ? (p.color || 'var(--accent-color)') : undefined"></span>
                  }
                </div>
              </a>
              <button class="edit-btn" (click)="openEdit(p)" title="Edit inbox">
                <span class="material-icons" style="font-size:14px">edit</span>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .header-left { display: flex; align-items: center; gap: 10px; }
    h1 { margin: 0 0 1px; font-size: 17px; font-weight: 600; color: var(--text-primary); }
    .header-left p { margin: 0; font-size: 11px; color: var(--text-muted); }

    .project-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 10px;
    }
    .project-card-wrap { position: relative; }
    .edit-btn {
      position: absolute; top: 8px; right: 8px;
      display: none; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 5px; border: 0;
      background: var(--surface-hover); color: var(--text-muted);
      cursor: pointer; transition: background 120ms, color 120ms;
      &:hover { background: var(--accent-color); color: #fff; }
    }
    .project-card-wrap:hover .edit-btn { display: flex; }
    .project-card {
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 10px; padding: 14px 16px;
      text-decoration: none; color: inherit;
      display: flex; flex-direction: column; gap: 10px;
      transition: border-color 120ms, transform 120ms, box-shadow 120ms;
      &:hover { border-color: var(--accent-color); transform: translateY(-1px); box-shadow: var(--shadow-md); }
    }
    .card-header { display: flex; gap: 10px; align-items: center; }
    .project-icon {
      width: 32px; height: 32px; flex-shrink: 0;
      color: #fff; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 16px;
    }
    .project-info { flex: 1; min-width: 0;
      h3 { margin: 0 0 1px; font-size: 14px; font-weight: 600; }
      p { margin: 0; font-size: 11px; color: var(--text-muted); }
    }
    .card-meta { display: flex; gap: 10px; }
    .meta-chip { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--text-muted);
      &.overdue { color: #d32f2f; }
    }
    .flow-dots { display: flex; gap: 4px; align-items: center; }
    .flow-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--surface-border);
      &.active { background: var(--accent-color); }
    }
    .skeleton-card {
      height: 120px; background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 10px; animation: pulse 1.5s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 56px 24px; text-align: center; color: var(--text-secondary);
      h3 { margin: 0; font-size: 15px; font-weight: 600; }
      p { margin: 0; font-size: 12px; color: var(--text-muted); }
    }
  `],
})
export class ProjectListComponent implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(Dialog);
  private store = inject(InboxStoreService);

  projects = signal<any[]>([]);
  loading = signal(true);
  now = Date.now();

  ngOnInit(): void {
    this.api.get<any[]>('/projects').subscribe({
      next: (p) => { this.projects.set(p); this.store.set(p); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  memberSummary(p: any): string {
    const u = p.user_count ?? 1;
    const t = p.team_count ?? 0;
    const parts: string[] = [];
    if (u > 0) parts.push(`${u} user${u !== 1 ? 's' : ''}`);
    if (t > 0) parts.push(`${t} team${t !== 1 ? 's' : ''}`);
    return parts.join(', ') || '1 user';
  }

  openCreate(): void {
    const ref = this.dialog.open(NewProjectDialogComponent, {
      width: '500px', maxHeight: '90vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: {},
    });
    ref.closed.subscribe((project: any) => {
      if (project && project !== 'deleted') {
        this.projects.update((list) => [project, ...list]);
        this.store.add(project);
      }
    });
  }

  openEdit(project: any): void {
    // Fetch full project details (includes members)
    this.api.get<any>(`/projects/${project.id}`).subscribe((full) => {
      const ref = this.dialog.open(NewProjectDialogComponent, {
        width: '500px', maxHeight: '90vh', hasBackdrop: true,
        backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
        data: { project: full },
      });
      ref.closed.subscribe((result: any) => {
        if (result === 'deleted') {
          this.projects.update((list) => list.filter((p) => p.id !== project.id));
          this.store.remove(project.id);
        } else if (result) {
          this.projects.update((list) => list.map((p) => p.id === result.id ? { ...p, ...result } : p));
          this.store.update(result);
        }
      });
    });
  }
}
