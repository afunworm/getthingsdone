import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTokenGuard } from './api-token.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TodosService } from '../todos/todos.service';
import { InboxService } from '../inbox/inbox.service';
import { DatabaseService } from '../database/database.service';

@Controller('v1')
@UseGuards(ApiTokenGuard)
export class RestApiController {
  constructor(
    private readonly todos: TodosService,
    private readonly inbox: InboxService,
    private readonly db: DatabaseService,
  ) {}

  // ── Meta ──────────────────────────────────────────────

  @Get('whoami')
  whoami(@CurrentUser() user: any) {
    const u = this.db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(user.id) as any;
    return u;
  }

  // ── Projects ──────────────────────────────────────────

  @Get('projects')
  listProjects(@CurrentUser() user: any) {
    if (user.role === 'admin') {
      return this.db.prepare(`
        SELECT p.id, p.name, p.description, p.color, p.emoji, p.flow_steps,
               u.name AS owner_name
        FROM projects p LEFT JOIN users u ON u.id = p.owner_id
        ORDER BY p.name
      `).all().map((p: any) => ({ ...p, flow_steps: JSON.parse(p.flow_steps) }));
    }
    return this.db.prepare(`
      SELECT DISTINCT p.id, p.name, p.description, p.color, p.emoji, p.flow_steps,
             u.name AS owner_name
      FROM projects p
      LEFT JOIN users u ON u.id = p.owner_id
      LEFT JOIN project_members pm ON pm.project_id = p.id
      LEFT JOIN team_members tm ON tm.team_id = pm.team_id
      WHERE p.owner_id = ? OR pm.user_id = ? OR tm.user_id = ?
      ORDER BY p.name
    `).all(user.id, user.id, user.id)
      .map((p: any) => ({ ...p, flow_steps: JSON.parse(p.flow_steps) }));
  }

  // ── Tasks ─────────────────────────────────────────────

  /**
   * List tasks.
   * Query params:
   *   project_id  – list tasks in a team inbox
   *   inbox=true  – list personal inbox tasks (default if no project_id)
   *   status      – 0 | 1 | 2  filter by flow_step_index
   *   priority    – 0–3 filter by priority
   */
  @Get('tasks')
  listTasks(@CurrentUser() user: any, @Query() q: any) {
    if (q.project_id) {
      let tasks = this.todos.findByProject(q.project_id, user.id, user.role) as any[];
      if (q.status !== undefined) tasks = tasks.filter((t) => t.flow_step_index === +q.status);
      if (q.priority !== undefined) tasks = tasks.filter((t) => (t.priority ?? 0) === +q.priority);
      return tasks;
    }
    // Default: personal inbox
    let tasks = this.inbox.findAll(user.id) as any[];
    if (q.status !== undefined) tasks = tasks.filter((t: any) => t.flow_step_index === +q.status);
    if (q.priority !== undefined) tasks = tasks.filter((t: any) => (t.priority ?? 0) === +q.priority);
    return tasks;
  }

  @Get('tasks/:id')
  getTask(@Param('id') id: string, @CurrentUser() user: any) {
    return this.todos.findById(id, user.id, user.role);
  }

  /**
   * Create a task.
   * Body:
   *   title        (required)
   *   description
   *   project_id   – create in team inbox; omit for personal inbox
   *   due_date     – unix timestamp (seconds)
   *   priority     – 0 (none) | 1 (low) | 2 (medium) | 3 (urgent)
   */
  @Post('tasks')
  @HttpCode(HttpStatus.CREATED)
  createTask(@Body() dto: any, @CurrentUser() user: any) {
    if (dto.project_id) {
      const task = this.todos.create(
        {
          title: dto.title,
          description: dto.description,
          projectId: dto.project_id,
          dueDate: dto.due_date,
          sortOrder: dto.sort_order,
          apiTokenId: user.apiTokenId,
        },
        user.id,
        user.role,
      );
      if (dto.priority) {
        return this.todos.update(task.id, { priority: dto.priority }, user.id, user.role);
      }
      return task;
    }

    // Personal inbox
    const task = this.inbox.create(
      {
        title: dto.title,
        description: dto.description,
        dueDate: dto.due_date,
        sortOrder: dto.sort_order,
        apiTokenId: user.apiTokenId,
      },
      user.id,
    );

    if (dto.priority) {
      return this.todos.update((task as any).id, { priority: dto.priority }, user.id, user.role);
    }
    return task;
  }

  /**
   * Update a task.
   * Body (all optional):
   *   title, description, due_date, priority, flow_step_index, project_id
   */
  @Patch('tasks/:id')
  updateTask(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    const update: any = {};
    if ('title'       in dto) update.title       = dto.title;
    if ('description' in dto) update.description = dto.description;
    if ('due_date'    in dto) update.dueDate      = dto.due_date;
    if ('priority'    in dto) update.priority     = dto.priority;
    if ('project_id'  in dto) update.projectId    = dto.project_id;
    if ('sort_order'  in dto) update.sortOrder    = dto.sort_order;

    const task = this.todos.update(id, update, user.id, user.role);

    if ('flow_step_index' in dto) {
      return this.todos.setStep(id, dto.flow_step_index, user.id, user.role);
    }
    return task;
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTask(@Param('id') id: string, @CurrentUser() user: any) {
    this.todos.delete(id, user.id, user.role);
  }
}
