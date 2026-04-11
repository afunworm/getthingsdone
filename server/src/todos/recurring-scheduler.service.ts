import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RecurringSchedulerService implements OnModuleInit {
  private readonly log = new Logger(RecurringSchedulerService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Run once at startup so tasks are current immediately after server restart. */
  onModuleInit() {
    this.spawnMissedOccurrences();
  }

  /** Run every night at midnight. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleCron() {
    this.spawnMissedOccurrences();
  }

  // ── Core logic ─────────────────────────────────────────────────────────────

  /**
   * For every recurring task that is:
   *  - not yet completed
   *  - has a due date in the past
   *  - has no existing child task yet (recurrence_parent_id)
   *
   * …create a new child task dated one period later.
   *
   * We repeat in passes so that a chain of N missed periods produces N tasks:
   *   Pass 1: original (Jan) has no child  → spawn Feb
   *   Pass 2: Feb has no child             → spawn Mar
   *   Pass 3: Mar is still in the past     → spawn Apr  (if still < now)
   *   Pass 4: Apr is in the future         → nothing left, stop
   *
   * A hard cap of 366 passes prevents pathological loops.
   */
  spawnMissedOccurrences(): void {
    const nowSec = Math.floor(Date.now() / 1000);
    let total = 0;

    for (let pass = 0; pass < 366; pass++) {
      const leaves = this.db.prepare(`
        SELECT t.*, p.flow_steps AS project_flow_steps
        FROM todos t
        LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.is_recurring  = 1
          AND t.due_date IS NOT NULL
          AND t.due_date      < ?
          AND NOT EXISTS (
            SELECT 1 FROM todos c WHERE c.recurrence_parent_id = t.id
          )
      `).all(nowSec) as any[];

      if (leaves.length === 0) break;

      let spawned = 0;
      for (const row of leaves) {
        const maxSteps = row.project_flow_steps
          ? (JSON.parse(row.project_flow_steps) as any[]).length
          : 3;

        // Skip tasks that are already completed — they spawned their child on
        // completion (via spawnNextOccurrence in TodosService) and the cron
        // should not add a second one.
        if (row.flow_step_index >= maxSteps - 1) continue;

        const rule: { type: 'daily' | 'weekly' | 'monthly'; interval: number } =
          JSON.parse(row.recurrence_rule);

        const nextDue = this.advanceOnePeriod(row.due_date, rule);
        this.createOccurrence(row, nextDue);
        spawned++;
        total++;
      }

      // No eligible leaves left (all remaining were completed tasks) — done.
      if (spawned === 0) break;
    }

    if (total > 0) {
      this.log.log(`Spawned ${total} missed recurring occurrence(s).`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private createOccurrence(parent: any, dueSec: number): void {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO todos (
        id, project_id, parent_todo_id, title, description,
        due_date, is_recurring, recurrence_rule, recurrence_parent_id,
        sort_order, is_inbox, inbox_user_id, created_by,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, 1, ?, ?,
        ?, ?, ?, ?,
        unixepoch(), unixepoch()
      )
    `).run(
      id,
      parent.project_id,
      parent.parent_todo_id,
      parent.title,
      parent.description,
      dueSec,
      parent.recurrence_rule,
      parent.id,          // recurrence_parent_id → links back to this parent
      parent.sort_order,
      parent.is_inbox,
      parent.inbox_user_id,
      parent.created_by,
    );

    // Copy assignees so the new occurrence is assigned to the same people.
    const assignees = this.db
      .prepare('SELECT user_id, team_id FROM todo_assignees WHERE todo_id = ?')
      .all(parent.id) as any[];
    for (const a of assignees) {
      this.db
        .prepare('INSERT OR IGNORE INTO todo_assignees (todo_id, user_id, team_id) VALUES (?, ?, ?)')
        .run(id, a.user_id, a.team_id);
    }
  }

  /** Advance a Unix timestamp by exactly one recurrence period. */
  private advanceOnePeriod(
    dueSec: number,
    rule: { type: 'daily' | 'weekly' | 'monthly'; interval: number },
  ): number {
    const d = new Date(dueSec * 1000);
    if (rule.type === 'daily')        d.setDate(d.getDate() + rule.interval);
    else if (rule.type === 'weekly')  d.setDate(d.getDate() + rule.interval * 7);
    else                              d.setMonth(d.getMonth() + rule.interval);
    return Math.floor(d.getTime() / 1000);
  }
}
