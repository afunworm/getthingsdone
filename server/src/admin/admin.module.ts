import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TodosModule } from '../todos/todos.module';

@Module({
  imports: [TodosModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
