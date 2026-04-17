import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDropEvent, DropZoneDirective, DraggableDirective, DragHandleDirective } from '../../../core/drag-drop';
import { TodoItemComponent, FlowStep, SubtaskDroppedEvent, DEFAULT_STEPS } from '../todo-item/todo-item.component';

export interface PromotedEvent { sub: any; parentId: string; insertIndex: number; }
export interface ReorderEvent  { todos: any[]; }

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule, DropZoneDirective, DraggableDirective, DragHandleDirective, TodoItemComponent],
  template: `
    <!--
      Outer zone: subtask-only catch-all that fills the page column.
      When the pointer is over empty space outside the inner list this zone
      still catches the drop and promotes the subtask.
    -->
    <div
      class="list-drop-area"
      appDropZone
      [dzId]="'area-' + listId"
      [dzPredicate]="canPromote"
      (dzDrop)="onPromoteDrop($event)"
    >
      <!--
        Inner zone: the actual item list.
        Has higher elementsFromPoint priority (rendered on top of the outer div).
        Accepts tasks (reorder) and subtasks (promote).
      -->
      <div
        class="todo-list"
        appDropZone
        [dzId]="listId"
        [dzPredicate]="canDropOnMain"
        (dzDrop)="onMainDrop($event)"
      >
        @if (loading) {
          <div class="empty-state">
            <div class="spinner"></div>
            <span>Loading…</span>
          </div>
        } @else if (todos.length === 0) {
          <div class="empty-state">
            <span class="material-icons" style="font-size:32px;color:var(--text-muted)">check_circle_outline</span>
            <span>{{ emptyMessage }}</span>
          </div>
        } @else {
          @for (todo of todos; track todo.id) {
            <div
              class="drag-item"
              appDraggable
              [dzData]="{ type: 'task', todo, index: $index }"
              [dzSourceId]="listId"
            >
              <span class="main-drag-handle" appDragHandle title="Drag to reorder or move">
                <span class="material-icons" style="font-size:15px">drag_indicator</span>
              </span>

              <app-todo-item
                [todo]="todo"
                [flowSteps]="flowSteps"
                (open)="open.emit($event)"
                (advance)="advance.emit($event)"
                (complete)="complete.emit($event)"
                (assigned)="assigned.emit($event)"
                (delete)="delete.emit($event)"
                (subtaskReordered)="subtaskReordered.emit($event)"
                (subtaskDropped)="subtaskDropped.emit($event)"
                (subtaskCreated)="subtaskCreated.emit($event)"
                style="flex:1;min-width:0"
              />
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    /* Fills the remaining page height so empty space below tasks is droppable */
    :host { display: block; height: 100%; }
    .list-drop-area { min-height: 100%; }

    .todo-list {
      display: flex; flex-direction: column; gap: 4px; min-height: 40px;
    }

    .drag-item {
      position: relative; display: flex; align-items: flex-start;
    }

    .main-drag-handle {
      position: absolute; left: -20px; top: 0; bottom: 0; width: 20px;
      display: flex; align-items: center; justify-content: center;
      color: var(--text-muted); opacity: 0; transition: opacity 100ms;
      .drag-item:hover & { opacity: 1; }
    }

    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 48px 24px; color: var(--text-muted); font-size: 13px;
    }
    .spinner {
      width: 28px; height: 28px;
      border: 2px solid var(--surface-border); border-top-color: var(--accent-color);
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class TaskListComponent {
  @Input({ required: true }) listId!: string;
  @Input() todos: any[]          = [];
  @Input() flowSteps: FlowStep[] = DEFAULT_STEPS;
  @Input() sidebarIds: string[]  = [];
  @Input() loading               = false;
  @Input() emptyMessage          = 'No tasks here';
  @Input() canReorder            = true;
  @Output() reorder          = new EventEmitter<ReorderEvent>();
  @Output() open             = new EventEmitter<any>();
  @Output() advance          = new EventEmitter<any>();
  @Output() complete         = new EventEmitter<any>();
  @Output() delete           = new EventEmitter<string>();
  @Output() assigned         = new EventEmitter<any>();
  @Output() subtaskReordered = new EventEmitter<any>();
  @Output() subtaskDropped   = new EventEmitter<SubtaskDroppedEvent>();
  @Output() subtaskCreated   = new EventEmitter<{ parentId: string; sub: any }>();
  @Output() promoted         = new EventEmitter<PromotedEvent>();

  /** Main list accepts tasks (reorder) and subtasks (promote to main task) */
  canDropOnMain = (data: any) => data?.type === 'task' || data?.type === 'subtask';
  /** Kept for canvas/promote zones that may still be used elsewhere */
  canPromote    = (data: any) => data?.type === 'subtask';

  onPromoteDrop(event: AppDropEvent): void {
    const d = event.dragData;
    if (d?.type === 'subtask') {
      // Area zone has one child (.todo-list); currentIndex is 0 (upper half) or 1 (lower half).
      const insertIndex = event.currentIndex === 0 ? 0 : this.todos.length;
      this.promoted.emit({ sub: d.sub, parentId: d.parentId, insertIndex });
    }
  }

  onMainDrop(event: AppDropEvent): void {
    if (event.dragData?.type === 'subtask') {
      const d = event.dragData;
      this.promoted.emit({ sub: d.sub, parentId: d.parentId, insertIndex: event.currentIndex });
      return;
    }
    if (event.dragData?.type !== 'task') return;
    if (event.fromZoneId !== event.toZoneId) return;  // cross-list moves handled by sidebar zones
    if (!this.canReorder) return;

    const list = [...this.todos];
    list.splice(event.currentIndex, 0, ...list.splice(event.previousIndex, 1));
    this.reorder.emit({ todos: list });
  }
}
