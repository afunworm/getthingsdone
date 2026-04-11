import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DragStateService {
  /** True while any task or subtask drag is in progress */
  isDragging = signal(false);
  /** 'task' | 'subtask' | null — what is currently being dragged */
  draggingType = signal<'task' | 'subtask' | null>(null);
  /** ID of the project whose main list is currently rendered */
  currentProjectId = signal<string | null>(null);
  /** Set to a todo ID when it has been moved to a different inbox (so the source view can remove it) */
  movedTodoId = signal<string | null>(null);
  /** Set when a subtask is moved to a different inbox — source view removes it from its parent */
  movedSubtaskInfo = signal<{ id: string; parentId: string } | null>(null);
}
