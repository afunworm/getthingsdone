import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import { buildEmailHtml } from '../mail/email-template';
import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

export interface NotificationPayload {
  type: string;
  title: string;
  body: string;
  link?: string;
  todoId?: string;
  projectId?: string;
  items?: string[];
}

export type NotifType =
  | 'on_task_created'
  | 'on_task_deleted'
  | 'on_task_updated'
  | 'on_task_assigned'
  | 'on_task_comment'
  | 'on_upcoming'
  | 'on_past_due';

export interface NotificationSettings {
  on_task_created: boolean;
  on_task_deleted: boolean;
  on_task_updated: boolean;
  on_task_assigned: boolean;
  on_task_comment: boolean;
  on_upcoming: boolean;
  upcoming_hours: number;
  on_past_due: boolean;
  email_task_created: boolean;
  email_task_deleted: boolean;
  email_task_updated: boolean;
  email_task_assigned: boolean;
  email_task_comment: boolean;
  email_upcoming: boolean;
  email_past_due: boolean;
}

const DEFAULTS: NotificationSettings = {
  on_task_created: true,
  on_task_deleted: true,
  on_task_updated: true,
  on_task_assigned: true,
  on_task_comment: true,
  on_upcoming: true,
  upcoming_hours: 24,
  on_past_due: true,
  email_task_created: false,
  email_task_deleted: false,
  email_task_updated: false,
  email_task_assigned: false,
  email_task_comment: false,
  email_upcoming: false,
  email_past_due: false,
};

@Injectable()
export class NotificationsService {
  private streams = new Map<string, Subject<NotificationPayload>>();

  constructor(
    private readonly db: DatabaseService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ── SSE streams ────────────────────────────────────────────────────────────

  getStream(userId: string): Subject<NotificationPayload> {
    if (!this.streams.has(userId)) {
      this.streams.set(userId, new Subject());
    }
    return this.streams.get(userId)!;
  }

  removeStream(userId: string) {
    this.streams.delete(userId);
  }

  /** Push directly to a user's SSE stream if they are currently connected. No-op otherwise. */
  pushToUser(userId: string, payload: NotificationPayload): void {
    this.streams.get(userId)?.next(payload);
  }

  /** Push directly to ALL members of a project — bypasses notification settings. */
  pushToProjectMembers(projectId: string, payload: NotificationPayload): void {
    const memberIds = this.getProjectMemberIds(projectId);
    for (const userId of memberIds) {
      this.streams.get(userId)?.next(payload);
    }
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  /** Returns merged settings: project-level override over global default. */
  getEffectiveSettings(userId: string, projectId: string | null): NotificationSettings {
    const global = this.db.prepare(
      'SELECT * FROM notification_settings WHERE user_id = ? AND project_id IS NULL',
    ).get(userId) as any;

    const proj = projectId
      ? (this.db.prepare(
          'SELECT * FROM notification_settings WHERE user_id = ? AND project_id = ?',
        ).get(userId, projectId) as any)
      : null;

    const base = this.rowToSettings(global);
    const override = proj ? this.rowToSettings(proj) : {};
    return { ...DEFAULTS, ...base, ...override };
  }

  private rowToSettings(row: any): Partial<NotificationSettings> {
    if (!row) return {};
    return {
      on_task_created:     !!row.on_task_created,
      on_task_deleted:     !!row.on_task_deleted,
      on_task_updated:     !!row.on_task_updated,
      on_task_assigned:    !!row.on_task_assigned,
      on_task_comment:     !!row.on_task_comment,
      on_upcoming:         !!row.on_upcoming,
      upcoming_hours:      row.upcoming_hours ?? 24,
      on_past_due:         !!row.on_past_due,
      email_task_created:  !!row.email_task_created,
      email_task_deleted:  !!row.email_task_deleted,
      email_task_updated:  !!row.email_task_updated,
      email_task_assigned: !!row.email_task_assigned,
      email_task_comment:  !!row.email_task_comment,
      email_upcoming:      !!row.email_upcoming,
      email_past_due:      !!row.email_past_due,
    };
  }

  getAllSettings(userId: string): any[] {
    return this.db.prepare(
      'SELECT * FROM notification_settings WHERE user_id = ? ORDER BY project_id IS NOT NULL, project_id',
    ).all(userId);
  }

  upsertSettings(userId: string, projectId: string | null, partial: Partial<NotificationSettings>): void {
    const existing: any = projectId
      ? this.db.prepare('SELECT * FROM notification_settings WHERE user_id = ? AND project_id = ?').get(userId, projectId)
      : this.db.prepare('SELECT * FROM notification_settings WHERE user_id = ? AND project_id IS NULL').get(userId);

    const b = (v: boolean | undefined) => v !== undefined ? (v ? 1 : 0) : null;
    if (existing) {
      this.db.prepare(`
        UPDATE notification_settings SET
          on_task_created     = COALESCE(?, on_task_created),
          on_task_deleted     = COALESCE(?, on_task_deleted),
          on_task_updated     = COALESCE(?, on_task_updated),
          on_task_assigned    = COALESCE(?, on_task_assigned),
          on_task_comment     = COALESCE(?, on_task_comment),
          on_upcoming         = COALESCE(?, on_upcoming),
          upcoming_hours      = COALESCE(?, upcoming_hours),
          on_past_due         = COALESCE(?, on_past_due),
          email_task_created  = COALESCE(?, email_task_created),
          email_task_deleted  = COALESCE(?, email_task_deleted),
          email_task_updated  = COALESCE(?, email_task_updated),
          email_task_assigned = COALESCE(?, email_task_assigned),
          email_task_comment  = COALESCE(?, email_task_comment),
          email_upcoming      = COALESCE(?, email_upcoming),
          email_past_due      = COALESCE(?, email_past_due),
          updated_at          = unixepoch()
        WHERE id = ?
      `).run(
        b(partial.on_task_created),
        b(partial.on_task_deleted),
        b(partial.on_task_updated),
        b(partial.on_task_assigned),
        b(partial.on_task_comment),
        b(partial.on_upcoming),
        partial.upcoming_hours !== undefined ? partial.upcoming_hours : null,
        b(partial.on_past_due),
        b(partial.email_task_created),
        b(partial.email_task_deleted),
        b(partial.email_task_updated),
        b(partial.email_task_assigned),
        b(partial.email_task_comment),
        b(partial.email_upcoming),
        b(partial.email_past_due),
        existing.id,
      );
    } else {
      const current = { ...DEFAULTS, ...partial };
      this.db.prepare(`
        INSERT INTO notification_settings
          (id, user_id, project_id,
           on_task_created, on_task_deleted, on_task_updated, on_task_assigned, on_task_comment,
           on_upcoming, upcoming_hours, on_past_due,
           email_task_created, email_task_deleted, email_task_updated, email_task_assigned,
           email_task_comment, email_upcoming, email_past_due)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), userId, projectId ?? null,
        current.on_task_created  ? 1 : 0,
        current.on_task_deleted  ? 1 : 0,
        current.on_task_updated  ? 1 : 0,
        current.on_task_assigned ? 1 : 0,
        current.on_task_comment  ? 1 : 0,
        current.on_upcoming      ? 1 : 0,
        current.upcoming_hours,
        current.on_past_due          ? 1 : 0,
        current.email_task_created   ? 1 : 0,
        current.email_task_deleted   ? 1 : 0,
        current.email_task_updated   ? 1 : 0,
        current.email_task_assigned  ? 1 : 0,
        current.email_task_comment   ? 1 : 0,
        current.email_upcoming       ? 1 : 0,
        current.email_past_due       ? 1 : 0,
      );
    }
  }

  deleteSettings(userId: string, projectId: string): void {
    this.db.prepare(
      'DELETE FROM notification_settings WHERE user_id = ? AND project_id = ?',
    ).run(userId, projectId);
  }

  // ── Core send ──────────────────────────────────────────────────────────────

  /** Send directly to one user — bypasses settings checks (used by scheduler for reminders). */
  create(userId: string, payload: NotificationPayload, skipEmail = false): void {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO notifications (id, user_id, type, payload)
      VALUES (?, ?, ?, ?)
    `).run(id, userId, payload.type, JSON.stringify(payload));
    this.streams.get(userId)?.next(payload);

    if (!skipEmail) {
      const user = this.db.prepare('SELECT email, name FROM users WHERE id = ?').get(userId) as any;
      if (user?.email) {
        this.mail.send(user.email, payload.title, this.buildEmailHtml(payload)).catch(() => {});
      }
    }
  }

  /** Fan out to all members of a project who have the given type enabled. */
  notifyProjectMembers(
    projectId: string,
    type: NotifType,
    payload: NotificationPayload,
    excludeUserId?: string,
  ): void {
    const memberIds = this.getProjectMemberIds(projectId);
    for (const userId of memberIds) {
      if (userId === excludeUserId) continue;
      const settings = this.getEffectiveSettings(userId, projectId);
      if (!settings[type]) continue;

      const id = uuidv4();
      this.db.prepare(
        'INSERT INTO notifications (id, user_id, type, payload) VALUES (?, ?, ?, ?)',
      ).run(id, userId, payload.type, JSON.stringify(payload));
      this.streams.get(userId)?.next(payload);

      const emailKey = ('email_' + type.replace('on_', '')) as keyof NotificationSettings;
      if (settings[emailKey]) {
        const user = this.db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as any;
        if (user?.email) {
          this.mail.send(user.email, payload.title, this.buildEmailHtml(payload)).catch(() => {});
        }
      }
    }
  }

  /** Fan out to a specific user for a todo (inbox or project). */
  notifyUser(
    userId: string,
    projectId: string | null,
    type: NotifType,
    payload: NotificationPayload,
    skipEmail = false,
  ): void {
    // Skip if the user no longer has access to the project (e.g. removed from a team).
    if (projectId && !this.userHasProjectAccess(userId, projectId)) return;

    const settings = this.getEffectiveSettings(userId, projectId);
    if (!settings[type]) return;

    const id = uuidv4();
    this.db.prepare(
      'INSERT INTO notifications (id, user_id, type, payload) VALUES (?, ?, ?, ?)',
    ).run(id, userId, payload.type, JSON.stringify(payload));
    this.streams.get(userId)?.next(payload);

    const emailKey = ('email_' + type.replace('on_', '')) as keyof NotificationSettings;
    if (!skipEmail && settings[emailKey]) {
      const user = this.db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as any;
      if (user?.email) {
        this.mail.send(user.email, payload.title, this.buildEmailHtml(payload)).catch(() => {});
      }
    }
  }

  private getProjectMemberIds(projectId: string): string[] {
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
      ...direct.map((r) => r.user_id),
      ...viaTeam.map((r) => r.user_id),
    ]);
    return [...ids];
  }

  /** Returns true if the user currently has access to the project (owner, direct member, or via a team). */
  userHasProjectAccess(userId: string, projectId: string): boolean {
    const project = this.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) return false;
    if (project.owner_id === userId) return true;
    const direct = this.db.prepare(
      'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
    ).get(projectId, userId);
    if (direct) return true;
    return !!(this.db.prepare(`
      SELECT 1 FROM project_members pm
      JOIN team_members tm ON tm.team_id = pm.team_id
      WHERE pm.project_id = ? AND tm.user_id = ?
    `).get(projectId, userId));
  }

  sendEmail(toEmail: string, payload: NotificationPayload): void {
    this.mail.send(toEmail, payload.title, this.buildEmailHtml(payload)).catch(() => {});
  }

  private buildEmailHtml(payload: NotificationPayload): string {
    return buildEmailHtml({
      title:   payload.title,
      body:    payload.body,
      type:    payload.type,
      link:    payload.link,
      items:   payload.items,
      appUrl:  this.config.get('FRONTEND_URL', ''),
    });
  }

  // ── Reminders ──────────────────────────────────────────────────────────────

  getReminders(todoId: string, userId: string) {
    return this.db.prepare(
      'SELECT * FROM todo_reminders WHERE todo_id = ? AND user_id = ? ORDER BY remind_at',
    ).all(todoId, userId);
  }

  createReminder(todoId: string, userId: string, remindAt: number, label?: string, notifyEmail = true): any {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO todo_reminders (id, todo_id, user_id, remind_at, label, notify_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, todoId, userId, remindAt, label ?? null, notifyEmail ? 1 : 0);
    return this.db.prepare('SELECT * FROM todo_reminders WHERE id = ?').get(id);
  }

  patchReminder(id: string, userId: string, notifyEmail?: boolean, remindAt?: number): any {
    if (notifyEmail !== undefined) {
      this.db.prepare(
        'UPDATE todo_reminders SET notify_email = ? WHERE id = ? AND user_id = ?',
      ).run(notifyEmail ? 1 : 0, id, userId);
    }
    if (remindAt !== undefined) {
      this.db.prepare(
        'UPDATE todo_reminders SET remind_at = ?, sent = 0 WHERE id = ? AND user_id = ?',
      ).run(remindAt, id, userId);
    }
    return this.db.prepare('SELECT * FROM todo_reminders WHERE id = ?').get(id);
  }

  deleteReminder(id: string, userId: string): void {
    this.db.prepare('DELETE FROM todo_reminders WHERE id = ? AND user_id = ?').run(id, userId);
  }

  // ── Overdue check (pull-on-load, once per day after 8am) ──────────────────

  checkOverdue(userId: string): any[] {
    // Respect the user's on_past_due preference
    const settings = this.getEffectiveSettings(userId, null);
    if (!settings.on_past_due) return [];

    const tzRow = this.db.prepare(
      'SELECT timezone FROM users WHERE id = ?',
    ).get(userId) as any;
    const tz = tzRow?.timezone ?? 'UTC';

    const now = new Date();

    // Today's date string (YYYY-MM-DD) in user's timezone
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);

    // Already shown today?
    const seen = this.db.prepare(
      "SELECT value FROM user_settings WHERE user_id = ? AND key = 'overdue_notified_date'",
    ).get(userId) as any;
    if (seen?.value === todayStr) return [];

    const tasks = this.db.prepare(`
      SELECT
        t.id, t.title, t.description, t.due_date, t.flow_step_index,
        t.priority, t.is_inbox, t.inbox_user_id, t.project_id,
        'My Inbox' AS inbox_name,
        NULL        AS flow_steps,
        CAST((unixepoch() - t.due_date) / 86400 AS INTEGER) AS days_overdue
      FROM todos t
      WHERE t.is_inbox = 1 AND t.inbox_user_id = ?
        AND t.due_date IS NOT NULL AND t.due_date < unixepoch()
        AND t.flow_step_index < 2
        AND t.parent_todo_id IS NULL
        AND t.is_tour_demo = 0

      UNION ALL

      SELECT
        t.id, t.title, t.description, t.due_date, t.flow_step_index,
        t.priority, t.is_inbox, t.inbox_user_id, t.project_id,
        p.name       AS inbox_name,
        p.flow_steps AS flow_steps,
        CAST((unixepoch() - t.due_date) / 86400 AS INTEGER) AS days_overdue
      FROM todos t
      JOIN projects p ON p.id = t.project_id
      WHERE t.due_date IS NOT NULL AND t.due_date < unixepoch()
        AND t.parent_todo_id IS NULL
        AND t.is_tour_demo = 0
        AND t.flow_step_index < (json_array_length(p.flow_steps) - 1)
        AND (
          p.owner_id = ?
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?)
          OR EXISTS (
            SELECT 1 FROM project_members pm
            JOIN team_members tm ON tm.team_id = pm.team_id
            WHERE pm.project_id = p.id AND tm.user_id = ?
          )
          OR EXISTS (SELECT 1 FROM todo_assignees ta WHERE ta.todo_id = t.id AND ta.user_id = ?)
          OR EXISTS (
            SELECT 1 FROM todo_assignees ta
            JOIN team_members tm ON tm.team_id = ta.team_id
            WHERE ta.todo_id = t.id AND tm.user_id = ?
          )
        )
      ORDER BY days_overdue DESC
    `).all(userId, userId, userId, userId, userId, userId) as any[];

    const mapped = tasks.map((t) => ({
      ...t,
      is_inbox: !!t.is_inbox,
      flow_steps: t.flow_steps ? JSON.parse(t.flow_steps) : ['New', 'In Progress', 'Done'],
    }));

    if (mapped.length > 0) {
      this.db.prepare(`
        INSERT INTO user_settings (user_id, key, value, updated_at)
        VALUES (?, 'overdue_notified_date', ?, unixepoch())
        ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()
      `).run(userId, todayStr);
    }

    return mapped;
  }

  // ── Bell list ──────────────────────────────────────────────────────────────

  findAll(userId: string) {
    return this.db.prepare(`
      SELECT * FROM notifications WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 50
    `).all(userId).map((n: any) => ({
      ...n,
      payload: JSON.parse(n.payload),
      is_read: !!n.is_read,
    }));
  }

  markRead(id: string, userId: string) {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  }

  markAllRead(userId: string) {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  }

  unreadCount(userId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
    ).get(userId) as any;
    return row.count;
  }

  deleteAll(userId: string): void {
    this.db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
  }
}
