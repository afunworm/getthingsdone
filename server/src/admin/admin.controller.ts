import { Controller, Get, Patch, Delete, Body, Param, UseGuards, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { MailService } from '../mail/mail.service';
import { buildEmailHtml } from '../mail/email-template';
import { RecurringSchedulerService } from '../todos/recurring-scheduler.service';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
import { ConfigService } from '@nestjs/config';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly mailService: MailService,
    private readonly recurringScheduler: RecurringSchedulerService,
    private readonly notifScheduler: NotificationSchedulerService,
    private readonly config: ConfigService,
  ) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('smtp')
  getSmtp() {
    return this.adminService.getSmtpConfig();
  }

  @Patch('smtp')
  updateSmtp(@Body() dto: any) {
    return this.adminService.updateSmtpConfig(dto);
  }

  @Post('smtp/test')
  async testSmtp() {
    return this.mailService.testConnection();
  }

  @Post('smtp/send-test')
  async sendTestEmail(@Body() dto: { to: string }) {
    const appUrl = this.config.get('FRONTEND_URL', '');
    const ok = await this.mailService.send(
      dto.to,
      'Test email from Get Things Done',
      buildEmailHtml({
        title:  'Your email is working!',
        body:   'This is a test email sent from the admin SMTP settings page. If you received this, your email configuration is set up correctly.',
        type:   'task_reminder',
        appUrl,
      }),
    );
    return { ok };
  }

  @Post('run-recurring')
  runRecurring() {
    this.recurringScheduler.spawnMissedOccurrences();
    return { ok: true };
  }

  @Post('run-notifications')
  runNotifications() {
    this.notifScheduler.handleScheduled();
    return { ok: true };
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getAppSettings();
  }

  @Patch('settings')
  updateSetting(@Body() dto: { key: string; value: string }) {
    this.adminService.updateAppSetting(dto.key, dto.value);
    return this.adminService.getAppSettings();
  }

  @Post('settings/apply-timezone')
  applyTimezoneToAll() {
    return this.adminService.applyDefaultTimezoneToAll();
  }

  // ── API Tokens ────────────────────────────────────────

  @Get('api-tokens')
  listTokens() {
    return this.adminService.listTokens();
  }

  @Post('api-tokens')
  createToken(@Body() dto: { name: string; expiresAt?: number | null }, @CurrentUser() user: any) {
    return this.adminService.createToken(dto, user.id);
  }

  @Delete('api-tokens/:id')
  revokeToken(@Param('id') id: string) {
    this.adminService.revokeToken(id);
    return { ok: true };
  }


}
