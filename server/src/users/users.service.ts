import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  findAll() {
    return this.db.prepare('SELECT id, email, name, role, avatar_url, created_at FROM users ORDER BY name').all();
  }

  findById(id: string) {
    const user = this.db.prepare(
      'SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = ?',
    ).get(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  updateRole(id: string, role: 'admin' | 'user') {
    const result = this.db.prepare(
      'UPDATE users SET role = ?, updated_at = unixepoch() WHERE id = ?',
    ).run(role, id);
    if (result.changes === 0) throw new NotFoundException('User not found');
    return this.findById(id);
  }

  updateTimezone(id: string, timezone: string) {
    const result = this.db.prepare(
      'UPDATE users SET timezone = ?, updated_at = unixepoch() WHERE id = ?',
    ).run(timezone, id);
    if (result.changes === 0) throw new NotFoundException('User not found');
    return this.db.prepare('SELECT id, email, name, role, avatar_url, timezone, overdue_reminder_time, created_at FROM users WHERE id = ?').get(id);
  }

  updateOverdueReminderTime(id: string, time: string) {
    const result = this.db.prepare(
      'UPDATE users SET overdue_reminder_time = ?, updated_at = unixepoch() WHERE id = ?',
    ).run(time, id);
    if (result.changes === 0) throw new NotFoundException('User not found');
    return this.db.prepare('SELECT id, email, name, role, avatar_url, timezone, overdue_reminder_time, created_at FROM users WHERE id = ?').get(id);
  }

  getMe(id: string) {
    return this.db.prepare(
      'SELECT id, email, name, role, avatar_url, timezone, overdue_reminder_time, created_at FROM users WHERE id = ?',
    ).get(id);
  }
}
