import {
  Controller, Get, Post, Delete, Patch, Param, Body, Query,
  Sse, UseGuards, Res, HttpCode,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // ── Bell list ────────────────────────────────────────────────────────────

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.svc.findAll(user.id);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: any) {
    return { count: this.svc.unreadCount(user.id) };
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    this.svc.markRead(id, user.id);
    return { ok: true };
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) {
    this.svc.markAllRead(user.id);
    return { ok: true };
  }

  @Delete('all')
  @HttpCode(204)
  deleteAll(@CurrentUser() user: any) {
    this.svc.deleteAll(user.id);
  }

  // ── SSE stream ────────────────────────────────────────────────────────────

  @Sse('stream')
  stream(@CurrentUser() user: any, @Res() res: any): Observable<MessageEvent> {
    const subject = this.svc.getStream(user.id);
    res.on('close', () => this.svc.removeStream(user.id));
    return subject.asObservable().pipe(
      map((data) => ({ data }) as MessageEvent),
    );
  }

  // ── Notification settings ─────────────────────────────────────────────────

  /** GET /notifications/settings — returns all settings rows for the current user */
  @Get('settings')
  getSettings(@CurrentUser() user: any) {
    return this.svc.getAllSettings(user.id);
  }

  /** PUT /notifications/settings — upsert global (no projectId) or project-specific */
  @Patch('settings')
  upsertSettings(
    @CurrentUser() user: any,
    @Body() body: { projectId?: string; settings: Record<string, any> },
  ) {
    this.svc.upsertSettings(user.id, body.projectId ?? null, body.settings);
    return { ok: true };
  }

  /** DELETE /notifications/settings/:projectId — remove project override (revert to global) */
  @Delete('settings/:projectId')
  @HttpCode(204)
  deleteProjectSettings(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    this.svc.deleteSettings(user.id, projectId);
  }

  // ── Overdue check ─────────────────────────────────────────────────────────

  @Get('overdue-check')
  checkOverdue(@CurrentUser() user: any) {
    return this.svc.checkOverdue(user.id);
  }

  // ── Custom reminders ──────────────────────────────────────────────────────

  @Get('reminders/:todoId')
  getReminders(@Param('todoId') todoId: string, @CurrentUser() user: any) {
    return this.svc.getReminders(todoId, user.id);
  }

  @Post('reminders/:todoId')
  createReminder(
    @Param('todoId') todoId: string,
    @Body() body: { remindAt: number; label?: string; notifyEmail?: boolean },
    @CurrentUser() user: any,
  ) {
    return this.svc.createReminder(todoId, user.id, body.remindAt, body.label, body.notifyEmail ?? true);
  }

  @Patch('reminders/item/:id')
  patchReminder(
    @Param('id') id: string,
    @Body() body: { notifyEmail: boolean },
    @CurrentUser() user: any,
  ) {
    return this.svc.patchReminder(id, user.id, body.notifyEmail);
  }

  @Delete('reminders/item/:id')
  @HttpCode(204)
  deleteReminder(@Param('id') id: string, @CurrentUser() user: any) {
    this.svc.deleteReminder(id, user.id);
  }
}
