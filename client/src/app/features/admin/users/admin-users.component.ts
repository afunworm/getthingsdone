import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h2>Users</h2>
      <div class="user-table">
        <div class="table-header">
          <span>User</span>
          <span>Role</span>
          <span></span>
        </div>
        @for (u of users(); track u.id) {
          <div class="table-row">
            <div class="user-cell">
              <div class="user-avatar">{{ u.name[0].toUpperCase() }}</div>
              <div>
                <div class="user-name">{{ u.name }}</div>
                <div class="user-email">{{ u.email }}</div>
              </div>
            </div>
            <div>
              <span class="role-badge" [class.admin]="u.role === 'admin'">{{ u.role }}</span>
            </div>
            <div class="actions-cell">
              @if (u.id !== me()?.id) {
                <div class="dropdown-wrap">
                  <button class="btn-icon" (click)="toggleMenu(u.id)">
                    <span class="material-icons" style="font-size:18px">more_vert</span>
                  </button>
                  @if (openMenu() === u.id) {
                    <div class="dropdown-menu">
                      @if (u.role !== 'admin') {
                        <button class="dropdown-item" (click)="setRole(u, 'admin'); openMenu.set(null)">Make admin</button>
                      } @else {
                        <button class="dropdown-item" (click)="setRole(u, 'user'); openMenu.set(null)">Remove admin</button>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; }
    h2 { margin: 0 0 14px; font-size: 17px; font-weight: 600; color: var(--text-primary); }

    .user-table { display: flex; flex-direction: column; border: 1px solid var(--surface-border); border-radius: 10px; overflow: hidden; }
    .table-header {
      display: grid; grid-template-columns: 1fr 100px 48px;
      padding: 8px 14px; background: var(--surface-hover);
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: .4px; color: var(--text-muted);
    }
    .table-row {
      display: grid; grid-template-columns: 1fr 100px 48px;
      align-items: center; padding: 8px 14px;
      border-top: 1px solid var(--surface-border);
      background: var(--surface-card);
    }
    .user-cell { display: flex; align-items: center; gap: 8px; }
    .user-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--accent-color); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 12px; flex-shrink: 0;
    }
    .user-name { font-size: 14px; font-weight: 500; color: var(--text-primary); }
    .user-email { font-size: 11px; color: var(--text-muted); }

    .role-badge {
      padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .3px;
      background: var(--surface-hover); color: var(--text-secondary);
      &.admin { background: color-mix(in srgb, var(--accent-color) 15%, transparent); color: var(--accent-color); }
    }

    .actions-cell { display: flex; justify-content: flex-end; }
    .dropdown-wrap { position: relative; }
    .dropdown-menu {
      position: absolute; right: 0; top: 100%; margin-top: 2px;
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 8px; box-shadow: var(--shadow-md); padding: 4px; z-index: 100; min-width: 140px;
    }
    .dropdown-item {
      display: block; width: 100%; padding: 6px 10px; border: 0;
      background: transparent; border-radius: 5px;
      font-family: inherit; font-size: 13px;
      color: var(--text-secondary); cursor: pointer; text-align: left;
      transition: background 120ms;
      &:hover { background: var(--surface-hover); }
    }
  `],
})
export class AdminUsersComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  users = signal<any[]>([]);
  me = this.auth.user;
  openMenu = signal<string | null>(null);

  ngOnInit(): void {
    this.api.get<any[]>('/users').subscribe((u) => this.users.set(u));
  }

  toggleMenu(id: string): void {
    this.openMenu.set(this.openMenu() === id ? null : id);
  }

  setRole(user: any, role: string): void {
    this.api.patch(`/users/${user.id}/role`, { role }).subscribe((updated: any) => {
      this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
    });
  }
}
