import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class InboxService {
  constructor(private readonly db: DatabaseService) {}

  findAll(userId: string) {
    return this.db.prepare(`
      SELECT t.*, u.name AS created_by_name, at.name AS created_via_token_name,
        (SELECT COUNT(*) FROM todo_reminders WHERE todo_id = t.id AND user_id = ? AND sent = 0) as reminder_count,
        (SELECT COUNT(*) FROM todo_attachments WHERE todo_id = t.id) +
        (SELECT COUNT(*) FROM attachments a JOIN comments c ON c.id = a.comment_id WHERE c.todo_id = t.id) as attachment_count,
        (SELECT COUNT(*) FROM comments WHERE todo_id = t.id) as comment_count
      FROM todos t
      LEFT JOIN users u ON u.id = t.created_by
      LEFT JOIN api_tokens at ON at.id = t.created_via_token_id
      WHERE t.is_inbox = 1 AND t.inbox_user_id = ? AND t.parent_todo_id IS NULL
      ORDER BY t.sort_order, t.created_at
    `).all(userId, userId).map((t: any) => ({
      ...t,
      is_recurring: !!t.is_recurring,
      recurrence_rule: t.recurrence_rule ? JSON.parse(t.recurrence_rule) : null,
      assignees: this.getAssignees(t.id),
      subtodos: this.getSubtodos(t.id),
    }));
  }

  private getAssignees(todoId: string): { users: any[]; teams: any[] } {
    const rows = this.db.prepare(`
      SELECT ta.user_id, ta.team_id, u.name AS user_name, te.name AS team_name
      FROM todo_assignees ta
      LEFT JOIN users u ON u.id = ta.user_id
      LEFT JOIN teams te ON te.id = ta.team_id
      WHERE ta.todo_id = ?
    `).all(todoId) as any[];
    return {
      users: rows.filter((r) => r.user_id).map((r) => ({ id: r.user_id, name: r.user_name })),
      teams: rows.filter((r) => r.team_id).map((r) => ({ id: r.team_id, name: r.team_name })),
    };
  }

  private getSubtodos(parentId: string) {
    return this.db.prepare(`
      SELECT t.*, u.name AS created_by_name
      FROM todos t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.parent_todo_id = ?
      ORDER BY t.sort_order, t.created_at
    `).all(parentId).map((t: any) => ({
      ...t,
      is_recurring: !!t.is_recurring,
      recurrence_rule: t.recurrence_rule ? JSON.parse(t.recurrence_rule) : null,
      assignees: this.getAssignees(t.id),
    }));
  }

  create(
    dto: {
      parentTodoId?: string;
      title: string;
      description?: string;
      dueDate?: number;
      isRecurring?: boolean;
      recurrenceRule?: any;
      sortOrder?: number;
      apiTokenId?: string;
    },
    userId: string,
  ) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO todos (
        id, title, description, due_date, is_recurring, recurrence_rule,
        sort_order, is_inbox, inbox_user_id, parent_todo_id, created_by, created_via_token_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id,
      dto.title,
      dto.description ?? null,
      dto.dueDate ?? null,
      dto.isRecurring ? 1 : 0,
      dto.recurrenceRule ? JSON.stringify(dto.recurrenceRule) : null,
      dto.sortOrder ?? 0,
      userId,
      dto.parentTodoId ?? null,
      userId,
      dto.apiTokenId ?? null,
    );
    return this.db.prepare(`
      SELECT t.*, u.name AS created_by_name
      FROM todos t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = ?
    `).get(id);
  }
}
