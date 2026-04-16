import { Controller, Get, Param, Patch, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.usersService.getMe(user.id);
  }

  @Patch('me/timezone')
  updateMyTimezone(@CurrentUser() user: any, @Body('timezone') timezone: string) {
    return this.usersService.updateTimezone(user.id, timezone);
  }

  @Patch('me/due-reminder-offset')
  updateDueReminderOffset(@CurrentUser() user: any, @Body('offsetMins') offsetMins: number) {
    return this.usersService.setDueReminderOffset(user.id, offsetMins);
  }

  @Patch('me/complete-onboarding')
  completeOnboarding(@CurrentUser() user: any) {
    return this.usersService.completeOnboarding(user.id);
  }

  @Post('me/tour-demo-tasks')
  createTourDemoTasks(@CurrentUser() user: any) {
    return this.usersService.createTourDemoTasks(user.id);
  }

  @Delete('me/tour-demo-tasks')
  deleteTourDemoTasks(@CurrentUser() user: any) {
    this.usersService.deleteTourDemoTasks(user.id);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateRole(@Param('id') id: string, @Body('role') role: 'admin' | 'user') {
    return this.usersService.updateRole(id, role);
  }

  @Patch(':id/reset-onboarding')
  @UseGuards(RolesGuard)
  @Roles('admin')
  resetOnboarding(@Param('id') id: string) {
    return this.usersService.resetOnboarding(id);
  }
}
