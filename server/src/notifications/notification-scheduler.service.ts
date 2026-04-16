import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly log = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every minute — fire any pending custom reminders. */
  @Cron('0 * * * * *')
  public handleScheduled() {
    this.checkCustomReminders();
  }

  private checkCustomReminders(): void {
    const now = Math.floor(Date.now() / 1000);
    const due = this.db.prepare(`
      SELECT r.*, t.title, t.project_id, t.is_inbox, t.inbox_user_id
      FROM todo_reminders r
      JOIN todos t ON t.id = r.todo_id
      WHERE r.remind_at <= ? AND r.sent = 0
    `).all(now) as any[];

    for (const r of due) {
      const link = r.project_id ? `/projects/${r.project_id}` : '/inbox';
      const label = r.label && r.label !== '__auto_due__' ? ` (${r.label})` : '';
      this.notifications.create(r.user_id, {
        type: 'task_reminder',
        title: `Reminder: ${r.title}`,
        body: `You asked to be reminded about this task${label}.`,
        link,
        todoId: r.todo_id,
        projectId: r.project_id ?? undefined,
      }, !r.notify_email);
      this.db.prepare('UPDATE todo_reminders SET sent = 1 WHERE id = ?').run(r.id);
      this.log.debug(`Custom reminder sent: ${r.id}`);
    }
  }
}
