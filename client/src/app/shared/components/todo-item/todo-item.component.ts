import {
  Component, Input, Output, EventEmitter, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Dialog } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/services/api.service';
import { DragStateService } from '../../../core/services/drag-state.service';
import { AppDropEvent, DropZoneDirective, DraggableDirective, DragHandleDirective } from '../../../core/drag-drop';
import { Assignees } from '../assign-dialog/assign-dialog.component';
import { PriorityService } from '../../../core/services/priority.service';
import { PriorityPickerComponent } from '../priority-picker/priority-picker.component';
import { AssignPickerComponent } from '../assign-picker/assign-picker.component';
import { RemindersSectionComponent } from '../reminders-section/reminders-section.component';
import { DueDateReminderDialogComponent } from '../due-date-reminder-dialog/due-date-reminder-dialog.component';

export interface FlowStep { label: string; color: string; bg: string; }

export const DEFAULT_STEPS: FlowStep[] = [
  { label: 'New',         color: '#1565c0', bg: '#e3f2fd' },
  { label: 'In Progress', color: '#e65100', bg: '#fff3e0' },
  { label: 'Done',        color: '#1b5e20', bg: '#e8f5e9' },
];

export interface SubtaskDroppedEvent {
  type: 'reattach' | 'demote';
  item: any;          // the subtask or task being moved
  oldParentId?: string;
  newParentId: string;
  currentIndex: number;
  /** When demoting a task that had subtasks, these are also flattened into the new parent */
  subtasksToFlatten?: any[];
}

@Component({
  selector: 'app-todo-item',
  standalone: true,
  imports: [CommonModule, FormsModule, DropZoneDirective, DraggableDirective, DragHandleDirective, PriorityPickerComponent, AssignPickerComponent, RemindersSectionComponent],
  template: `
    <div class="todo-wrap"
      [id]="'tour-task-' + todo.id"
      [class.priority-urgent]="todo.priority === 3"
      [class.priority-medium]="todo.priority === 2"
    >
      <!-- ── Main row ──────────────────────────────────── -->
      <div class="todo-row" [class.completed]="isCompleted">

        <!-- Left: next-step button -->
        <div class="left-actions" (click)="$event.stopPropagation()">
          <button
            class="btn-action btn-next"
            [id]="'task-advance-' + todo.id"
            (click)="advance.emit(todo)"
            [disabled]="isCompleted"
            title="Advance to next step"
          >
            <span class="material-icons" style="font-size:16px">arrow_forward</span>
          </button>
        </div>

        <!-- Body (click → open detail) -->
        <div class="todo-body" (click)="open.emit(todo)">
          <div class="title-row">
            <span class="step-chip" [ngStyle]="stepStyle(todo.flow_step_index)">
              {{ stepLabel(todo.flow_step_index) }}
            </span>
            <div class="title-content">
              <span class="todo-title">{{ todo.title }}</span>
              @if (hasMeta) {
                <div class="todo-meta">
                  @if (todo.due_date) {
                    <span class="meta-chip" [id]="'task-due-' + todo.id" [class.overdue]="isOverdue">
                      <span class="material-icons" style="font-size:11px">schedule</span>
                      {{ todo.due_date * 1000 | date:'MMM d' }}
                      @if (todo.is_recurring) {
                        <span class="material-icons" style="font-size:10px;margin-left:1px" title="Recurring">repeat</span>
                      }
                    </span>
                  }
                  @if (assigneeLabel(todo)) {
                    <span class="meta-chip" [id]="'task-assignee-' + todo.id">
                      <span class="material-icons" style="font-size:11px">person</span>
                      {{ assigneeLabel(todo) }}
                    </span>
                  }
                  @if (todo.is_recurring && !todo.due_date) {
                    <span class="meta-chip">
                      <span class="material-icons" style="font-size:11px">repeat</span>
                    </span>
                  }
                  @if (todo.subtodos?.length) {
                    <span class="meta-chip" [id]="'task-subtask-' + todo.id">
                      <span class="material-icons" style="font-size:11px">subdirectory_arrow_right</span>
                      {{ todo.subtodos.length }}
                    </span>
                  }
                  @if (todo.attachment_count > 0) {
                    <span class="meta-chip">
                      <span class="material-icons" style="font-size:11px">attach_file</span>
                      {{ todo.attachment_count }}
                    </span>
                  }
                  @if (todo.comment_count > 0) {
                    <span class="meta-chip" [id]="'task-comment-' + todo.id">
                      <span class="material-icons" style="font-size:11px">chat_bubble_outline</span>
                      {{ todo.comment_count }}
                    </span>
                  }
                  @if (todo.reminder_count > 0) {
                    <span class="meta-chip meta-chip--reminder">
                      <span class="material-icons" style="font-size:11px">alarm</span>
                      {{ todo.reminder_count }}
                    </span>
                  }
                  @if (todo.priority > 0) {
                    <span class="meta-chip" [style.color]="prioritySvc.getColor(todo.priority)">
                      <span class="material-icons" style="font-size:11px">priority_high</span>
                      {{ prioritySvc.getLabel(todo.priority) }}
                    </span>
                  }
                </div>
              }
              @if (todo.description) {
                <div class="todo-desc" [innerHTML]="sanitizeHtml(todo.description)"
                  (click)="onDescClick($event)"></div>
              }
            </div>
          </div>
        </div>

        <!-- Right: Done → Subtask → Assign → Due Date → Reminder → Delete -->
        <div class="right-actions" (click)="$event.stopPropagation()">

          <!-- Mark Done -->
          <button
            class="btn-action"
            [id]="'task-done-' + todo.id"
            [class.btn-done-active]="isCompleted"
            (click)="isCompleted ? undone(todo) : complete.emit(todo)"
            [title]="isCompleted ? 'Click to undo — move back to New' : 'Mark as done'"
          >
            <span class="material-icons" style="font-size:16px">
              {{ isCompleted ? 'check_circle' : 'check_circle_outline' }}
            </span>
          </button>

          <!-- Add subtask (top-level only) -->
          @if (!todo.parent_todo_id) {
            <button class="btn-action" [id]="'task-add-subtask-' + todo.id" (click)="openQuickAdd()" title="Add subtask">
              <span class="material-icons" style="font-size:15px">subdirectory_arrow_right</span>
            </button>
          }

          <!-- Assign (projects only — personal inbox is private) -->
          @if (todo.project_id) {
            <app-assign-picker
              [todo]="todo"
              [compact]="true"
              (updated)="assigned.emit($event)"
            ></app-assign-picker>
          }

          <!-- Due date / schedule -->
          <button
            class="btn-action"
            [id]="'task-sch-btn-' + todo.id"
            [class.btn-sch-active]="todo.due_date || todo.is_recurring"
            (click)="openDueDateReminder($event)"
            title="Due date / recurring"
          >
            <span class="material-icons" style="font-size:14px">event</span>
          </button>

          <!-- Priority -->
          <app-priority-picker
            [todo]="todo"
            [compact]="true"
            (updated)="assigned.emit($event)"
          ></app-priority-picker>

          <!-- Reminder -->
          <app-reminders-section
            [todo]="todo"
            [compact]="true"
            (todoChanged)="onReminderChanged($event)"
          ></app-reminders-section>

          <!-- Delete -->
          <button class="btn-action btn-danger" [id]="'task-del-btn-' + todo.id" (click)="delete.emit(todo.id)" title="Delete">
            <span class="material-icons" style="font-size:15px">delete</span>
          </button>
        </div>
      </div>

      <!-- ── Subtasks drop zone (always present so tasks can be dropped in) ── -->
      <div
        class="subtasks"
        [class.subtasks--has-items]="todo.subtodos?.length"
        [class.subtasks--drag-over]="dragState.draggingType() === 'task'"

        appDropZone
        [dzId]="'sub-list-' + todo.id"
        [dzPredicate]="subPredicate"
        (dzDrop)="onSubDrop($event)"
      >
        @for (sub of todo.subtodos; track sub.id) {
          <div
            class="sub-row"
            [class.completed]="isSubDone(sub)"
            appDraggable
            [dzData]="{ type: 'subtask', sub, parentId: todo.id, index: $index }"
            [dzSourceId]="'sub-list-' + todo.id"
          >
            <!-- Drag handle -->
            <span class="drag-handle" appDragHandle title="Drag to reorder, move to another task, or move to inbox">
              <span class="material-icons" style="font-size:14px;color:var(--text-muted)">drag_indicator</span>
            </span>

            <!-- Sub left: next step -->
            <div class="sub-left" (click)="$event.stopPropagation()">
              <button class="btn-action btn-next" (click)="advance.emit(sub)"
                      [disabled]="isSubDone(sub)" title="Next step">
                <span class="material-icons" style="font-size:14px">arrow_forward</span>
              </button>
            </div>

            <!-- Sub body -->
            <div class="sub-body" (click)="open.emit({ ...sub, _parent: { title: todo.title, description: todo.description } })">
              <div class="title-row">
                <span class="step-chip" [ngStyle]="stepStyle(sub.flow_step_index)">
                  {{ stepLabel(sub.flow_step_index) }}
                </span>
                <div class="title-content">
                  <span class="sub-title">{{ sub.title }}</span>
                  @if (sub.description) {
                    <div class="todo-desc">{{ sub.description }}</div>
                  }
                </div>
              </div>
            </div>

            <!-- Sub right: Assign (projects only) + Done + Delete -->
            <div class="sub-right" (click)="$event.stopPropagation()">
              @if (sub.project_id) {
                <app-assign-picker
                  [todo]="sub"
                  [compact]="true"
                  (updated)="assigned.emit($event)"
                ></app-assign-picker>
              }
              <button class="btn-action" [class.btn-done-active]="isSubDone(sub)"
                      (click)="isSubDone(sub) ? undone(sub) : complete.emit(sub)"
                      [title]="isSubDone(sub) ? 'Click to undo' : 'Mark done'">
                <span class="material-icons" style="font-size:14px">
                  {{ isSubDone(sub) ? 'check_circle' : 'check_circle_outline' }}
                </span>
              </button>
              <button class="btn-action btn-danger" (click)="delete.emit(sub.id)" title="Delete">
                <span class="material-icons" style="font-size:13px">delete</span>
              </button>
            </div>

          </div>
        }

        <!-- Drop hint shown only during drag when empty -->
        @if (!todo.subtodos?.length && dragState.draggingType() === 'task') {
          <div class="sub-drop-hint">
            <span class="material-icons" style="font-size:12px">subdirectory_arrow_right</span>
            Drop here to make subtask
          </div>
        }
      </div>

      <!-- ── Quick-add subtask input (shown when addingSubtask is true) ── -->
      @if (!todo.parent_todo_id && addingSubtask()) {
        <div class="sub-quick-add" (click)="$event.stopPropagation()">
          <span class="material-icons" style="font-size:13px;color:var(--text-muted);flex-shrink:0">subdirectory_arrow_right</span>
          <input
            class="sub-quick-input"
            [id]="'sub-input-' + todo.id"
            [(ngModel)]="quickSubtask"
            placeholder="New subtask..."
            (keydown.enter)="submitQuickSubtask()"
            (keydown.escape)="addingSubtask.set(false); quickSubtask = ''"
            (blur)="onQuickSubtaskBlur()"
          />
          @if (quickSubtask.trim()) {
            <button class="sub-quick-save" (click)="submitQuickSubtask()">Add</button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .todo-wrap {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 6px; overflow: visible;
      transition: border-color 120ms, box-shadow 120ms;
      position: relative;
      &:hover { border-color: color-mix(in srgb, var(--accent-color) 60%, transparent); box-shadow: var(--shadow-sm); }
    }

    /* ── Main row ────────────────────────────────────── */
    .todo-row {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 8px 6px 6px;
      &.completed { opacity: .55; }
    }

    /* ── Left actions ────────────────────────────────── */
    .left-actions {
      display: flex; align-items: center; gap: 3px; flex-shrink: 0;
    }

    /* Assigned state on icon button */
    .btn-assigned { color: var(--accent-color) !important; }

    /* Done / Next */
    .btn-action {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 5px; border: 0;
      background: transparent; color: var(--text-muted);
      cursor: pointer; transition: background 120ms, color 120ms;
      &:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
      &:disabled { opacity: .35; cursor: default; }
      &.btn-done-active { color: #1b5e20; }
    }
    .btn-next { color: var(--accent-color); opacity: .7;
      &:hover:not(:disabled) { opacity: 1; background: color-mix(in srgb, var(--accent-color) 10%, transparent); }
    }

    /* ── Todo body ───────────────────────────────────── */
    .todo-body { flex: 1; min-width: 0; cursor: pointer; }
    .title-row { display: flex; align-items: flex-start; gap: 7px; }
    .step-chip {
      display: inline-flex; align-items: center;
      padding: 2px 7px; border-radius: 20px;
      font-size: 10px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase;
      white-space: nowrap; flex-shrink: 0; margin-top: 1px;
    }
    .title-content { flex: 1; min-width: 0; }
    .todo-title {
      font-size: 14px; font-weight: 450; color: var(--text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;
    }
    .todo-desc {
      font-size: 12px; color: var(--text-secondary); margin-top: 1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      a {
        color: var(--accent-color); text-decoration: underline;
        text-underline-offset: 2px; pointer-events: all;
        &:hover { opacity: 0.8; }
      }
    }
    .todo-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px; }
    .meta-chip {
      display: inline-flex; align-items: center; gap: 2px;
      font-size: 11px; color: var(--text-muted);
      &.overdue { color: #d32f2f; }
    }

    /* ── Right actions ───────────────────────────────── */
    .right-actions { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .btn-danger {
      color: var(--text-muted);
      &:hover:not(:disabled) { color: #d32f2f; background: #fde8e8; }
    }
    .btn-sch-active { color: var(--accent-color); }

    /* ── Priority borders & backgrounds ─────────────── */
    @property --ba {
      syntax: '<angle>';
      initial-value: 0deg;
      inherits: false;
    }
    @keyframes borderTravel {
      to { --ba: 360deg; }
    }
    @keyframes urgentGlow {
      0%, 100% { box-shadow: 0 0 4px 0 rgba(211,47,47,.2); }
      50%       { box-shadow: 0 0 10px 3px rgba(211,47,47,.4); }
    }
    .priority-urgent {
      border-radius: 8px;
      border: 2px solid transparent;
      background:
        linear-gradient(var(--surface-card), var(--surface-card)) padding-box,
        conic-gradient(from var(--ba),
          #e57373 0%, #e53935 30%, #ff5252 50%, #e53935 70%, #e57373 100%
        ) border-box;
      animation: borderTravel 1s linear infinite, urgentGlow 1.1s ease-in-out infinite;
      .todo-row { background: rgba(211,47,47,.05); }
      &:hover { border-color: transparent; }
    }
    .priority-medium {
      border-radius: 8px;
      border: 1.5px solid #f57c00;
      .todo-row { background: rgba(245,124,0,.04); }
      &:hover { border-color: #ffb74d; box-shadow: var(--shadow-sm); }
    }

    /* ── Reminder meta chip ─────────────────────────── */
    .meta-chip--reminder { color: #f57c00; }

    /* ── Subtasks ────────────────────────────────────── */
    .subtasks {
      border-radius: 0 0 6px 6px;
      /* Empty: invisible, but ready to receive drops */
      min-height: 0; overflow: hidden;
      transition: min-height 120ms, background 120ms;
      padding-left: 40px;
    }
    /* Has items: show normally */
    .subtasks--has-items {
      border-top: 1px solid var(--surface-border);
      background: var(--surface-hover);
      min-height: 4px;
    }
    /* During main-task drag: expand bottom zone so demotion target is reachable */
    .subtasks--drag-over {
      min-height: 36px;
    }
    .subtasks:not(.subtasks--has-items).subtasks--drag-over {
      border-top: 1px dashed var(--surface-border);
    }
    /* Hint label inside empty subtask area during drag */
    .sub-drop-hint {
      display: flex; align-items: center; justify-content: center; gap: 4px;
      height: 36px; font-size: 10px; color: var(--text-muted); pointer-events: none;
    }

    .sub-row {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 8px 4px 4px;
      border-top: 1px solid var(--surface-border);
      cursor: default;
      &:first-child { border-top: 0; }
      &.completed { opacity: .55; }
      &.cdk-drag-animating { transition: transform 200ms cubic-bezier(0,0,0.2,1); }
    }
    .drag-handle {
      cursor: grab; display: flex; align-items: center; flex-shrink: 0;
      padding: 0 2px; opacity: 0; transition: opacity 100ms;
      .sub-row:hover & { opacity: 1; }
      &:active { cursor: grabbing; }
    }
    .sub-left { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .sub-right { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .sub-body { flex: 1; min-width: 0; cursor: pointer; }
    .sub-title {
      font-size: 13px; font-weight: 400; color: var(--text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* ── Quick-add subtask ───────────────────────────── */
    .sub-quick-add {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 8px 5px 40px; border-top: 1px solid var(--accent-color);
      background: color-mix(in srgb, var(--accent-color) 4%, transparent);
      border-radius: 0 0 6px 6px;
    }
    .sub-quick-input {
      flex: 1; border: 0; background: transparent; outline: none;
      font-family: inherit; font-size: 12px; color: var(--text-primary);
      &::placeholder { color: var(--text-muted); }
    }
    .sub-quick-save {
      padding: 2px 8px; border-radius: 4px; border: 0;
      background: var(--accent-color); color: #fff;
      font-family: inherit; font-size: 11px; cursor: pointer;
    }

    /* CDK drag styles */
    .sub-placeholder {
      height: 33px; background: var(--surface-border);
      border-radius: 4px; margin: 2px 0;
    }
    .subtasks.cdk-drop-list-dragging .sub-row:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0,0,0.2,1);
    }

  `],
})
export class TodoItemComponent {
  private dialog    = inject(Dialog);
  private api       = inject(ApiService);
  dragState         = inject(DragStateService);

  @Input({ required: true }) todo!: any;
  @Input() flowSteps: FlowStep[] = DEFAULT_STEPS;

  @Output() open              = new EventEmitter<any>();
  @Output() advance           = new EventEmitter<any>();
  @Output() complete          = new EventEmitter<any>();
  @Output() delete            = new EventEmitter<string>();
  @Output() assigned          = new EventEmitter<any>();
  @Output() subtaskReordered  = new EventEmitter<any>();
  @Output() subtaskDropped    = new EventEmitter<SubtaskDroppedEvent>();
  @Output() subtaskCreated    = new EventEmitter<{ parentId: string; sub: any }>();

  quickSubtask = '';
  addingSubtask = signal(false);

  prioritySvc       = inject(PriorityService);
  private sanitizer = inject(DomSanitizer);

  onDescClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('a')) e.stopPropagation();
  }

  sanitizeHtml(html: string): SafeHtml {
    const urlPattern = /\b(https?:\/\/[^\s<>"]+)/g;
    // Auto-link bare URLs in text nodes (between tags) only
    const linked = html.replace(/(>[^<]+)/g, (textNode) =>
      textNode.replace(urlPattern, (url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
      )
    );
    // Ensure any pre-existing <a> tags also open in a new tab
    const patched = linked.replace(/<a\s(?![^>]*target=)/gi, '<a target="_blank" rel="noopener noreferrer" ');
    return this.sanitizer.bypassSecurityTrustHtml(patched);
  }

  // ── Helpers ──────────────────────────────────────────
  stepLabel(index: number): string {
    const s = this.flowSteps[index];
    if (!s) return 'Step ' + index;
    return typeof s === 'string' ? (s as any) : s.label;
  }
  stepStyle(index: number): Record<string, string> {
    const s = this.flowSteps[index];
    if (s && typeof s !== 'string') return { background: s.bg, color: s.color };
    const palette = [
      { color: '#1565c0', bg: '#e3f2fd' },
      { color: '#e65100', bg: '#fff3e0' },
      { color: '#1b5e20', bg: '#e8f5e9' },
    ];
    const c = palette[index] ?? { color: '#546e7a', bg: '#eceff1' };
    return { background: c.bg, color: c.color };
  }
  get isCompleted(): boolean { return this.todo.flow_step_index >= this.flowSteps.length - 1; }
  isSubDone(sub: any): boolean { return sub.flow_step_index >= this.flowSteps.length - 1; }
  get isOverdue(): boolean {
    return !!this.todo.due_date && this.todo.due_date * 1000 < Date.now() && !this.isCompleted;
  }
  get hasMeta(): boolean {
    const a = this.todo.assignees as Assignees | undefined;
    const hasAssignee = !!a && (a.users.length + a.teams.length) > 0;
    return !!(this.todo.due_date || hasAssignee || this.todo.is_recurring || this.todo.subtodos?.length || this.todo.reminder_count > 0 || this.todo.priority > 0 || this.todo.attachment_count > 0 || this.todo.comment_count > 0);
  }

  isAssigned(todo: any): boolean {
    const a = todo.assignees as Assignees | undefined;
    return !!a && (a.users.length + a.teams.length) > 0;
  }

  assignBtnLabel(todo: any): string {
    const a = todo.assignees as Assignees | undefined;
    if (!a) return 'Assign';
    const total = a.users.length + a.teams.length;
    if (total === 0) return 'Assign';
    if (total === 1) return a.users[0]?.name?.split(' ')[0] ?? a.teams[0]?.name ?? 'Assign';
    return `${total} assigned`;
  }

  assigneeLabel(todo: any): string {
    const a = todo.assignees as Assignees | undefined;
    if (!a) return '';
    const all = [...a.users.map((u: any) => u.name.split(' ')[0]), ...a.teams.map((t: any) => t.name)];
    if (all.length === 0) return '';
    if (all.length <= 2) return all.join(', ');
    return `${all[0]}, +${all.length - 1} more`;
  }

  undone(todo: any): void {
    this.api.patch<any>(`/todos/${todo.id}/set-step`, { stepIndex: 0 }).subscribe((updated) => {
      this.assigned.emit(updated);
    });
  }

  openDueDateReminder(e: MouseEvent): void {
    e.stopPropagation();
    const ref = this.dialog.open(DueDateReminderDialogComponent, {
      width: '360px',
      maxHeight: '80vh',
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop',
      panelClass: 'app-dialog-panel',
      data: { todo: this.todo },
    });
    ref.closed.subscribe((updated: any) => {
      if (updated) this.assigned.emit(updated);
    });
  }

  onReminderChanged(partial: Partial<any>): void {
    if (partial['reminder_count'] !== undefined) {
      this.todo.reminder_count = partial['reminder_count'];
    }
  }

  // ── Quick-add subtask ─────────────────────────────────
  openQuickAdd(): void {
    this.addingSubtask.set(true);
    setTimeout(() => {
      (document.getElementById(`sub-input-${this.todo.id}`) as HTMLInputElement)?.focus();
    }, 0);
  }

  submitQuickSubtask(): void {
    const title = this.quickSubtask.trim();
    if (!title) return;
    this.quickSubtask = '';
    this.api.post<any>('/todos', {
      title,
      projectId: this.todo.project_id,
      parentTodoId: this.todo.id,
    }).subscribe((sub) => {
      this.subtaskCreated.emit({ parentId: this.todo.id, sub });
      setTimeout(() => {
        (document.getElementById(`sub-input-${this.todo.id}`) as HTMLInputElement)?.focus();
      }, 0);
    });
  }

  onQuickSubtaskBlur(): void {
    // Small delay to allow click on Add button to fire first
    setTimeout(() => {
      if (!this.quickSubtask.trim()) {
        this.addingSubtask.set(false);
      }
    }, 150);
  }

  // ── Subtask drop predicate ────────────────────────────
  /** Accept subtasks from any parent AND main tasks (for demotion). Reject self-drop. */
  subPredicate = (data: any): boolean =>
    data?.type === 'subtask' ||
    (data?.type === 'task' && data?.todo?.id !== this.todo.id);

  // ── Subtask drop handler ──────────────────────────────
  onSubDrop(event: AppDropEvent): void {
    const data = event.dragData;

    if (data?.type === 'subtask') {
      const isSameParent = event.fromZoneId === event.toZoneId;
      if (isSameParent) {
        // ── Reorder within same parent ──────────────────
        const subs = [...(this.todo.subtodos ?? [])];
        subs.splice(event.currentIndex, 0, ...subs.splice(event.previousIndex, 1));
        const updated = { ...this.todo, subtodos: subs };
        this.subtaskReordered.emit(updated);
        this.api.patch('/todos/reorder', subs.map((s: any, i: number) => ({ id: s.id, sortOrder: i }))).subscribe();
      } else {
        // ── Move subtask to a different parent ──────────
        this.subtaskDropped.emit({
          type: 'reattach',
          item: data.sub,
          oldParentId: data.parentId,
          newParentId: this.todo.id,
          currentIndex: event.currentIndex,
        });
      }
    } else if (data?.type === 'task') {
      // ── Demote main task to subtask of this todo ──────
      const subtasksToFlatten: any[] = data.todo.subtodos ?? [];
      if (subtasksToFlatten.length > 0) {
        const ok = window.confirm(
          `"${data.todo.title}" has ${subtasksToFlatten.length} subtask(s).\n\n` +
          `They will all become subtasks of "${this.todo.title}" as well. Continue?`,
        );
        if (!ok) return;
      }
      this.subtaskDropped.emit({
        type: 'demote',
        item: data.todo,
        newParentId: this.todo.id,
        currentIndex: event.currentIndex,
        subtasksToFlatten: subtasksToFlatten.length > 0 ? subtasksToFlatten : undefined,
      });
    }
  }

}
