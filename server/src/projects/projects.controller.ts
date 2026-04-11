import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.projectsService.findAll(user.id, user.role);
  }

  // ── Order (must be before :id routes) ──────────────────────────────────────

  @Get('order')
  getOrder(@CurrentUser() user: any) {
    return { projectIds: this.projectsService.getOrder(user.id) };
  }

  @Patch('order')
  saveOrder(@Body('projectIds') projectIds: string[], @CurrentUser() user: any) {
    this.projectsService.saveOrder(user.id, projectIds ?? []);
    return { projectIds: projectIds ?? [] };
  }

  // ── Project CRUD ────────────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.projectsService.findById(id, user.id, user.role);
  }

  @Post()
  create(
    @Body() dto: {
      name: string; description?: string; flowTemplateId?: string; dueDate?: number;
      color?: string; emoji?: string; memberUserIds?: string[]; memberTeamIds?: string[];
    },
    @CurrentUser() user: any,
  ) {
    return this.projectsService.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string; dueDate?: number; color?: string; emoji?: string; flowTemplateId?: string },
    @CurrentUser() user: any,
  ) {
    return this.projectsService.update(id, dto, user.id, user.role);
  }

  @Patch(':id/transfer')
  transfer(
    @Param('id') id: string,
    @Body('newOwnerId') newOwnerId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.transferOwnership(id, newOwnerId, user.id, user.role);
  }

  @Post(':id/members')
  addMember(
    @Param('id') projectId: string,
    @Body() dto: { userId?: string; teamId?: string; permissions: string[] },
    @CurrentUser() user: any,
  ) {
    return this.projectsService.addMember(projectId, dto as any, user.id, user.role);
  }

  @Get(':id/users')
  getAccessibleUsers(@Param('id') id: string, @CurrentUser() user: any) {
    return this.projectsService.getAccessibleUsers(id, user.id, user.role);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(204)
  removeMember(
    @Param('id') projectId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.removeMember(projectId, memberId, user.id, user.role);
  }

  // ── Display prefs ───────────────────────────────────────────────────────────

  @Get(':id/prefs')
  getPrefs(@Param('id') id: string, @CurrentUser() user: any) {
    return this.projectsService.getPrefs(user.id, id);
  }

  @Patch(':id/prefs')
  updatePrefs(
    @Param('id') id: string,
    @Body() dto: { show_task_count?: boolean; count_mode?: string; highlight_color?: string | null },
    @CurrentUser() user: any,
  ) {
    return this.projectsService.updatePrefs(user.id, id, dto);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.projectsService.delete(id, user.id, user.role);
  }
}
