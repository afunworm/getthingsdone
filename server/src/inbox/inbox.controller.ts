import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InboxService } from './inbox.service';

@Controller('inbox')
@UseGuards(JwtAuthGuard)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query('includeDone') includeDone?: string) {
    return this.inboxService.findAll(user.id, includeDone === 'true');
  }

  @Post()
  create(
    @Body() dto: {
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
    return this.inboxService.create(dto, user.id);
  }
}
