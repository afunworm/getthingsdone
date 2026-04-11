import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import {
  TodoCreatedEvent, TodoUpdatedEvent, TodoDeletedEvent, TodoMovedEvent,
  TodoFlowChangedEvent, TodoUserAssignedEvent, TodoTeamAssignedEvent,
  TodoUserUnassignedEvent, TodoTeamUnassignedEvent,
} from './todo.events';
import { v4 as uuidv4 } from 'uuid';

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

  findByProject(projectId: string, userId: string, userRole: string) {
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
      SELECT t.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM todo_reminders WHERE todo_id = t.id AND user_id = ? AND sent = 0) as reminder_count
      FROM todos t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.project_id = ? AND t.parent_todo_id IS NULL
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
      SELECT t.*, u.name as created_by_name
      FROM todos t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = ?
    `).get(id) as any;
    if (!todo) throw new NotFoundException();
    if (!this.canAccess(todo, userId, userRole)) throw new ForbiddenException();
    return {
      ...this.parse(todo),
      assignees: this.getAssignees(id),
      subtodos: this.getSubtodos(id),
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
        due_date, is_recurring, recurrence_rule, sort_order, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    );
    const created = this.findById(id, userId, userRole);
    this.eventEmitter.emit('todo.created', new TodoCreatedEvent(created, userId));
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
      this.eventEmitter.emit('todo.user_assigned', new TodoUserAssignedEvent(todo, callerId, dto.userId));
    }
    if (dto.teamId) {
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
      this.db.prepare('DELETE FROM todo_assignees WHERE todo_id = ? AND user_id = ?').run(todoId, targetUserId);
      this.eventEmitter.emit('todo.user_unassigned', new TodoUserUnassignedEvent(todo, callerId, targetUserId));
    } else if (targetTeamId) {
      this.db.prepare('DELETE FROM todo_assignees WHERE todo_id = ? AND team_id = ?').run(todoId, targetTeamId);
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

    if (isFinal && todo.is_recurring && todo.recurrence_rule) {
      this.spawnNextRecurrence(todo, userId);
    }

    this.eventEmitter.emit('todo.flow_changed', new TodoFlowChangedEvent(
      todo, userId, this.stepName(steps[nextIndex]), isFinal, false,
    ));

    return this.findById(id, userId, userRole);
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

    if (todo.is_recurring && todo.recurrence_rule) {
      this.spawnNextRecurrence(todo, userId);
    }

    this.eventEmitter.emit('todo.flow_changed', new TodoFlowChangedEvent(
      todo, userId, this.stepName(steps[steps.length - 1]), true, false,
    ));

    return this.findById(id, userId, userRole);
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
    this.eventEmitter.emit('todo.flow_changed', new TodoFlowChangedEvent(
      todo, userId, this.stepName(steps[clamped]), clamped >= steps.length - 1, isUndone,
    ));

    return this.findById(id, userId, userRole);
  }

  private stepName(raw: any): string {
    if (!raw) return 'Unknown';
    return typeof raw === 'string' ? raw : (raw.label ?? 'Unknown');
  }

  private spawnNextRecurrence(todo: any, userId: string) {
    // The cron may have already created a child for this task — don't duplicate.
    const alreadySpawned = this.db
      .prepare('SELECT 1 FROM todos WHERE recurrence_parent_id = ?')
      .get(todo.id);
    if (alreadySpawned) return;

    const rule = JSON.parse(todo.recurrence_rule);
    const base = todo.due_date ? todo.due_date * 1000 : Date.now();
    const next = new Date(base);

    if (rule.type === 'daily') next.setDate(next.getDate() + rule.interval);
    else if (rule.type === 'weekly') next.setDate(next.getDate() + rule.interval * 7);
    else if (rule.type === 'monthly') next.setMonth(next.getMonth() + rule.interval);

    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO todos (
        id, project_id, parent_todo_id, title, description,
        due_date, is_recurring, recurrence_rule, recurrence_parent_id,
        sort_order, is_inbox, inbox_user_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, todo.project_id, todo.parent_todo_id, todo.title, todo.description,
      Math.floor(next.getTime() / 1000),
      1, todo.recurrence_rule, todo.id,
      todo.sort_order, todo.is_inbox, todo.inbox_user_id, userId,
    );
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
}
