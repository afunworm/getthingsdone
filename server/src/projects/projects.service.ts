import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

type Permission = 'view' | 'create' | 'complete' | 'manage';

@Injectable()
export class ProjectsService {
  constructor(private readonly db: DatabaseService) {}

  private userCanAccess(projectId: string, userId: string): boolean {
    const project = this.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) return false;
    if (project.owner_id === userId) return true;

    const directMember = this.db.prepare(
      'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
    ).get(projectId, userId);
    if (directMember) return true;

    const teamMember = this.db.prepare(`
      SELECT 1 FROM project_members pm
      JOIN team_members tm ON tm.team_id = pm.team_id
      WHERE pm.project_id = ? AND tm.user_id = ?
    `).get(projectId, userId);
    return !!teamMember;
  }

  private getUserPermissions(projectId: string, userId: string): Permission[] {
    const project = this.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) return [];
    if (project.owner_id === userId) return ['view', 'create', 'complete', 'manage'];

    const direct = this.db.prepare(
      'SELECT permissions FROM project_members WHERE project_id = ? AND user_id = ?',
    ).get(projectId, userId) as any;
    if (direct) return JSON.parse(direct.permissions);

    const team = this.db.prepare(`
      SELECT pm.permissions FROM project_members pm
      JOIN team_members tm ON tm.team_id = pm.team_id
      WHERE pm.project_id = ? AND tm.user_id = ?
      ORDER BY length(pm.permissions) DESC LIMIT 1
    `).get(projectId, userId) as any;
    if (team) return JSON.parse(team.permissions);

    return [];
  }

  private parseWithPrefs(row: any) {
    const { pref_show_count, pref_count_mode, pref_highlight, new_task_count, all_task_count, ...rest } = row;
    return {
      ...this.parse(rest),
      new_task_count: new_task_count ?? 0,
      all_task_count: all_task_count ?? 0,
      user_pref: {
        show_task_count: !!pref_show_count,
        count_mode: pref_count_mode ?? 'new',
        highlight_color: pref_highlight ?? null,
      },
    };
  }

  findAll(userId: string, userRole: string) {
    const prefJoin = `LEFT JOIN user_project_prefs upr ON upr.project_id = p.id AND upr.user_id = ?`;
    const prefCols = `
      COALESCE(upr.show_task_count, 1) as pref_show_count,
      COALESCE(upr.count_mode, 'new') as pref_count_mode,
      upr.highlight_color as pref_highlight,
      (SELECT COUNT(*) FROM todos t WHERE t.project_id = p.id AND t.parent_todo_id IS NULL AND t.flow_step_index = 0) as new_task_count,
      (SELECT COUNT(*) FROM todos t WHERE t.project_id = p.id AND t.parent_todo_id IS NULL) as all_task_count
    `;

    if (userRole === 'admin') {
      return this.db.prepare(`
        SELECT p.*, u.name as owner_name,
          (SELECT COUNT(*) FROM todos t WHERE t.project_id = p.id AND t.parent_todo_id IS NULL) as todo_count,
          (1 + (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL)) as user_count,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id AND pm.team_id IS NOT NULL) as team_count,
          ${prefCols}
        FROM projects p JOIN users u ON u.id = p.owner_id
        ${prefJoin}
        ORDER BY p.updated_at DESC
      `).all(userId).map((r) => this.parseWithPrefs(r));
    }

    return this.db.prepare(`
      SELECT DISTINCT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM todos t WHERE t.project_id = p.id AND t.parent_todo_id IS NULL) as todo_count,
        (1 + (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id IS NOT NULL)) as user_count,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id AND pm.team_id IS NOT NULL) as team_count,
        ${prefCols}
      FROM projects p JOIN users u ON u.id = p.owner_id
      ${prefJoin}
      WHERE p.owner_id = ?
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?)
        OR EXISTS (
          SELECT 1 FROM project_members pm
          JOIN team_members tm ON tm.team_id = pm.team_id
          WHERE pm.project_id = p.id AND tm.user_id = ?
        )
      ORDER BY p.updated_at DESC
    `).all(userId, userId, userId, userId).map((r) => this.parseWithPrefs(r));
  }

  findById(id: string, userId: string, userRole: string) {
    if (userRole !== 'admin' && !this.userCanAccess(id, userId)) {
      throw new ForbiddenException();
    }
    const project = this.db.prepare(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM todos t WHERE t.project_id = p.id AND t.parent_todo_id IS NULL AND t.flow_step_index = 0) as new_task_count,
        (SELECT COUNT(*) FROM todos t WHERE t.project_id = p.id AND t.parent_todo_id IS NULL) as all_task_count,
        COALESCE(upr.show_task_count, 1) as pref_show_count,
        COALESCE(upr.count_mode, 'new') as pref_count_mode,
        upr.highlight_color as pref_highlight
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN user_project_prefs upr ON upr.project_id = p.id AND upr.user_id = ?
      WHERE p.id = ?
    `).get(userId, id) as any;
    if (!project) throw new NotFoundException();

    const members = this.db.prepare(`
      SELECT pm.*, u.name as user_name, u.email as user_email, t.name as team_name
      FROM project_members pm
      LEFT JOIN users u ON u.id = pm.user_id
      LEFT JOIN teams t ON t.id = pm.team_id
      WHERE pm.project_id = ?
    `).all(id).map((m: any) => ({ ...m, permissions: JSON.parse(m.permissions) }));

    const { pref_show_count, pref_count_mode, pref_highlight, new_task_count, all_task_count, ...projectRest } = project;

    return {
      ...this.parse(projectRest),
      new_task_count: new_task_count ?? 0,
      all_task_count: all_task_count ?? 0,
      user_pref: {
        show_task_count: !!pref_show_count,
        count_mode: pref_count_mode ?? 'new',
        highlight_color: pref_highlight ?? null,
      },
      members,
      myPermissions: this.getUserPermissions(id, userId),
    };
  }

  create(dto: {
    name: string;
    description?: string;
    flowTemplateId?: string;
    dueDate?: number;
    color?: string;
    emoji?: string;
    memberUserIds?: string[];
    memberTeamIds?: string[];
  }, userId: string) {
    const id = uuidv4();
    let flowSteps = '["New","In Progress","Done"]';
    let flowTemplateId: string | null = null;

    if (dto.flowTemplateId) {
      const flow = this.db.prepare('SELECT * FROM flow_templates WHERE id = ?').get(dto.flowTemplateId) as any;
      if (!flow) throw new BadRequestException('Flow template not found');
      flowSteps = flow.steps;
      flowTemplateId = dto.flowTemplateId;
    } else {
      const defaultFlow = this.db.prepare('SELECT * FROM flow_templates WHERE is_default = 1 LIMIT 1').get() as any;
      if (defaultFlow) {
        flowSteps = defaultFlow.steps;
        flowTemplateId = defaultFlow.id;
      }
    }

    this.db.prepare(`
      INSERT INTO projects (id, name, description, owner_id, flow_template_id, flow_steps, due_date, color, emoji)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, dto.name, dto.description ?? null, userId, flowTemplateId, flowSteps, dto.dueDate ?? null,
      dto.color ?? '#6366f1', dto.emoji ?? null);

    for (const uid of dto.memberUserIds ?? []) {
      const mid = uuidv4();
      this.db.prepare(`INSERT OR IGNORE INTO project_members (id, project_id, user_id, permissions) VALUES (?, ?, ?, ?)`)
        .run(mid, id, uid, '["view","create","complete"]');
    }
    for (const tid of dto.memberTeamIds ?? []) {
      const mid = uuidv4();
      this.db.prepare(`INSERT OR IGNORE INTO project_members (id, project_id, team_id, permissions) VALUES (?, ?, ?, ?)`)
        .run(mid, id, tid, '["view","create","complete"]');
    }

    return this.findById(id, userId, 'user');
  }

  update(id: string, dto: {
    name?: string; description?: string | null; dueDate?: number | null;
    color?: string; emoji?: string | null; flowTemplateId?: string;
  }, userId: string, userRole: string) {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) throw new NotFoundException();
    if (userRole !== 'admin' && project.owner_id !== userId) throw new ForbiddenException();

    let flowTemplateId = project.flow_template_id;
    let flowSteps = project.flow_steps;

    if (dto.flowTemplateId && dto.flowTemplateId !== project.flow_template_id) {
      if (userRole !== 'admin') throw new ForbiddenException();
      const flow = this.db.prepare('SELECT * FROM flow_templates WHERE id = ?').get(dto.flowTemplateId) as any;
      if (!flow) throw new BadRequestException('Flow template not found');
      flowTemplateId = flow.id;
      flowSteps = flow.steps;
    }

    this.db.prepare(`
      UPDATE projects SET
        name = COALESCE(?, name),
        description = ?,
        due_date = ?,
        color = COALESCE(?, color),
        emoji = ?,
        flow_template_id = ?,
        flow_steps = ?,
        updated_at = unixepoch()
      WHERE id = ?
    `).run(
      dto.name ?? null,
      dto.description !== undefined ? dto.description : project.description,
      dto.dueDate !== undefined ? dto.dueDate : project.due_date,
      dto.color ?? null,
      dto.emoji !== undefined ? dto.emoji : project.emoji,
      flowTemplateId,
      flowSteps,
      id,
    );

    return this.findById(id, userId, userRole);
  }

  transferOwnership(id: string, newOwnerId: string, currentUserId: string, userRole: string) {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) throw new NotFoundException();
    if (userRole !== 'admin' && project.owner_id !== currentUserId) throw new ForbiddenException();

    const newOwner = this.db.prepare('SELECT 1 FROM users WHERE id = ?').get(newOwnerId);
    if (!newOwner) throw new BadRequestException('New owner not found');

    this.db.transaction(() => {
      const oldOwnerId = project.owner_id;

      // Demote old owner to a regular member (unless they're already a member)
      const alreadyMember = this.db.prepare(
        'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
      ).get(id, oldOwnerId);
      if (!alreadyMember) {
        this.db.prepare(
          'INSERT INTO project_members (id, project_id, user_id, permissions) VALUES (?, ?, ?, ?)',
        ).run(uuidv4(), id, oldOwnerId, '["view","create","complete"]');
      }

      // Remove new owner from members if they were one (they become owner instead)
      this.db.prepare(
        'DELETE FROM project_members WHERE project_id = ? AND user_id = ?',
      ).run(id, newOwnerId);

      this.db.prepare('UPDATE projects SET owner_id = ?, updated_at = unixepoch() WHERE id = ?')
        .run(newOwnerId, id);
    });

    return this.findById(id, currentUserId, userRole);
  }

  addMember(
    projectId: string,
    dto: { userId?: string; teamId?: string; permissions: Permission[] },
    requesterId: string,
    requesterRole: string,
  ) {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) throw new NotFoundException();
    if (requesterRole !== 'admin' && project.owner_id !== requesterId) throw new ForbiddenException();

    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO project_members (id, project_id, user_id, team_id, permissions)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(id, projectId, dto.userId ?? null, dto.teamId ?? null, JSON.stringify(dto.permissions));

    return this.findById(projectId, requesterId, requesterRole);
  }

  removeMember(projectId: string, memberId: string, requesterId: string, requesterRole: string) {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) throw new NotFoundException();
    if (requesterRole !== 'admin' && project.owner_id !== requesterId) throw new ForbiddenException();
    this.db.prepare('DELETE FROM project_members WHERE id = ? AND project_id = ?').run(memberId, projectId);
    return this.findById(projectId, requesterId, requesterRole);
  }

  getAccessibleUsers(projectId: string, requesterId: string, requesterRole: string) {
    if (requesterRole !== 'admin' && !this.userCanAccess(projectId, requesterId)) {
      throw new ForbiddenException();
    }
    const project = this.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) throw new NotFoundException();

    return this.db.prepare(`
      SELECT DISTINCT u.id, u.name FROM users u WHERE u.id = ?
      UNION
      SELECT DISTINCT u.id, u.name FROM users u
        JOIN project_members pm ON pm.user_id = u.id WHERE pm.project_id = ?
      UNION
      SELECT DISTINCT u.id, u.name FROM users u
        JOIN team_members tm ON tm.user_id = u.id
        JOIN project_members pm ON pm.team_id = tm.team_id WHERE pm.project_id = ?
      ORDER BY name
    `).all(project.owner_id, projectId, projectId);
  }

  delete(id: string, userId: string, userRole: string) {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) throw new NotFoundException();
    if (userRole !== 'admin' && project.owner_id !== userId) throw new ForbiddenException();
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  // ── Sidebar order ────────────────────────────────────────────────────────────

  getOrder(userId: string): string[] {
    const row = this.db.prepare(
      'SELECT project_ids FROM user_project_order WHERE user_id = ?',
    ).get(userId) as any;
    return row ? JSON.parse(row.project_ids) : [];
  }

  saveOrder(userId: string, projectIds: string[]): void {
    this.db.prepare(`
      INSERT INTO user_project_order (user_id, project_ids, updated_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(user_id) DO UPDATE SET
        project_ids = excluded.project_ids,
        updated_at = unixepoch()
    `).run(userId, JSON.stringify(projectIds));
  }

  // ── Per-user per-inbox display prefs ─────────────────────────────────────────

  getPrefs(userId: string, projectId: string): any {
    const row = this.db.prepare(
      'SELECT * FROM user_project_prefs WHERE user_id = ? AND project_id = ?',
    ).get(userId, projectId) as any;
    if (!row) return { show_task_count: false, count_mode: 'new', highlight_color: null };
    return {
      show_task_count: !!row.show_task_count,
      count_mode: row.count_mode ?? 'new',
      highlight_color: row.highlight_color ?? null,
    };
  }

  updatePrefs(
    userId: string,
    projectId: string,
    dto: { show_task_count?: boolean; count_mode?: string; highlight_color?: string | null },
  ): any {
    const existing = this.getPrefs(userId, projectId);
    const show = dto.show_task_count !== undefined ? dto.show_task_count : existing.show_task_count;
    const mode = dto.count_mode !== undefined ? dto.count_mode : existing.count_mode;
    const color = dto.highlight_color !== undefined ? dto.highlight_color : existing.highlight_color;

    this.db.prepare(`
      INSERT INTO user_project_prefs (user_id, project_id, show_task_count, count_mode, highlight_color)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, project_id) DO UPDATE SET
        show_task_count = excluded.show_task_count,
        count_mode = excluded.count_mode,
        highlight_color = excluded.highlight_color
    `).run(userId, projectId, show ? 1 : 0, mode, color ?? null);

    return this.getPrefs(userId, projectId);
  }

  private parse(row: any) {
    return { ...row, flow_steps: JSON.parse(row.flow_steps) };
  }
}
