import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TodosService } from './todos.service';

@Controller('todos')
@UseGuards(JwtAuthGuard)
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get('project/:projectId')
  findByProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Query('includeDone') includeDone?: string,
  ) {
    return this.todosService.findByProject(projectId, user.id, user.role, includeDone === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.todosService.findById(id, user.id, user.role);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.todosService.getHistory(id, user.role);
  }

  @Post()
  create(
    @Body() dto: {
      projectId?: string;
      parentTodoId?: string;
      title: string;
      description?: string;
      dueDate?: number;
      isRecurring?: boolean;
      recurrenceRule?: any;
      sortOrder?: number;
      priority?: number;
    },
    @CurrentUser() user: any,
  ) {
    return this.todosService.create(dto, user.id, user.role);
  }

  @Post(':id/assignees')
  addAssignee(
    @Param('id') id: string,
    @Body() dto: { userId?: string; teamId?: string },
    @CurrentUser() user: any,
  ) {
    return this.todosService.addAssignee(id, dto, user.id, user.role);
  }

  @Delete(':id/assignees/users/:userId')
  @HttpCode(200)
  removeUserAssignee(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.todosService.removeAssignee(id, userId, undefined, user.id, user.role);
  }

  @Delete(':id/assignees/teams/:teamId')
  @HttpCode(200)
  removeTeamAssignee(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: any,
  ) {
    return this.todosService.removeAssignee(id, undefined, teamId, user.id, user.role);
  }

  @Patch(':id/move')
  moveTodo(
    @Param('id') id: string,
    @Body() dto: { projectId?: string; toInbox?: boolean },
    @CurrentUser() user: any,
  ) {
    return this.todosService.moveTodo(id, dto, user.id, user.role);
  }

  @Patch('reorder')
  reorder(@Body() updates: { id: string; sortOrder: number }[]) {
    return this.todosService.reorder(updates);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user: any,
  ) {
    return this.todosService.update(id, dto, user.id, user.role);
  }

  @Patch(':id/set-step')
  setStep(
    @Param('id') id: string,
    @Body() dto: { stepIndex: number },
    @CurrentUser() user: any,
  ) {
    return this.todosService.setStep(id, dto.stepIndex, user.id, user.role);
  }

  @Patch(':id/advance')
  advanceFlow(@Param('id') id: string, @CurrentUser() user: any) {
    return this.todosService.advanceFlow(id, user.id, user.role);
  }

  @Patch(':id/complete')
  completeFlow(@Param('id') id: string, @CurrentUser() user: any) {
    return this.todosService.completeFlow(id, user.id, user.role);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.todosService.delete(id, user.id, user.role);
  }

  // ── Attachments ───────────────────────────────────────────────────────────

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => cb(null, `${uuidv4()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @Param('id') todoId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.todosService.addTodoAttachment(todoId, file, user.id);
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  deleteAttachment(@Param('id') id: string, @CurrentUser() user: any) {
    this.todosService.deleteTodoAttachment(id, user.id, user.role);
  }
}
