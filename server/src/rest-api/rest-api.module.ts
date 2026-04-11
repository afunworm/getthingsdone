import { Module } from '@nestjs/common';
import { RestApiController } from './rest-api.controller';
import { ApiTokenGuard } from './api-token.guard';
import { TodosModule } from '../todos/todos.module';
import { InboxModule } from '../inbox/inbox.module';

@Module({
  imports: [TodosModule, InboxModule],
  controllers: [RestApiController],
  providers: [ApiTokenGuard],
})
export class RestApiModule {}
