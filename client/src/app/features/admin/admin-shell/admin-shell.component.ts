import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <div class="sidebar-label">Admin</div>
        <nav class="admin-nav">
          @for (item of navItems; track item.path) {
            <a class="nav-item" [routerLink]="item.path" routerLinkActive="nav-active">
              <span class="material-icons nav-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
      </aside>
      <div class="admin-content">
        <router-outlet />
      </div>
    </div>
  `,
  styles: [`
    .admin-layout { display: flex; height: 100%; }
    .admin-sidebar {
      width: 176px; flex-shrink: 0;
      background: var(--surface-card);
      border-right: 1px solid var(--surface-border);
      padding: 12px 0;
    }
    .sidebar-label {
      padding: 0 16px 8px;
      font-size: 11px; font-weight: 700; letter-spacing: .5px;
      text-transform: uppercase; color: var(--text-muted);
    }
    .admin-nav { display: flex; flex-direction: column; }
    .nav-item {
      display: flex; align-items: center; gap: 7px;
      padding: 6px 10px; margin: 1px 6px; border-radius: 6px;
      text-decoration: none; font-size: 14px; font-weight: 450;
      color: var(--text-secondary); transition: background 120ms, color 120ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.nav-active {
        background: color-mix(in srgb, var(--accent-color) 13%, transparent);
        color: var(--accent-color); font-weight: 500;
        .nav-icon { color: var(--accent-color); opacity: 1; }
      }
    }
    .nav-icon { font-size: 16px; width: 16px; height: 16px; flex-shrink: 0; opacity: .7; }
    .admin-content { flex: 1; overflow-y: auto; }
  `],
})
export class AdminShellComponent {
  navItems = [
    { path: 'dashboard', icon: 'dashboard',           label: 'Dashboard' },
    { path: 'users',     icon: 'people',              label: 'Users'     },
    { path: 'teams',     icon: 'groups',              label: 'Teams'     },
    { path: 'flows',     icon: 'account_tree',        label: 'Flows'     },
    { path: 'smtp',      icon: 'email',               label: 'SMTP'      },
    { path: 'settings',     icon: 'tune',                label: 'Settings'     },
    { path: 'maintenance',  icon: 'build',               label: 'Maintenance'  },
  ];
}
