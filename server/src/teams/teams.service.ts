import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TeamsService {
  constructor(private readonly db: DatabaseService) {}

  findMine(userId: string) {
    return this.db.prepare(`
      SELECT t.id, t.name FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ?
      ORDER BY t.name
    `).all(userId) as { id: string; name: string }[];
  }

  findAll() {
    return this.db.prepare(`
      SELECT t.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
      FROM teams t
      JOIN users u ON u.id = t.created_by
      ORDER BY t.name
    `).all();
  }

  findById(id: string) {
    const team = this.db.prepare(`
      SELECT t.*, u.name as created_by_name
      FROM teams t JOIN users u ON u.id = t.created_by
      WHERE t.id = ?
    `).get(id) as any;
    if (!team) throw new NotFoundException('Team not found');

    const members = this.db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url, tm.role, tm.joined_at
      FROM team_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
      ORDER BY u.name
    `).all(id);

    return { ...team, members };
  }

  create(dto: { name: string; description?: string }, userId: string) {
    const id = uuidv4();
    this.db.prepare('INSERT INTO teams (id, name, description, created_by) VALUES (?, ?, ?, ?)')
      .run(id, dto.name, dto.description ?? null, userId);
    this.db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)')
      .run(id, userId, 'lead');
    return this.findById(id);
  }

  update(id: string, dto: { name?: string; description?: string }, userId: string) {
    const team = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as any;
    if (!team) throw new NotFoundException('Team not found');
    const member = this.db.prepare(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
    ).get(id, userId) as any;
    if (!member || member.role !== 'lead') throw new ForbiddenException();

    this.db.prepare(`
      UPDATE teams SET name = COALESCE(?, name), description = COALESCE(?, description),
      updated_at = unixepoch() WHERE id = ?
    `).run(dto.name ?? null, dto.description ?? null, id);
    return this.findById(id);
  }

  addMember(teamId: string, userId: string, role: 'member' | 'lead' = 'member') {
    this.db.prepare(`
      INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)
      ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role
    `).run(teamId, userId, role);
    return this.findById(teamId);
  }

  removeMember(teamId: string, userId: string) {
    this.db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);
    return this.findById(teamId);
  }

  delete(id: string, userId: string) {
    const team = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as any;
    if (!team) throw new NotFoundException('Team not found');
    if (team.created_by !== userId) throw new ForbiddenException();
    this.db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  }
}
