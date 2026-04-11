import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./admin-shell/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'users',
        loadComponent: () => import('./users/admin-users.component').then((m) => m.AdminUsersComponent),
      },
      {
        path: 'teams',
        loadComponent: () => import('./teams/admin-teams.component').then((m) => m.AdminTeamsComponent),
      },
      {
        path: 'flows',
        loadComponent: () => import('./flows/admin-flows.component').then((m) => m.AdminFlowsComponent),
      },
      {
        path: 'smtp',
        loadComponent: () => import('./smtp/admin-smtp.component').then((m) => m.AdminSmtpComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./settings/admin-settings.component').then((m) => m.AdminSettingsComponent),
      },
      {
        path: 'maintenance',
        loadComponent: () => import('./maintenance/admin-maintenance.component').then((m) => m.AdminMaintenanceComponent),
      },
    ],
  },
];
