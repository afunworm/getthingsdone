import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  findAll() {
    return this.teamsService.findAll();
  }

  @Get('mine')
  findMine(@CurrentUser() user: any) {
    return this.teamsService.findMine(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }

  @Post()
  create(@Body() dto: { name: string; description?: string }, @CurrentUser() user: any) {
    return this.teamsService.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string },
    @CurrentUser() user: any,
  ) {
    return this.teamsService.update(id, dto, user.id);
  }

  @Post(':id/members')
  addMember(
    @Param('id') teamId: string,
    @Body() dto: { userId: string; role?: 'member' | 'lead' },
  ) {
    return this.teamsService.addMember(teamId, dto.userId, dto.role);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(@Param('id') teamId: string, @Param('userId') userId: string) {
    return this.teamsService.removeMember(teamId, userId);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.teamsService.delete(id, user.id);
  }
}
