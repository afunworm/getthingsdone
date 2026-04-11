import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FlowsService {
  constructor(private readonly db: DatabaseService) {}

  findAll() {
    return this.db.prepare(`
      SELECT f.*, u.name as created_by_name
      FROM flow_templates f JOIN users u ON u.id = f.created_by
      ORDER BY f.is_default DESC, f.name
    `).all().map(this.parse);
  }

  findById(id: string) {
    const flow = this.db.prepare(`
      SELECT f.*, u.name as created_by_name
      FROM flow_templates f JOIN users u ON u.id = f.created_by
      WHERE f.id = ?
    `).get(id);
    if (!flow) throw new NotFoundException('Flow template not found');
    return this.parse(flow);
  }

  create(dto: { name: string; steps: any[] }, userId: string) {
    if (!dto.steps || dto.steps.length < 2)
      throw new BadRequestException('Flow must have at least 2 steps');
    const id = uuidv4();
    const isFirst = !(this.db.prepare('SELECT 1 FROM flow_templates LIMIT 1').get());
    this.db.prepare(`
      INSERT INTO flow_templates (id, name, steps, is_default, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, dto.name, JSON.stringify(dto.steps), isFirst ? 1 : 0, userId);
    return this.findById(id);
  }

  update(id: string, dto: { name?: string; steps?: any[] }) {
    if (!this.db.prepare('SELECT 1 FROM flow_templates WHERE id = ?').get(id))
      throw new NotFoundException();
    if (dto.steps && dto.steps.length < 2)
      throw new BadRequestException('Flow must have at least 2 steps');

    const stepsJson = dto.steps ? JSON.stringify(dto.steps) : null;
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE flow_templates SET
          name = COALESCE(?, name),
          steps = COALESCE(?, steps),
          updated_at = unixepoch()
        WHERE id = ?
      `).run(dto.name ?? null, stepsJson, id);

      if (stepsJson) {
        this.db.prepare(`
          UPDATE projects SET flow_steps = ?, updated_at = unixepoch()
          WHERE flow_template_id = ?
        `).run(stepsJson, id);
      }
    });

    return this.findById(id);
  }

  setDefault(id: string) {
    if (!this.db.prepare('SELECT 1 FROM flow_templates WHERE id = ?').get(id))
      throw new NotFoundException();
    this.db.transaction(() => {
      this.db.prepare('UPDATE flow_templates SET is_default = 0').run();
      this.db.prepare('UPDATE flow_templates SET is_default = 1 WHERE id = ?').run(id);
    });
    return this.findById(id);
  }

  delete(id: string) {
    if (!this.db.prepare('SELECT 1 FROM flow_templates WHERE id = ?').get(id))
      throw new NotFoundException();
    const count = (this.db.prepare('SELECT COUNT(*) as n FROM flow_templates').get() as any).n;
    if (count <= 1) throw new BadRequestException('Cannot delete the last flow template');
    this.db.prepare('DELETE FROM flow_templates WHERE id = ?').run(id);
  }

  private parse(row: any) {
    const DEFAULT_COLORS = [
      { bg: '#e3f2fd', color: '#1565c0' },
      { bg: '#fff3e0', color: '#e65100' },
      { bg: '#e8f5e9', color: '#1b5e20' },
      { bg: '#f3e5f5', color: '#4a148c' },
      { bg: '#fce4ec', color: '#880e4f' },
    ];
    const raw: any[] = JSON.parse(row.steps);
    const steps = raw.map((s: any, i: number) => {
      if (typeof s === 'string') {
        const c = DEFAULT_COLORS[i % DEFAULT_COLORS.length];
        return { label: s, color: c.color, bg: c.bg };
      }
      return s;
    });
    return { ...row, steps, is_default: !!row.is_default };
  }
}
