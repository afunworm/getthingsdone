import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TeamsModule } from './teams/teams.module';
import { FlowsModule } from './flows/flows.module';
import { ProjectsModule } from './projects/projects.module';
import { TodosModule } from './todos/todos.module';
import { InboxModule } from './inbox/inbox.module';
import { CommentsModule } from './comments/comments.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { SettingsModule } from './settings/settings.module';
import { RestApiModule } from './rest-api/rest-api.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'client', 'dist', 'client', 'browser'),
      exclude: ['/api/{*path}'],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    FlowsModule,
    ProjectsModule,
    TodosModule,
    InboxModule,
    CommentsModule,
    MailModule,
    NotificationsModule,
    AdminModule,
    SettingsModule,
    RestApiModule,
  ],
})
export class AppModule {}
