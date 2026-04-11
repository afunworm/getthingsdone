import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  getSmtpConfig() {
    const config = this.db.prepare('SELECT * FROM smtp_config WHERE id = 1').get() as any;
    if (!config) return null;
    const { password, ...safe } = config;
    return { ...safe, hasPassword: !!password };
  }

  updateSmtpConfig(dto: {
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
    fromAddress?: string;
    fromName?: string;
  }) {
    this.db.prepare(`
      UPDATE smtp_config SET
        host = COALESCE(?, host),
        port = COALESCE(?, port),
        secure = COALESCE(?, secure),
        username = COALESCE(?, username),
        password = COALESCE(?, password),
        from_address = COALESCE(?, from_address),
        from_name = COALESCE(?, from_name),
        updated_at = unixepoch()
      WHERE id = 1
    `).run(
      dto.host ?? null,
      dto.port ?? null,
      dto.secure !== undefined ? (dto.secure ? 1 : 0) : null,
      dto.username ?? null,
      dto.password ?? null,
      dto.fromAddress ?? null,
      dto.fromName ?? null,
    );
    return this.getSmtpConfig();
  }

  getAppSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  updateAppSetting(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch())
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()
    `).run(key, value);
  }

  applyDefaultTimezoneToAll(): { updated: number } {
    const tz = (this.db.prepare(
      "SELECT value FROM app_settings WHERE key = 'default_timezone'",
    ).get() as any)?.value ?? 'UTC';
    const result = this.db.prepare(
      'UPDATE users SET timezone = ?, updated_at = unixepoch()',
    ).run(tz);
    return { updated: result.changes };
  }

  // ── API Tokens ────────────────────────────────────────

  listTokens() {
    return this.db.prepare(`
      SELECT t.id, t.name, t.expires_at, t.created_at, t.last_used_at,
             u.name AS created_by_name
      FROM api_tokens t
      JOIN users u ON u.id = t.created_by
      ORDER BY t.created_at DESC
    `).all();
  }

  createToken(dto: { name: string; expiresAt?: number | null }, createdBy: string) {
    const raw = 'ft_' + randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(raw).digest('hex');
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO api_tokens (id, name, token_hash, created_by, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, dto.name, hash, createdBy, dto.expiresAt ?? null);
    const record = this.db.prepare(`
      SELECT t.id, t.name, t.expires_at, t.created_at, t.last_used_at,
             u.name AS created_by_name
      FROM api_tokens t JOIN users u ON u.id = t.created_by
      WHERE t.id = ?
    `).get(id);
    // Return the raw token only once
    return { ...record as object, token: raw };
  }

  revokeToken(id: string) {
    this.db.prepare('DELETE FROM api_tokens WHERE id = ?').run(id);
  }

  clearOverdueNotified() {
    this.db.prepare(
      "DELETE FROM user_settings WHERE key = 'overdue_notified_date'",
    ).run();
  }

  getStats() {
    return {
      users: (this.db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c,
      projects: (this.db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c,
      teams: (this.db.prepare('SELECT COUNT(*) as c FROM teams').get() as any).c,
      todos: (this.db.prepare('SELECT COUNT(*) as c FROM todos WHERE is_inbox = 0').get() as any).c,
      flows: (this.db.prepare('SELECT COUNT(*) as c FROM flow_templates').get() as any).c,
    };
  }
}
