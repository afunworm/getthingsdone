import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SettingsService {
  constructor(private readonly db: DatabaseService) {}

  getAll(userId: string): Record<string, string> {
    const rows = this.db.prepare(
      'SELECT key, value FROM user_settings WHERE user_id = ?',
    ).all(userId) as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  getAppConfig(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  upsert(userId: string, key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO user_settings (user_id, key, value, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()
    `).run(userId, key, value);
  }
}
