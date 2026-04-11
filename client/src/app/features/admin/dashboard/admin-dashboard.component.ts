import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h2>Dashboard</h2>
      @if (stats()) {
        <div class="stats-grid">
          @for (stat of statCards(); track stat.label) {
            <div class="stat-card">
              <span class="material-icons stat-icon" [style.color]="stat.color">{{ stat.icon }}</span>
              <div class="stat-value">{{ stat.value }}</div>
              <div class="stat-label">{{ stat.label }}</div>
            </div>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; }
    h2 { margin: 0 0 14px; font-size: 17px; font-weight: 600; color: var(--text-primary); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
    .stat-card {
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 10px; padding: 16px 14px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .stat-icon { font-size: 20px; }
    .stat-value { font-size: 22px; font-weight: 700; color: var(--text-primary); }
    .stat-label { font-size: 11px; color: var(--text-muted); }

  `],
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);
  stats = signal<any>(null);

  ngOnInit(): void {
    this.api.get<any>('/admin/stats').subscribe((s) => this.stats.set(s));
  }

  statCards() {
    const s = this.stats();
    if (!s) return [];
    return [
      { label: 'Users',    value: s.users,    icon: 'people',            color: '#3949ab' },
      { label: 'Projects', value: s.projects, icon: 'folder_open',       color: '#00897b' },
      { label: 'Teams',    value: s.teams,    icon: 'groups',            color: '#7b1fa2' },
      { label: 'Tasks',    value: s.todos,    icon: 'checklist',         color: '#f57c00' },
      { label: 'Flows',    value: s.flows,    icon: 'account_tree',      color: '#c62828' },
    ];
  }

}
