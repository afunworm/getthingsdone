import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from './notifications.service';
import {
  TodoCreatedEvent,
  TodoUpdatedEvent,
  TodoDeletedEvent,
  TodoMovedEvent,
  TodoFlowChangedEvent,
  TodoUserAssignedEvent,
  TodoTeamAssignedEvent,
  TodoUserUnassignedEvent,
  TodoTeamUnassignedEvent,
  CommentCreatedEvent,
} from '../todos/todo.events';

@Injectable()
export class NotificationListenerService {
  private readonly logger = new Logger(NotificationListenerService.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly db: DatabaseService,
  ) {}

  private actorName(callerId: string): string {
    const actor = this.db.prepare('SELECT name FROM users WHERE id = ?').get(callerId) as any;
    return actor?.name ?? 'Someone';
  }

  @OnEvent('todo.created')
  onTodoCreated(event: TodoCreatedEvent) {
    if (!event.todo.project_id) return;
    this.notifications.notifyProjectMembers(event.todo.project_id, 'on_task_created', {
      type:      'task_created',
      title:     `New task: ${event.todo.title}`,
      body:      `Created by ${this.actorName(event.callerId)}`,
      link:      `/projects/${event.todo.project_id}`,
      todoId:    event.todo.id,
      projectId: event.todo.project_id,
    }, event.callerId);
  }

  @OnEvent('todo.updated')
  onTodoUpdated(event: TodoUpdatedEvent) {
    if (!event.todo.project_id) return;
    const FIELD_LABELS: Record<string, string> = {
      title:       'title',
      description: 'description',
      dueDate:     'due date',
      priority:    'priority',
    };
    const changed = event.changedFields
      .map((f) => FIELD_LABELS[f] ?? f)
      .join(', ');
    this.notifications.notifyProjectMembers(event.todo.project_id, 'on_task_updated', {
      type:      'task_updated',
      title:     `Task updated: ${event.todo.title}`,
      body:      `${this.actorName(event.callerId)} updated ${changed}`,
      link:      `/projects/${event.todo.project_id}`,
      todoId:    event.todo.id,
      projectId: event.todo.project_id,
    }, event.callerId);
  }

  @OnEvent('todo.deleted')
  onTodoDeleted(event: TodoDeletedEvent) {
    if (!event.todo.project_id) return;
    this.notifications.notifyProjectMembers(event.todo.project_id, 'on_task_deleted', {
      type:      'task_deleted',
      title:     `Task deleted: ${event.todo.title}`,
      body:      `Deleted by ${this.actorName(event.callerId)}`,
      link:      `/projects/${event.todo.project_id}`,
      todoId:    event.todo.id,
      projectId: event.todo.project_id,
    }, event.callerId);
  }

  @OnEvent('todo.moved')
  onTodoMoved(event: TodoMovedEvent) {
    const actorName = this.actorName(event.callerId);

    if (event.fromProjectId) {
      const from = this.db.prepare('SELECT name FROM projects WHERE id = ?').get(event.fromProjectId) as any;
      this.notifications.notifyProjectMembers(event.fromProjectId, 'on_task_deleted', {
        type:      'task_deleted',
        title:     `Task removed: ${event.todo.title}`,
        body:      `Moved out of ${from?.name ?? 'this inbox'} by ${actorName}`,
        projectId: event.fromProjectId,
      }, event.callerId);
    }

    if (event.toProjectId) {
      const to = this.db.prepare('SELECT name FROM projects WHERE id = ?').get(event.toProjectId) as any;
      this.notifications.notifyProjectMembers(event.toProjectId, 'on_task_created', {
        type:      'task_created',
        title:     `New task: ${event.todo.title}`,
        body:      `Added to ${to?.name ?? 'this inbox'} by ${actorName}`,
        link:      `/projects/${event.toProjectId}`,
        todoId:    event.todo.id,
        projectId: event.toProjectId,
      }, event.callerId);
    }
  }

  @OnEvent('todo.flow_changed')
  onTodoFlowChanged(event: TodoFlowChangedEvent) {
    if (!event.todo.project_id) return;
    const actorName = this.actorName(event.callerId);

    const title = event.isUndone
      ? `Marked undone: ${event.todo.title}`
      : event.isCompleted
        ? `Completed: ${event.todo.title}`
        : `"${event.todo.title}" → ${event.stepLabel}`;

    const body = event.isUndone
      ? `Reopened by ${actorName}`
      : event.isCompleted
        ? `Completed by ${actorName}`
        : `Advanced by ${actorName}`;

    this.notifications.notifyProjectMembers(event.todo.project_id, 'on_task_updated', {
      type:      'task_flow',
      title,
      body,
      link:      `/projects/${event.todo.project_id}`,
      todoId:    event.todo.id,
      projectId: event.todo.project_id,
    }, event.callerId);
  }

  @OnEvent('todo.user_assigned')
  onUserAssigned(event: TodoUserAssignedEvent) {
    const link = event.todo.project_id ? `/projects/${event.todo.project_id}` : '/inbox';
    const actorName = this.actorName(event.callerId);

    // Notify the assigned person (unless they assigned themselves)
    if (event.targetUserId !== event.callerId) {
      this.notifications.notifyUser(event.targetUserId, event.todo.project_id ?? null, 'on_task_assigned', {
        type:      'task_assigned',
        title:     `Assigned to you: ${event.todo.title}`,
        body:      `Assigned by ${actorName}`,
        link,
        todoId:    event.todo.id,
        projectId: event.todo.project_id ?? undefined,
      });
    }

    // Notify other project members about the assignment change (excluding the actor)
    if (event.todo.project_id) {
      const targetName = this.actorName(event.targetUserId);
      const isSelf = event.targetUserId === event.callerId;
      this.notifications.notifyProjectMembers(event.todo.project_id, 'on_task_updated', {
        type:      'task_assigned',
        title:     `Task assigned: ${event.todo.title}`,
        body:      isSelf ? `${actorName} assigned themselves` : `${targetName} assigned by ${actorName}`,
        link,
        todoId:    event.todo.id,
        projectId: event.todo.project_id,
      }, event.callerId);
    }
  }

  @OnEvent('todo.team_assigned')
  onTeamAssigned(event: TodoTeamAssignedEvent) {
    try {
      const team    = this.db.prepare('SELECT name FROM teams WHERE id = ?').get(event.teamId) as any;
      const members = this.db.prepare('SELECT user_id FROM team_members WHERE team_id = ?').all(event.teamId) as any[];
      const actorName = this.actorName(event.callerId);
      const link = event.todo.project_id ? `/projects/${event.todo.project_id}` : '/inbox';

      for (const { user_id } of members) {
        if (user_id === event.callerId) continue;
        this.notifications.notifyUser(user_id, event.todo.project_id ?? null, 'on_task_assigned', {
          type:      'task_assigned',
          title:     `Assigned to ${team?.name ?? 'your department'}: ${event.todo.title}`,
          body:      `Assigned by ${actorName}`,
          link,
          todoId:    event.todo.id,
          projectId: event.todo.project_id ?? undefined,
        });
      }
    } catch (e) {
      this.logger.error('onTeamAssigned failed', e);
    }
  }

  @OnEvent('todo.user_unassigned')
  onUserUnassigned(event: TodoUserUnassignedEvent) {
    const link = event.todo.project_id ? `/projects/${event.todo.project_id}` : '/inbox';
    const actorName = this.actorName(event.callerId);

    // Notify the unassigned person (unless they removed themselves)
    if (event.targetUserId !== event.callerId) {
      this.notifications.notifyUser(event.targetUserId, event.todo.project_id ?? null, 'on_task_assigned', {
        type:      'task_unassigned',
        title:     `Unassigned from: ${event.todo.title}`,
        body:      `Removed by ${actorName}`,
        link,
        todoId:    event.todo.id,
        projectId: event.todo.project_id ?? undefined,
      });
    }

    // Notify other project members about the unassignment (excluding the actor)
    if (event.todo.project_id) {
      const targetName = this.actorName(event.targetUserId);
      const isSelf = event.targetUserId === event.callerId;
      this.notifications.notifyProjectMembers(event.todo.project_id, 'on_task_updated', {
        type:      'task_unassigned',
        title:     `Task unassigned: ${event.todo.title}`,
        body:      isSelf ? `${actorName} unassigned themselves` : `${targetName} removed by ${actorName}`,
        link,
        todoId:    event.todo.id,
        projectId: event.todo.project_id,
      }, event.callerId);
    }
  }

  @OnEvent('todo.team_unassigned')
  onTeamUnassigned(event: TodoTeamUnassignedEvent) {
    const team    = this.db.prepare('SELECT name FROM teams WHERE id = ?').get(event.teamId) as any;
    const members = this.db.prepare('SELECT user_id FROM team_members WHERE team_id = ?').all(event.teamId) as any[];
    const actorName = this.actorName(event.callerId);
    const link = event.todo.project_id ? `/projects/${event.todo.project_id}` : '/inbox';

    for (const { user_id } of members) {
      if (user_id === event.callerId) continue;
      this.notifications.notifyUser(user_id, event.todo.project_id ?? null, 'on_task_assigned', {
        type:      'task_unassigned',
        title:     `Unassigned from ${team?.name ?? 'your department'}: ${event.todo.title}`,
        body:      `Removed by ${actorName}`,
        link,
        todoId:    event.todo.id,
        projectId: event.todo.project_id ?? undefined,
      });
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
  }

  @OnEvent('comment.created')
  onCommentCreated(event: CommentCreatedEvent) {
    if (!event.todo.project_id) return;
    const plain = this.stripHtml(event.body);
    const snippet = plain.length > 80 ? plain.slice(0, 80) + '…' : plain;
    this.notifications.notifyProjectMembers(event.todo.project_id, 'on_task_comment', {
      type:      'task_comment',
      title:     `New comment on: ${event.todo.title}`,
      body:      `${event.authorName}: ${snippet}`,
      link:      `/projects/${event.todo.project_id}`,
      todoId:    event.todo.id,
      projectId: event.todo.project_id,
    }, event.callerId);
  }
}
