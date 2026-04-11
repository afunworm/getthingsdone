import { Controller, Get, Param, Patch, Body, UseGuards } from '@nestjs/common';
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

  @Patch('me/overdue-reminder-time')
  updateOverdueReminderTime(@CurrentUser() user: any, @Body('time') time: string) {
    return this.usersService.updateOverdueReminderTime(user.id, time);
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
}
