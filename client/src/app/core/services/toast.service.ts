import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'ok' | 'error' | 'notification';
  body?: string;
  link?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _id = 0;
  toasts = signal<Toast[]>([]);

  show(message: string, type: 'ok' | 'error' = 'ok', duration = 3000): void {
    const id = ++this._id;
    this.toasts.update((t) => [...t, { id, message, type }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  showNotification(title: string, body: string, link?: string, duration = 5000): void {
    const id = ++this._id;
    this.toasts.update((t) => [...t, { id, message: title, type: 'notification', body, link }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
