import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private api   = inject(ApiService);
  private cache = signal<Record<string, string>>({});
  loaded        = signal(false);

  load(): void {
    this.api.get<Record<string, string>>('/settings').subscribe((s) => {
      this.cache.set(s);
      this.loaded.set(true);
    });
  }

  get(key: string): string | null {
    return this.cache()[key] ?? null;
  }

  set(key: string, value: string): void {
    // Write-through: update cache immediately, persist in background
    this.cache.update((c) => ({ ...c, [key]: value }));
    this.api.patch('/settings', { key, value }).subscribe();
  }
}
