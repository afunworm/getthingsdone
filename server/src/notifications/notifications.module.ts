import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationListenerService } from './notification-listener.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationSchedulerService, NotificationListenerService],
  exports: [NotificationsService, NotificationSchedulerService],
})
export class NotificationsModule {}
