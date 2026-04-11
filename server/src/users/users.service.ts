import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  findAll() {
    return this.db
      .prepare(
        'SELECT id, email, name, role, avatar_url, created_at FROM users ORDER BY name',
      )
      .all();
  }

  findById(id: string) {
    const user = this.db
      .prepare(
        'SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = ?',
      )
      .get(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  updateRole(id: string, role: 'admin' | 'user') {
    const result = this.db
      .prepare(
        'UPDATE users SET role = ?, updated_at = unixepoch() WHERE id = ?',
      )
      .run(role, id);
    if (result.changes === 0) throw new NotFoundException('User not found');
    return this.findById(id);
  }

  updateTimezone(id: string, timezone: string) {
    const result = this.db
      .prepare(
        'UPDATE users SET timezone = ?, updated_at = unixepoch() WHERE id = ?',
      )
      .run(timezone, id);
    if (result.changes === 0) throw new NotFoundException('User not found');
    return this.db
      .prepare(
        'SELECT id, email, name, role, avatar_url, timezone, overdue_reminder_time, created_at FROM users WHERE id = ?',
      )
      .get(id);
  }

  updateOverdueReminderTime(id: string, time: string) {
    const result = this.db
      .prepare(
        'UPDATE users SET overdue_reminder_time = ?, updated_at = unixepoch() WHERE id = ?',
      )
      .run(time, id);
    if (result.changes === 0) throw new NotFoundException('User not found');
    return this.db
      .prepare(
        'SELECT id, email, name, role, avatar_url, timezone, overdue_reminder_time, created_at FROM users WHERE id = ?',
      )
      .get(id);
  }

  getMe(id: string) {
    return this.db
      .prepare(
        'SELECT id, email, name, role, avatar_url, timezone, overdue_reminder_time, onboarding_completed_at, created_at FROM users WHERE id = ?',
      )
      .get(id);
  }

  completeOnboarding(id: string) {
    this.db
      .prepare(
        'UPDATE users SET onboarding_completed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?',
      )
      .run(id);
    return this.getMe(id);
  }

  deleteTourDemoTasks(userId: string): void {
    this.db
      .prepare(
        `DELETE FROM todos WHERE is_tour_demo = 1 AND inbox_user_id = ? AND parent_todo_id IS NULL`,
      )
      .run(userId);
  }

  createTourDemoTasks(userId: string): { task1Id: string; task2Id: string } {
    const { v4: uuidv4 } = require('uuid');

    // Remove any previous demo tasks (subtasks + comments cascade automatically)
    this.db
      .prepare(
        `DELETE FROM todos WHERE is_tour_demo = 1 AND inbox_user_id = ? AND parent_todo_id IS NULL`,
      )
      .run(userId);

    // ── Task 1: Urgent priority, due tomorrow, subtasks, self-assigned ──────
    const task1Id = uuidv4();
    const tomorrow = Math.floor(Date.now() / 1000) + 86400;
    this.db
      .prepare(
        `
      INSERT INTO todos
        (id, title, description, due_date, priority, is_inbox, inbox_user_id, created_by, sort_order, is_tour_demo)
      VALUES (?, ?, ?, ?, 3, 1, ?, ?, 0, 1)
    `,
      )
      .run(
        task1Id,
        'Demo Task: Review Q2 marketing proposal',
        'The marketing team submitted a proposal for the upcoming campaign. Please review the budget, timeline, and deliverables before the stakeholder meeting on Friday.',
        tomorrow,
        userId,
        userId,
      );

    // Self-assign task 1
    this.db
      .prepare('INSERT INTO todo_assignees (todo_id, user_id) VALUES (?, ?)')
      .run(task1Id, userId);

    // Subtasks for task 1
    const sub1Id = uuidv4();
    const sub2Id = uuidv4();
    this.db
      .prepare(
        `
      INSERT INTO todos (id, title, parent_todo_id, is_inbox, inbox_user_id, created_by, sort_order, is_tour_demo)
      VALUES (?, ?, ?, 1, ?, ?, 0, 1)
    `,
      )
      .run(sub1Id, 'Check budget allocation', task1Id, userId, userId);
    this.db
      .prepare(
        `
      INSERT INTO todos (id, title, parent_todo_id, is_inbox, inbox_user_id, created_by, sort_order, is_tour_demo)
      VALUES (?, ?, ?, 1, ?, ?, 1, 1)
    `,
      )
      .run(
        sub2Id,
        'Confirm delivery timeline with vendor',
        task1Id,
        userId,
        userId,
      );

    // ── Task 2: No priority, with comments ──────────────────────────────────
    const task2Id = uuidv4();
    this.db
      .prepare(
        `
      INSERT INTO todos
        (id, title, description, priority, is_inbox, inbox_user_id, created_by, sort_order, is_tour_demo)
      VALUES (?, ?, ?, 0, 1, ?, ?, 1, 1)
    `,
      )
      .run(
        task2Id,
        'Demo Task: Weekly team sync - notes & action items',
        "Catch-up from this week's standup. Covers roadmap progress, blockers, and next sprint priorities.",
        userId,
        userId,
      );

    // Comments on task 2
    const c1Id = uuidv4();
    const c2Id = uuidv4();
    this.db
      .prepare(
        'INSERT INTO comments (id, todo_id, user_id, body) VALUES (?, ?, ?, ?)',
      )
      .run(
        c1Id,
        task2Id,
        userId,
        'Great progress this week! The new feature shipped smoothly. 🎉',
      );
    this.db
      .prepare(
        'INSERT INTO comments (id, todo_id, user_id, body) VALUES (?, ?, ?, ?)',
      )
      .run(
        c2Id,
        task2Id,
        userId,
        'Reminder: update the public roadmap before end of week.',
      );

    return { task1Id, task2Id };
  }
}
