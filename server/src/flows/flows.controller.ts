import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FlowsService } from './flows.service';

@Controller('flows')
@UseGuards(JwtAuthGuard)
export class FlowsController {
  constructor(private readonly flowsService: FlowsService) {}

  @Get()
  findAll() {
    return this.flowsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.flowsService.findById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: { name: string; steps: any[] }, @CurrentUser() user: any) {
    return this.flowsService.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: { name?: string; steps?: any[] }) {
    return this.flowsService.update(id, dto);
  }

  @Patch(':id/default')
  @UseGuards(RolesGuard)
  @Roles('admin')
  setDefault(@Param('id') id: string) {
    return this.flowsService.setDefault(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles('admin')
  delete(@Param('id') id: string) {
    return this.flowsService.delete(id);
  }
}
