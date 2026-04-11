import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommentCreatedEvent } from '../todos/todo.events';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

@Injectable()
export class CommentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  findByTodo(todoId: string) {
    const comments = this.db.prepare(`
      SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.todo_id = ?
      ORDER BY c.created_at
    `).all(todoId);

    return comments.map((c: any) => ({
      ...c,
      attachments: this.db.prepare(
        'SELECT * FROM attachments WHERE comment_id = ?',
      ).all(c.id),
    }));
  }

  create(todoId: string, body: string | null | undefined, userId: string) {
    const safeBody = body ?? '';
    const id = uuidv4();
    this.db.prepare(
      'INSERT INTO comments (id, todo_id, user_id, body) VALUES (?, ?, ?, ?)',
    ).run(id, todoId, userId, safeBody);
    const comment = this.db.prepare(`
      SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(id) as any;

    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(todoId) as any;
    this.eventEmitter.emit('comment.created', new CommentCreatedEvent(todo, userId, comment.user_name, safeBody));

    // Notify @mentioned users
    const mentionIds = [...safeBody.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]);
    const link = todo.project_id ? `/projects/${todo.project_id}` : '/inbox';
    for (const mentionedId of mentionIds) {
      if (mentionedId === userId) continue;
      this.notifications.create(mentionedId, {
        type:      'task_comment',
        title:     `${comment.user_name} mentioned you in: ${todo.title}`,
        body:      `You were mentioned in a comment.`,
        link,
        todoId,
        projectId: todo.project_id ?? undefined,
      });
    }

    return comment;
  }

  addAttachment(
    commentId: string,
    file: { filename: string; originalname: string; mimetype: string; size: number },
    userId: string,
  ) {
    const comment = this.db.prepare(
      'SELECT * FROM comments WHERE id = ?',
    ).get(commentId) as any;
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.user_id !== userId) throw new ForbiddenException();

    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO attachments (id, comment_id, filename, original_name, mimetype, size)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, commentId, file.filename, file.originalname, file.mimetype, file.size);
    return this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  }

  deleteComment(id: string, userId: string, userRole: string) {
    const comment = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as any;
    if (!comment) throw new NotFoundException();
    if (userRole !== 'admin') throw new ForbiddenException();
    this.db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  }

  deleteAttachment(id: string, userId: string, userRole: string) {
    const att = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as any;
    if (!att) throw new NotFoundException();
    const comment = this.db.prepare('SELECT user_id FROM comments WHERE id = ?').get(att.comment_id) as any;
    if (userRole !== 'admin' && comment?.user_id !== userId) throw new ForbiddenException();
    this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    const filePath = join(process.cwd(), 'uploads', att.filename);
    if (existsSync(filePath)) { try { unlinkSync(filePath); } catch (_) {} }
  }
}
