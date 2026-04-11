import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { TodosModule } from '../todos/todos.module';

@Module({
  imports: [TodosModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
