import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import {
  TodoCreatedEvent, TodoUpdatedEvent, TodoDeletedEvent, TodoMovedEvent,
  TodoFlowChangedEvent, TodoUserAssignedEvent, TodoTeamAssignedEvent,
  TodoUserUnassignedEvent, TodoTeamUnassignedEvent,
} from './todo.events';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class TodosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private canAccess(todo: any, userId: string, userRole: string): boolean {
    if (userRole === 'admin') return true;
    if (todo.is_inbox) return todo.inbox_user_id === userId;
    if (!todo.project_id) return false;

    const project = this.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(todo.project_id) as any;
    if (!project) return false;
    if (project.owner_id === userId) return true;

    const direct = this.db.prepare(
      'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
    ).get(todo.project_id, userId);
    if (direct) return true;

    return !!(this.db.prepare(`
      SELECT 1 FROM project_members pm
      JOIN team_members tm ON tm.team_id = pm.team_id
      WHERE pm.project_id = ? AND tm.user_id = ?
    `).get(todo.project_id, userId));
  }

  // ── History ────────────────────────────────────────────────────────────────

  private recordHistory(todoId: string, userId: string, field: string, oldVal: any, newVal: any): void {
    this.db.prepare(
      'INSERT INTO todo_history (id, todo_id, changed_by, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      uuidv4(), todoId, userId, field,
      oldVal !== null && oldVal !== undefined ? String(oldVal) : null,
      newVal !== null && newVal !== undefined ? String(newVal) : null,
    );
  }

  getHistory(id: string, userRole: string): any[] {
    if (userRole !== 'admin') throw new ForbiddenException();
    return this.db.prepare(`
      SELECT h.*, u.name AS changed_by_name
      FROM todo_history h
      LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.todo_id = ?
      ORDER BY h.changed_at DESC
    `).all(id);
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

  findByProject(projectId: string, userId: string, userRole: string, includeDone = false) {
    if (userRole !== 'admin') {
      const project = this.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as any;
      if (!project) throw new NotFoundException();
      const hasAccess = project.owner_id === userId
        || this.db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId)
        || this.db.prepare(`
          SELECT 1 FROM project_members pm JOIN team_members tm ON tm.team_id = pm.team_id
          WHERE pm.project_id = ? AND tm.user_id = ?
        `).get(projectId, userId);
      if (!hasAccess) throw new ForbiddenException();
    }

    const todos = this.db.prepare(`
      SELECT t.*, u.name as created_by_name, at.name as created_via_token_name,
        (SELECT COUNT(*) FROM todo_reminders WHERE todo_id = t.id AND user_id = ? AND sent = 0) as reminder_count,
        (SELECT COUNT(*) FROM todo_attachments WHERE todo_id = t.id) +
        (SELECT COUNT(*) FROM attachments a JOIN comments c ON c.id = a.comment_id WHERE c.todo_id = t.id) as attachment_count,
        (SELECT COUNT(*) FROM comments WHERE todo_id = t.id) as comment_count
      FROM todos t
      LEFT JOIN users u ON u.id = t.created_by
      LEFT JOIN api_tokens at ON at.id = t.created_via_token_id
      WHERE t.project_id = ? AND t.parent_todo_id IS NULL
        ${includeDone ? '' : 'AND t.flow_step_index < (SELECT json_array_length(p2.flow_steps) - 1 FROM projects p2 WHERE p2.id = t.project_id)'}
      ORDER BY t.sort_order, t.created_at
    `).all(userId, projectId).map(this.parse.bind(this));

    return todos.map((todo: any) => ({
      ...todo,
      assignees: this.getAssignees(todo.id),
      subtodos: this.getSubtodos(todo.id),
    }));
  }

  private getSubtodos(parentId: string) {
    return this.db.prepare(`
      SELECT t.*, u.name as created_by_name
      FROM todos t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.parent_todo_id = ?
      ORDER BY t.sort_order, t.created_at
    `).all(parentId).map((t: any) => ({
      ...this.parse(t),
      assignees: this.getAssignees(t.id),
    }));
  }

  findById(id: string, userId: string, userRole: string) {
    const todo = this.db.prepare(`
      SELECT t.*, u.name as created_by_name, at.name as created_via_token_name
      FROM todos t
      LEFT JOIN users u ON u.id = t.created_by
      LEFT JOIN api_tokens at ON at.id = t.created_via_token_id
      WHERE t.id = ?
    `).get(id) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, userId, userRole)) throw new ForbiddenException();
    return {
      ...this.parse(todo),
      assignees: this.getAssignees(id),
      subtodos: this.getSubtodos(id),
      attachments: this.getTodoAttachments(id),
    };
  }

  create(
    dto: {
      projectId?: string;
      parentTodoId?: string;
      title: string;
      description?: string;
      dueDate?: number;
      isRecurring?: boolean;
      recurrenceRule?: { type: 'daily' | 'weekly' | 'monthly'; interval: number };
      sortOrder?: number;
      priority?: number;
      apiTokenId?: string;
    },
    userId: string,
    userRole: string,
  ) {
    if (dto.projectId && userRole !== 'admin') {
      const project = this.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(dto.projectId) as any;
      if (!project) throw new NotFoundException('Project not found');

      if (project.owner_id !== userId) {
        // Check direct user membership first, then team-based membership
        const directPm = this.db.prepare(
          'SELECT permissions FROM project_members WHERE project_id = ? AND user_id = ?',
        ).get(dto.projectId, userId) as any;

        let hasPerm = false;
        if (directPm) {
          hasPerm = JSON.parse(directPm.permissions).includes('create');
        } else {
          const teamPm = this.db.prepare(`
            SELECT pm.permissions FROM project_members pm
            JOIN team_members tm ON tm.team_id = pm.team_id
            WHERE pm.project_id = ? AND tm.user_id = ?
            LIMIT 1
          `).get(dto.projectId, userId) as any;
          if (teamPm) hasPerm = JSON.parse(teamPm.permissions).includes('create');
        }

        if (!hasPerm) throw new ForbiddenException('No create permission');
      }
    }

    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO todos (
        id, project_id, parent_todo_id, title, description,
        due_date, is_recurring, recurrence_rule, sort_order, created_by, created_via_token_id, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      dto.projectId ?? null,
      dto.parentTodoId ?? null,
      dto.title,
      dto.description ?? null,
      dto.dueDate ?? null,
      dto.isRecurring ? 1 : 0,
      dto.recurrenceRule ? JSON.stringify(dto.recurrenceRule) : null,
      dto.sortOrder ?? 0,
      userId,
      dto.apiTokenId ?? null,
      dto.priority ?? 0,
    );
    const created = this.findById(id, userId, userRole);
    this.eventEmitter.emit('todo.created', new TodoCreatedEvent(created, userId));
    this.recordHistory(id, userId, 'created', null, dto.title);

    if (dto.dueDate) {
      this.upsertAutoDueReminder(id, userId, dto.dueDate);
    }

    return created;
  }

  update(
    id: string,
    dto: {
      title?: string;
      description?: string;
      dueDate?: number | null;
      isRecurring?: boolean;
      sortOrder?: number;
      recurrenceRule?: any;
      priority?: number;
      /** null = promote to main task; string = attach under that parent */
      parentTodoId?: string | null;
      /** Move to a different project/inbox */
      projectId?: string;
      /** Change the creator */
      createdBy?: string;
    },
    userId: string,
    userRole: string,
  ) {
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, userId, userRole)) throw new ForbiddenException();

    const hasParent      = 'parentTodoId' in dto;
    const hasProjectId   = 'projectId'    in dto;
    const hasDesc        = 'description'  in dto;
    const hasCreatedBy   = 'createdBy'    in dto;
    const hasIsRecurring = 'isRecurring'  in dto;

    this.db.prepare(`
      UPDATE todos SET
        title             = COALESCE(?, title),
        description       = CASE WHEN ? THEN ? ELSE description END,
        due_date          = CASE WHEN ? IS NOT NULL THEN ? ELSE due_date END,
        is_recurring      = CASE WHEN ? THEN ? ELSE is_recurring END,
        sort_order        = COALESCE(?, sort_order),
        recurrence_rule   = CASE WHEN ? THEN ? ELSE recurrence_rule END,
        priority          = COALESCE(?, priority),
        parent_todo_id    = CASE WHEN ? THEN ? ELSE parent_todo_id END,
        project_id        = CASE WHEN ? THEN ? ELSE project_id END,
        created_by        = CASE WHEN ? THEN ? ELSE created_by END,
        updated_at        = unixepoch()
      WHERE id = ?
    `).run(
      dto.title ?? null,
      hasDesc ? 1 : 0,          dto.description ?? null,
      dto.dueDate !== undefined ? 1 : null, dto.dueDate ?? null,
      hasIsRecurring ? 1 : 0,   hasIsRecurring ? (dto.isRecurring ? 1 : 0) : null,
      dto.sortOrder ?? null,
      dto.recurrenceRule !== undefined ? 1 : 0,
      dto.recurrenceRule !== undefined ? (dto.recurrenceRule ? JSON.stringify(dto.recurrenceRule) : null) : null,
      dto.priority ?? null,
      hasParent    ? 1 : 0,     hasParent    ? (dto.parentTodoId ?? null) : null,
      hasProjectId ? 1 : 0,     hasProjectId ? (dto.projectId ?? null)    : null,
      hasCreatedBy ? 1 : 0,     hasCreatedBy ? (dto.createdBy ?? null)    : null,
      id,
    );

    // When moving to a different inbox, cascade project_id to all subtasks
    if (hasProjectId && dto.projectId && dto.projectId !== todo.project_id) {
      this.db.prepare('UPDATE todos SET project_id = ?, updated_at = unixepoch() WHERE parent_todo_id = ?')
        .run(dto.projectId, id);
    }

    if (dto.dueDate !== undefined) {
      if (dto.dueDate) {
        this.upsertAutoDueReminder(id, todo.created_by ?? userId, dto.dueDate);
      } else {
        this.db.prepare("DELETE FROM todo_reminders WHERE todo_id = ? AND label = '__auto_due__'").run(id);
      }
    }

    const updated = this.findById(id, userId, userRole);

    const changedFields = [
      ...(dto.title              !== undefined ? ['title']       : []),
      ...(hasDesc                              ? ['description'] : []),
      ...(dto.dueDate            !== undefined ? ['dueDate']     : []),
      ...(dto.priority           !== undefined ? ['priority']    : []),
    ];
    if (changedFields.length) {
      this.eventEmitter.emit('todo.updated', new TodoUpdatedEvent(updated, userId, changedFields));
    }

    // ── History diffs ─────────────────────────────────────────────────────────
    if (dto.title !== undefined && dto.title !== todo.title) {
      this.recordHistory(id, userId, 'title', todo.title, dto.title);
    }
    if (hasDesc && dto.description !== todo.description) {
      this.recordHistory(id, userId, 'description', todo.description ?? null, dto.description ?? null);
    }
    if (dto.dueDate !== undefined) {
      const oldDate = todo.due_date ? new Date(todo.due_date * 1000).toISOString().split('T')[0] : null;
      const newDate = dto.dueDate ? new Date(dto.dueDate * 1000).toISOString().split('T')[0] : null;
      if (oldDate !== newDate) this.recordHistory(id, userId, 'due_date', oldDate, newDate);
    }
    if (dto.priority !== undefined && dto.priority !== todo.priority) {
      this.recordHistory(id, userId, 'priority', todo.priority, dto.priority);
    }
    if (hasIsRecurring && (dto.isRecurring ? 1 : 0) !== todo.is_recurring) {
      this.recordHistory(id, userId, 'is_recurring', todo.is_recurring ? 'Yes' : 'No', dto.isRecurring ? 'Yes' : 'No');
    }
    if (dto.recurrenceRule !== undefined) {
      const oldRule = todo.recurrence_rule ?? null;
      const newRule = dto.recurrenceRule ? JSON.stringify(dto.recurrenceRule) : null;
      if (oldRule !== newRule) this.recordHistory(id, userId, 'recurrence_rule', oldRule, newRule);
    }
    if (hasParent && dto.parentTodoId !== todo.parent_todo_id) {
      const oldTitle = todo.parent_todo_id ? (this.db.prepare('SELECT title FROM todos WHERE id = ?').get(todo.parent_todo_id) as any)?.title ?? todo.parent_todo_id : null;
      const newTitle = dto.parentTodoId ? (this.db.prepare('SELECT title FROM todos WHERE id = ?').get(dto.parentTodoId) as any)?.title ?? dto.parentTodoId : null;
      this.recordHistory(id, userId, 'parent_task', oldTitle, newTitle);
    }
    if (hasProjectId && dto.projectId !== todo.project_id) {
      const oldProj = todo.project_id ? (this.db.prepare('SELECT name FROM projects WHERE id = ?').get(todo.project_id) as any)?.name ?? todo.project_id : 'Personal Inbox';
      const newProj = dto.projectId ? (this.db.prepare('SELECT name FROM projects WHERE id = ?').get(dto.projectId) as any)?.name ?? dto.projectId : 'Personal Inbox';
      this.recordHistory(id, userId, 'project', oldProj, newProj);
    }
    if (hasCreatedBy && dto.createdBy !== todo.created_by) {
      const oldUser = todo.created_by ? (this.db.prepare('SELECT name FROM users WHERE id = ?').get(todo.created_by) as any)?.name ?? todo.created_by : null;
      const newUser = dto.createdBy ? (this.db.prepare('SELECT name FROM users WHERE id = ?').get(dto.createdBy) as any)?.name ?? dto.createdBy : null;
      this.recordHistory(id, userId, 'created_by', oldUser, newUser);
    }

    return updated;
  }

  addAssignee(
    todoId: string,
    dto: { userId?: string; teamId?: string },
    callerId: string,
    callerRole: string,
  ) {
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(todoId) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, callerId, callerRole)) throw new ForbiddenException();

    const id = uuidv4();
    this.db.prepare(`
      INSERT OR IGNORE INTO todo_assignees (id, todo_id, user_id, team_id)
      VALUES (?, ?, ?, ?)
    `).run(id, todoId, dto.userId ?? null, dto.teamId ?? null);

    if (dto.userId) {
      const uname = (this.db.prepare('SELECT name FROM users WHERE id = ?').get(dto.userId) as any)?.name ?? dto.userId;
      this.recordHistory(todoId, callerId, 'assignee_added', null, uname);
      this.eventEmitter.emit('todo.user_assigned', new TodoUserAssignedEvent(todo, callerId, dto.userId));
    }
    if (dto.teamId) {
      const tname = (this.db.prepare('SELECT name FROM teams WHERE id = ?').get(dto.teamId) as any)?.name ?? dto.teamId;
      this.recordHistory(todoId, callerId, 'team_assigned', null, tname);
      this.eventEmitter.emit('todo.team_assigned', new TodoTeamAssignedEvent(todo, callerId, dto.teamId));
    }

    return { assignees: this.getAssignees(todoId) };
  }

  removeAssignee(
    todoId: string,
    targetUserId: string | undefined,
    targetTeamId: string | undefined,
    callerId: string,
    callerRole: string,
  ) {
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(todoId) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, callerId, callerRole)) throw new ForbiddenException();

    if (targetUserId) {
      const uname = (this.db.prepare('SELECT name FROM users WHERE id = ?').get(targetUserId) as any)?.name ?? targetUserId;
      this.db.prepare('DELETE FROM todo_assignees WHERE todo_id = ? AND user_id = ?').run(todoId, targetUserId);
      this.recordHistory(todoId, callerId, 'assignee_removed', uname, null);
      this.eventEmitter.emit('todo.user_unassigned', new TodoUserUnassignedEvent(todo, callerId, targetUserId));
    } else if (targetTeamId) {
      const tname = (this.db.prepare('SELECT name FROM teams WHERE id = ?').get(targetTeamId) as any)?.name ?? targetTeamId;
      this.db.prepare('DELETE FROM todo_assignees WHERE todo_id = ? AND team_id = ?').run(todoId, targetTeamId);
      this.recordHistory(todoId, callerId, 'team_unassigned', tname, null);
      this.eventEmitter.emit('todo.team_unassigned', new TodoTeamUnassignedEvent(todo, callerId, targetTeamId));
    }

    return { assignees: this.getAssignees(todoId) };
  }

  /** Move a todo between personal inbox and a team inbox (or between team inboxes). Cascades to subtasks. */
  moveTodo(
    id: string,
    dto: { projectId?: string; toInbox?: boolean },
    callerId: string,
    callerRole: string,
  ) {
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, callerId, callerRole)) throw new ForbiddenException();

    const fromProjectId: string | null = todo.project_id ?? null;
    const toProjectId: string | null = dto.projectId ?? null;

    if (dto.toInbox) {
      // Move to caller's personal inbox
      this.db.prepare(
        `UPDATE todos SET is_inbox = 1, inbox_user_id = ?, project_id = NULL, updated_at = unixepoch() WHERE id = ?`,
      ).run(callerId, id);
      this.db.prepare(
        `UPDATE todos SET is_inbox = 1, inbox_user_id = ?, project_id = NULL, updated_at = unixepoch() WHERE parent_todo_id = ?`,
      ).run(callerId, id);

    } else if (dto.projectId) {
      // Move to a team inbox (or between team inboxes)
      this.db.prepare(
        `UPDATE todos SET is_inbox = 0, inbox_user_id = NULL, project_id = ?, updated_at = unixepoch() WHERE id = ?`,
      ).run(dto.projectId, id);
      this.db.prepare(
        `UPDATE todos SET is_inbox = 0, inbox_user_id = NULL, project_id = ?, updated_at = unixepoch() WHERE parent_todo_id = ?`,
      ).run(dto.projectId, id);
    }

    this.eventEmitter.emit('todo.moved', new TodoMovedEvent(todo, callerId, fromProjectId, toProjectId));

    const fromLabel = fromProjectId ? (this.db.prepare('SELECT name FROM projects WHERE id = ?').get(fromProjectId) as any)?.name ?? fromProjectId : 'Personal Inbox';
    const toLabel   = toProjectId   ? (this.db.prepare('SELECT name FROM projects WHERE id = ?').get(toProjectId)   as any)?.name ?? toProjectId   : 'Personal Inbox';
    this.recordHistory(id, callerId, 'moved', fromLabel, toLabel);

    return this.findById(id, callerId, callerRole);
  }

  advanceFlow(id: string, userId: string, userRole: string) {
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, userId, userRole)) throw new ForbiddenException();

    let steps: string[] = ['New', 'In Progress', 'Done'];
    if (todo.project_id) {
      const project = this.db.prepare('SELECT flow_steps FROM projects WHERE id = ?').get(todo.project_id) as any;
      if (project) steps = JSON.parse(project.flow_steps);
    }

    const nextIndex = Math.min(todo.flow_step_index + 1, steps.length - 1);
    const isFinal = nextIndex >= steps.length - 1;

    this.db.prepare('UPDATE todos SET flow_step_index = ?, updated_at = unixepoch() WHERE id = ?')
      .run(nextIndex, id);

    let spawnedId: string | null = null;
    if (isFinal && todo.is_recurring && todo.recurrence_rule) {
      spawnedId = this.spawnNextRecurrence(todo, userId);
    }

    this.recordHistory(id, userId, 'status', this.stepName(steps[todo.flow_step_index]), this.stepName(steps[nextIndex]));
    this.eventEmitter.emit('todo.flow_changed', new TodoFlowChangedEvent(
      todo, userId, this.stepName(steps[nextIndex]), isFinal, false,
    ));

    const updated = this.findById(id, userId, userRole);
    const spawned = spawnedId ? this.findById(spawnedId, userId, userRole) : null;
    return spawned ? { ...updated, _spawned: spawned } : updated;
  }

  completeFlow(id: string, userId: string, userRole: string) {
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, userId, userRole)) throw new ForbiddenException();

    let steps: string[] = ['New', 'In Progress', 'Done'];
    if (todo.project_id) {
      const project = this.db.prepare('SELECT flow_steps FROM projects WHERE id = ?').get(todo.project_id) as any;
      if (project) steps = JSON.parse(project.flow_steps);
    }

    this.db.prepare('UPDATE todos SET flow_step_index = ?, updated_at = unixepoch() WHERE id = ?')
      .run(steps.length - 1, id);

    let spawnedId: string | null = null;
    if (todo.is_recurring && todo.recurrence_rule) {
      spawnedId = this.spawnNextRecurrence(todo, userId);
    }

    this.recordHistory(id, userId, 'status', this.stepName(steps[todo.flow_step_index]), this.stepName(steps[steps.length - 1]));
    this.eventEmitter.emit('todo.flow_changed', new TodoFlowChangedEvent(
      todo, userId, this.stepName(steps[steps.length - 1]), true, false,
    ));

    const updated = this.findById(id, userId, userRole);
    const spawned = spawnedId ? this.findById(spawnedId, userId, userRole) : null;
    return spawned ? { ...updated, _spawned: spawned } : updated;
  }

  setStep(id: string, stepIndex: number, userId: string, userRole: string) {
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, userId, userRole)) throw new ForbiddenException();

    let steps: string[] = ['New', 'In Progress', 'Done'];
    if (todo.project_id) {
      const project = this.db.prepare('SELECT flow_steps FROM projects WHERE id = ?').get(todo.project_id) as any;
      if (project) steps = JSON.parse(project.flow_steps);
    }

    const clamped = Math.max(0, Math.min(stepIndex, steps.length - 1));
    this.db.prepare('UPDATE todos SET flow_step_index = ?, updated_at = unixepoch() WHERE id = ?')
      .run(clamped, id);

    const isUndone = stepIndex === 0;
    if (clamped !== todo.flow_step_index) {
      this.recordHistory(id, userId, 'status', this.stepName(steps[todo.flow_step_index]), this.stepName(steps[clamped]));
    }
    this.eventEmitter.emit('todo.flow_changed', new TodoFlowChangedEvent(
      todo, userId, this.stepName(steps[clamped]), clamped >= steps.length - 1, isUndone,
    ));

    return this.findById(id, userId, userRole);
  }

  private stepName(raw: any): string {
    if (!raw) return 'Unknown';
    return typeof raw === 'string' ? raw : (raw.label ?? 'Unknown');
  }

  static nextRecurrenceDate(base: Date, rule: { type: string; interval: number }): Date {
    const next = new Date(base);
    if (rule.type === 'daily') {
      next.setDate(next.getDate() + rule.interval);
    } else if (rule.type === 'weekly') {
      next.setDate(next.getDate() + rule.interval * 7);
    } else if (rule.type === 'monthly') {
      const originalDay = base.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + rule.interval);
      const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(originalDay, daysInMonth));
    } else if (rule.type === 'yearly') {
      const originalDay = base.getDate();
      const originalMonth = base.getMonth();
      next.setDate(1);
      next.setFullYear(next.getFullYear() + rule.interval);
      next.setMonth(originalMonth);
      const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(originalDay, daysInMonth));
    }
    return next;
  }

  private spawnNextRecurrence(todo: any, userId: string): string | null {
    // The cron may have already created a child for this task — don't duplicate.
    const alreadySpawned = this.db
      .prepare('SELECT 1 FROM todos WHERE recurrence_parent_id = ?')
      .get(todo.id);
    if (alreadySpawned) return null;

    const rule = JSON.parse(todo.recurrence_rule);
    const base = todo.due_date ? new Date(todo.due_date * 1000) : new Date();
    const next = TodosService.nextRecurrenceDate(base, rule);

    const id = uuidv4();
    const nextDueSec = Math.floor(next.getTime() / 1000);
    this.db.prepare(`
      INSERT INTO todos (
        id, project_id, parent_todo_id, title, description,
        due_date, is_recurring, recurrence_rule, recurrence_parent_id,
        sort_order, is_inbox, inbox_user_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, todo.project_id, todo.parent_todo_id, todo.title, todo.description,
      nextDueSec,
      1, todo.recurrence_rule, todo.id,
      todo.sort_order, todo.is_inbox, todo.inbox_user_id, userId,
    );
    this.upsertAutoDueReminder(id, userId, nextDueSec);
    return id;
  }

  private upsertAutoDueReminder(todoId: string, userId: string, remindAt: number): void {
    const existing = this.db.prepare(
      "SELECT id FROM todo_reminders WHERE todo_id = ? AND label = '__auto_due__'",
    ).get(todoId) as any;
    if (existing) {
      this.db.prepare(
        'UPDATE todo_reminders SET remind_at = ?, sent = 0 WHERE id = ?',
      ).run(remindAt, existing.id);
    } else {
      this.db.prepare(`
        INSERT INTO todo_reminders (id, todo_id, user_id, remind_at, label, sent, created_at)
        VALUES (?, ?, ?, ?, '__auto_due__', 0, unixepoch())
      `).run(uuidv4(), todoId, userId, remindAt);
    }
  }

  reorder(updates: { id: string; sortOrder: number }[]) {
    this.db.transaction(() => {
      for (const u of updates) {
        this.db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?').run(u.sortOrder, u.id);
      }
    });
  }

  delete(id: string, userId: string, userRole: string) {
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, userId, userRole)) throw new ForbiddenException();

    this.eventEmitter.emit('todo.deleted', new TodoDeletedEvent(todo, userId));
    this.db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  }

  private parse(row: any) {
    return {
      ...row,
      is_recurring: !!row.is_recurring,
      is_inbox: !!row.is_inbox,
      recurrence_rule: row.recurrence_rule ? JSON.parse(row.recurrence_rule) : null,
    };
  }

  // ── Todo attachments ────────────────────────────────────────────────────────

  getTodoAttachments(todoId: string) {
    return this.db.prepare(
      'SELECT * FROM todo_attachments WHERE todo_id = ? ORDER BY created_at',
    ).all(todoId);
  }

  addTodoAttachment(
    todoId: string,
    file: { filename: string; originalname: string; mimetype: string; size: number; path: string },
    userId: string,
  ) {
    this.checkAllowedExtension(file.originalname, file.path);
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO todo_attachments (id, todo_id, filename, original_name, mimetype, size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, todoId, file.filename, file.originalname, file.mimetype, file.size, userId);
    return this.db.prepare('SELECT * FROM todo_attachments WHERE id = ?').get(id);
  }

  deleteTodoAttachment(id: string, userId: string, userRole: string) {
    const att = this.db.prepare('SELECT * FROM todo_attachments WHERE id = ?').get(id) as any;
    if (!att) throw new NotFoundException();
    if (userRole !== 'admin' && att.uploaded_by !== userId) throw new ForbiddenException();
    this.db.prepare('DELETE FROM todo_attachments WHERE id = ?').run(id);
    const filePath = join(process.cwd(), 'uploads', att.filename);
    if (existsSync(filePath)) { try { unlinkSync(filePath); } catch (_) {} }
  }

  getAllowedExtensions(): string[] {
    const row = this.db.prepare(
      "SELECT value FROM app_settings WHERE key = 'allowed_upload_extensions'",
    ).get() as any;
    return (row?.value ?? 'jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,txt,zip')
      .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
  }

  checkAllowedExtension(originalname: string, uploadedPath: string) {
    const ext = extname(originalname).slice(1).toLowerCase();
    if (!this.getAllowedExtensions().includes(ext)) {
      try { unlinkSync(uploadedPath); } catch (_) {}
      throw new BadRequestException(`File type .${ext} is not allowed`);
    }
  }
}
