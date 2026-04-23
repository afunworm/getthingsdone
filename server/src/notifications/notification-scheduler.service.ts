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
      // Mark sent FIRST — prevents re-firing even if notification delivery fails.
      this.db.prepare('UPDATE todo_reminders SET sent = 1 WHERE id = ?').run(r.id);

      const link = r.project_id ? `/projects/${r.project_id}` : '/inbox';
      const label = r.label && r.label !== '__auto_due__' ? ` (${r.label})` : '';

      // Collect all recipients: reminder creator + all assigned users (via direct or team assignment).
      const assignedUserIds = (this.db.prepare(`
        SELECT a.user_id AS id FROM todo_assignees a WHERE a.todo_id = ? AND a.user_id IS NOT NULL
        UNION
        SELECT tm.user_id AS id FROM todo_assignees a
        JOIN team_members tm ON tm.team_id = a.team_id
        WHERE a.todo_id = ? AND a.team_id IS NOT NULL
      `).all(r.todo_id, r.todo_id) as any[]).map((row) => row.id);

      const recipients = [...new Set([r.user_id, ...assignedUserIds])];

      for (const userId of recipients) {
        const isCreator = userId === r.user_id;
        const body = isCreator
          ? `You asked to be reminded about this task${label}.`
          : `A reminder was set for this task${label}.`;
        this.notifications.create(userId, {
          type: 'task_reminder',
          title: `Reminder: ${r.title}`,
          body,
          link,
          todoId: r.todo_id,
          projectId: r.project_id ?? undefined,
        }, !r.notify_email);
      }

      // Record which channels were used — non-critical, ignore if column not yet migrated.
      try {
        const sentChannels = r.notify_email ? 'app+email' : 'app';
        this.db.prepare('UPDATE todo_reminders SET sent_channels = ? WHERE id = ?').run(sentChannels, r.id);
      } catch { /* migration 020 may not have run yet */ }

      this.log.debug(`Custom reminder sent: ${r.id} → ${recipients.length} recipient(s)`);
    }
  }
}
