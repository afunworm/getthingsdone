import {
  Controller, Get, Post, Delete, Param, Body, UseGuards,
  UseInterceptors, UploadedFile, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommentsService } from './comments.service';
import { TodosService } from '../todos/todos.service';

@Controller('comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly todosService: TodosService,
  ) {}

  @Get('todo/:todoId')
  findByTodo(@Param('todoId') todoId: string) {
    return this.commentsService.findByTodo(todoId);
  }

  @Post('todo/:todoId')
  create(
    @Param('todoId') todoId: string,
    @Body('body') body: string,
    @CurrentUser() user: any,
  ) {
    return this.commentsService.create(todoId, body, user.id);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          cb(null, `${uuidv4()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @Param('id') commentId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    this.todosService.checkAllowedExtension(file.originalname, file.path);
    return this.commentsService.addAttachment(commentId, file, user.id);
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  deleteAttachment(@Param('id') id: string, @CurrentUser() user: any) {
    this.commentsService.deleteAttachment(id, user.id, user.role);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.commentsService.deleteComment(id, user.id, user.role);
  }
}
