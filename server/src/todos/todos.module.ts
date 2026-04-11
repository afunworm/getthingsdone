import { Module } from '@nestjs/common';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';
import { RecurringSchedulerService } from './recurring-scheduler.service';

@Module({
  controllers: [TodosController],
  providers: [TodosService, RecurringSchedulerService],
  exports: [TodosService, RecurringSchedulerService],
})
export class TodosModule {}
