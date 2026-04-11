import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export const PRIORITY_COLORS: Record<number, string> = {
  1: '#78909c',
  2: '#f57c00',
  3: '#d32f2f',
};

export const DEFAULT_PRIORITY_LABELS: Record<string, string> = {
  '1': 'Low', '2': 'Medium', '3': 'Urgent',
};

@Injectable({ providedIn: 'root' })
export class PriorityService {
  private api = inject(ApiService);

  labels = signal<Record<string, string>>({ ...DEFAULT_PRIORITY_LABELS });

  load(): void {
    this.api.get<Record<string, string>>('/settings/app').subscribe((cfg) => {
      if (cfg['priority_labels']) {
        try { this.labels.set(JSON.parse(cfg['priority_labels'])); } catch { /* keep defaults */ }
      }
    });
  }

  getLabel(priority: number): string {
    return this.labels()[String(priority)] ?? '';
  }

  getColor(priority: number): string {
    return PRIORITY_COLORS[priority] ?? '';
  }

  /** All non-None levels as ordered array */
  levels(): { value: number; label: string; color: string }[] {
    return [1, 2, 3].map((v) => ({
      value: v,
      label: this.getLabel(v),
      color: this.getColor(v),
    }));
  }
}
