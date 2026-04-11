import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">
          <div class="logo-mark">✓</div>
          <h1>Get Things Done</h1>
          <p class="logo-by">by bryan</p>
          <p>Team task management with clear flow</p>
        </div>

        <button class="btn btn-primary login-btn" (click)="auth.login()">
          <span class="material-icons" style="font-size:18px">login</span>
          Sign in with PocketID
        </button>

        <p class="login-hint">You'll be redirected to your organization's login page</p>
      </div>

    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface-bg); position: relative;
    }
    .login-card {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 16px; padding: 48px 40px;
      text-align: center; width: 360px;
      box-shadow: var(--shadow-md);
    }
    .login-logo {
      margin-bottom: 32px;
      .logo-mark {
        width: 56px; height: 56px;
        background: var(--accent-color); color: #fff;
        border-radius: 14px;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 26px; font-weight: 700; margin-bottom: 14px;
      }
      h1 { margin: 0 0 2px; font-size: 24px; font-weight: 700; letter-spacing: -.4px; color: var(--text-primary); }
      .logo-by { margin: 0 0 8px; font-size: 11px; color: var(--text-muted); }
      p { margin: 0; color: var(--text-secondary); font-size: 13px; }
    }
    .login-btn {
      width: 100%; height: 42px; font-size: 14px;
      justify-content: center; border-radius: 8px;
    }
    .login-hint { margin: 14px 0 0; font-size: 11px; color: var(--text-muted); }
  `],
})
export class LoginComponent {
  auth = inject(AuthService);
}
