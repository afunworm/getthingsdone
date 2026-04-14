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

  /** Every minute — check upcoming, past-due, and custom reminders. */
  @Cron('0 * * * * *')
  public handleScheduled() {
    this.checkCustomReminders();
    this.checkUpcoming();
    this.checkPastDue();
    this.checkDailyOverdueDigest();
  }

  // ── Custom per-task reminders ──────────────────────────────────────────────

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
      const label = r.label ? ` (${r.label})` : '';
      this.notifications.create(r.user_id, {
        type: 'task_reminder',
        title: `Reminder: ${r.title}`,
        body: `You asked to be reminded about this task${label}.`,
        link,
        todoId: r.todo_id,
        projectId: r.project_id ?? undefined,
      }, false);
      this.db.prepare('UPDATE todo_reminders SET sent = 1 WHERE id = ?').run(r.id);
      this.log.debug(`Custom reminder sent: ${r.id}`);
    }
  }

  // ── Upcoming task reminders ────────────────────────────────────────────────

  private checkUpcoming(): void {
    const nowSec = Math.floor(Date.now() / 1000);

    const todos = this.db.prepare(`
      SELECT t.*, p.flow_steps
      FROM todos t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.due_date IS NOT NULL AND t.due_date > ? AND t.is_tour_demo = 0
    `).all(nowSec) as any[];

    for (const todo of todos) {
      const maxSteps = todo.flow_steps
        ? (JSON.parse(todo.flow_steps) as any[]).length
        : 3;
      if (todo.flow_step_index >= maxSteps - 1) continue;

      const recipients = todo.project_id
        ? this.getProjectRecipients(todo.project_id, 'on_upcoming')
        : (todo.inbox_user_id ? [{ userId: todo.inbox_user_id, upcomingHours: 24 }] : []);

      for (const { userId, upcomingHours } of recipients) {
        const windowSec = upcomingHours * 3600;
        if (todo.due_date > nowSec + windowSec) continue;

        const today = this.todayForUser(userId);
        const already = this.db.prepare(`
          SELECT 1 FROM notification_sent_log
          WHERE todo_id = ? AND user_id = ? AND type = 'upcoming' AND sent_day = ?
        `).get(todo.id, userId, today);
        if (already) continue;

        const tz = this.timezoneForUser(userId);
        const link = todo.project_id ? `/projects/${todo.project_id}` : '/inbox';
        const dueStr = new Date(todo.due_date * 1000).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', timeZone: tz,
        });

        this.notifications.notifyUser(userId, todo.project_id ?? null, 'on_upcoming', {
          type: 'task_upcoming',
          title: `Upcoming: ${todo.title}`,
          body: `Due ${dueStr}`,
          link,
          todoId: todo.id,
          projectId: todo.project_id ?? undefined,
        });

        this.db.prepare(`
          INSERT OR IGNORE INTO notification_sent_log (id, todo_id, user_id, type, sent_day)
          VALUES (lower(hex(randomblob(16))), ?, ?, 'upcoming', ?)
        `).run(todo.id, userId, today);
      }
    }
  }

  // ── Past-due reminders ─────────────────────────────────────────────────────

  private checkPastDue(): void {
    const nowSec = Math.floor(Date.now() / 1000);

    const todos = this.db.prepare(`
      SELECT t.*, p.flow_steps
      FROM todos t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.due_date IS NOT NULL AND t.due_date < ? AND t.is_tour_demo = 0
    `).all(nowSec) as any[];

    for (const todo of todos) {
      const maxSteps = todo.flow_steps
        ? (JSON.parse(todo.flow_steps) as any[]).length
        : 3;
      if (todo.flow_step_index >= maxSteps - 1) continue;

      const recipientIds = todo.project_id
        ? this.getTaskRecipients(todo.id, todo.project_id)
        : (todo.inbox_user_id ? [todo.inbox_user_id] : []);

      for (const userId of recipientIds) {
        const today = this.todayForUser(userId);
        const already = this.db.prepare(`
          SELECT 1 FROM notification_sent_log
          WHERE todo_id = ? AND user_id = ? AND type = 'past_due' AND sent_day = ?
        `).get(todo.id, userId, today);
        if (already) continue;

        const settings = this.notifications.getEffectiveSettings(userId, todo.project_id ?? null);
        if (!settings.on_past_due) continue;

        const tz = this.timezoneForUser(userId);
        const link = todo.project_id ? `/projects/${todo.project_id}` : '/inbox';
        const dueStr = new Date(todo.due_date * 1000).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', timeZone: tz,
        });

        this.notifications.notifyUser(userId, todo.project_id ?? null, 'on_past_due', {
          type: 'task_past_due',
          title: `Overdue: ${todo.title}`,
          body: `Was due ${dueStr}`,
          link,
          todoId: todo.id,
          projectId: todo.project_id ?? undefined,
        }, true);

        this.db.prepare(`
          INSERT OR IGNORE INTO notification_sent_log (id, todo_id, user_id, type, sent_day)
          VALUES (lower(hex(randomblob(16))), ?, ?, 'past_due', ?)
        `).run(todo.id, userId, today);
      }
    }
  }

  // ── Daily overdue digest ───────────────────────────────────────────────────

  private checkDailyOverdueDigest(): void {
    const users = this.db.prepare(
      'SELECT id, email, overdue_reminder_time FROM users',
    ).all() as any[];

    for (const user of users) {
      const tz      = this.timezoneForUser(user.id);
      const now     = new Date();
      const timeStr = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
      const reminderTime = user.overdue_reminder_time ?? '08:00';
      if (timeStr !== reminderTime) continue;

      const today = this.todayForUser(user.id);
      const seen  = this.db.prepare(
        "SELECT value FROM user_settings WHERE user_id = ? AND key = 'overdue_notified_date'",
      ).get(user.id) as any;
      if (seen?.value === today) continue;

      this.sendOverdueDigestForUser(user.id, user.email);
    }
  }

  /** Run the overdue digest for a single user immediately, bypassing time/date checks. */
  public sendOverdueDigestForUser(userId: string, email?: string): void {
    const user = email !== undefined
      ? { id: userId, email }
      : this.db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as any;
    if (!user) return;

    const tasks = this.db.prepare(`
      SELECT t.id, t.title, t.project_id, t.is_inbox
      FROM todos t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.due_date IS NOT NULL AND t.due_date < unixepoch()
        AND t.parent_todo_id IS NULL
        AND (
          -- Personal inbox tasks
          (t.is_inbox = 1 AND t.inbox_user_id = ? AND t.flow_step_index < 2)
          OR (
            t.project_id IS NOT NULL
            AND t.flow_step_index < (json_array_length(p.flow_steps) - 1)
            AND (
              -- Project member (owner, direct, or via project team)
              p.owner_id = ?
              OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?)
              OR EXISTS (
                SELECT 1 FROM project_members pm
                JOIN team_members tm ON tm.team_id = pm.team_id
                WHERE pm.project_id = p.id AND tm.user_id = ?
              )
              -- Directly assigned to the task
              OR EXISTS (SELECT 1 FROM todo_assignees ta WHERE ta.todo_id = t.id AND ta.user_id = ?)
              -- Member of a team assigned to the task
              OR EXISTS (
                SELECT 1 FROM todo_assignees ta
                JOIN team_members tm ON tm.team_id = ta.team_id
                WHERE ta.todo_id = t.id AND tm.user_id = ?
              )
            )
          )
        )
    `).all(userId, userId, userId, userId, userId, userId) as any[];

    if (tasks.length === 0) return;

    const today = this.todayForUser(userId);
    this.db.prepare(`
      INSERT INTO user_settings (user_id, key, value, updated_at)
      VALUES (?, 'overdue_notified_date', ?, unixepoch())
      ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()
    `).run(userId, today);

    const settings = this.notifications.getEffectiveSettings(userId, null);
    if (!settings.on_past_due) return;

    const count = tasks.length;
    const payload = {
      type:  'task_past_due',
      title: `You have ${count} overdue task${count === 1 ? '' : 's'}`,
      body:  `The following task${count === 1 ? ' is' : 's are'} past their due date and need your attention.`,
      link:  '/inbox',
      items: tasks.map((t: any) => t.title),
    };

    if (settings.notify_app) {
      this.notifications.create(userId, payload, true);
    }

    if (settings.notify_email && user.email) {
      this.notifications.sendEmail(user.email, payload);
    }

    this.log.debug(`Overdue digest sent to ${userId}: ${count} tasks`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private timezoneForUser(userId: string): string {
    const row = this.db.prepare('SELECT timezone FROM users WHERE id = ?').get(userId) as any;
    if (row?.timezone && row.timezone !== 'UTC') return row.timezone;
    const def = this.db.prepare("SELECT value FROM app_settings WHERE key = 'default_timezone'").get() as any;
    return def?.value ?? 'UTC';
  }

  private todayForUser(userId: string): string {
    // Returns YYYY-MM-DD in the user's local timezone
    return new Date().toLocaleDateString('en-CA', { timeZone: this.timezoneForUser(userId) });
  }

  private getProjectRecipients(
    projectId: string,
    type: 'on_upcoming' | 'on_past_due',
  ): { userId: string; upcomingHours: number }[] {
    const project = this.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as any;
    const direct = this.db.prepare(
      'SELECT user_id FROM project_members WHERE project_id = ? AND user_id IS NOT NULL',
    ).all(projectId) as any[];
    const viaTeam = this.db.prepare(`
      SELECT DISTINCT tm.user_id FROM project_members pm
      JOIN team_members tm ON tm.team_id = pm.team_id
      WHERE pm.project_id = ?
    `).all(projectId) as any[];

    const ids = new Set<string>([
      ...(project?.owner_id ? [project.owner_id] : []),
      ...direct.map((r: any) => r.user_id),
      ...viaTeam.map((r: any) => r.user_id),
    ]);

    return [...ids].map((userId) => {
      const s = this.notifications.getEffectiveSettings(userId, projectId);
      return { userId, upcomingHours: s.upcoming_hours };
    });
  }

  /**
   * Returns the full recipient set for an overdue task notification:
   * - All project members (owner + direct + via project teams)
   * - Users directly assigned to the task
   * - Members of teams assigned to the task
   */
  private getTaskRecipients(todoId: string, projectId: string): string[] {
    const project = this.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as any;

    const projectDirect = this.db.prepare(
      'SELECT user_id FROM project_members WHERE project_id = ? AND user_id IS NOT NULL',
    ).all(projectId) as any[];

    const projectViaTeam = this.db.prepare(`
      SELECT DISTINCT tm.user_id FROM project_members pm
      JOIN team_members tm ON tm.team_id = pm.team_id
      WHERE pm.project_id = ?
    `).all(projectId) as any[];

    // Only include task assignees who also currently have project access.
    const taskDirect = this.db.prepare(`
      SELECT ta.user_id FROM todo_assignees ta
      WHERE ta.todo_id = ? AND ta.user_id IS NOT NULL
        AND (
          EXISTS (SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ta.user_id)
          OR EXISTS (
            SELECT 1 FROM project_members pm
            JOIN team_members tm ON tm.team_id = pm.team_id
            WHERE pm.project_id = ? AND tm.user_id = ta.user_id
          )
          OR ta.user_id = ?
        )
    `).all(todoId, projectId, projectId, project?.owner_id ?? '') as any[];

    const taskViaTeam = this.db.prepare(`
      SELECT DISTINCT tm.user_id FROM todo_assignees ta
      JOIN team_members tm ON tm.team_id = ta.team_id
      WHERE ta.todo_id = ? AND ta.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM project_members pm2
          JOIN team_members tm2 ON tm2.team_id = pm2.team_id
          WHERE pm2.project_id = ? AND tm2.user_id = tm.user_id
        )
    `).all(todoId, projectId) as any[];

    const ids = new Set<string>([
      ...(project?.owner_id ? [project.owner_id] : []),
      ...projectDirect.map((r: any) => r.user_id),
      ...projectViaTeam.map((r: any) => r.user_id),
      ...taskDirect.map((r: any) => r.user_id),
      ...taskViaTeam.map((r: any) => r.user_id),
    ]);

    return [...ids];
  }
}
