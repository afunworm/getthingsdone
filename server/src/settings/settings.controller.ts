import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAll(@CurrentUser() user: any) {
    return this.settingsService.getAll(user.id);
  }

  /** Public app-wide config (priority labels, etc.) — any authenticated user. */
  @Get('app')
  getAppConfig() {
    return this.settingsService.getAppConfig();
  }

  @Patch()
  upsert(@Body() dto: { key: string; value: string }, @CurrentUser() user: any) {
    this.settingsService.upsert(user.id, dto.key, dto.value);
    return { ok: true };
  }
}
