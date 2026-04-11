import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-callback',
  standalone: true,
  template: `
    <div class="callback-page">
      <div class="spinner"></div>
      <p>Signing you in...</p>
    </div>
  `,
  styles: [`
    .callback-page {
      min-height: 100vh;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 18px;
      background: var(--surface-bg); color: var(--text-secondary);
      font-size: 13px;
    }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid var(--surface-border);
      border-top-color: var(--accent-color);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class CallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.auth.handleCallback(token);
    } else {
      this.auth.logout();
    }
  }
}
