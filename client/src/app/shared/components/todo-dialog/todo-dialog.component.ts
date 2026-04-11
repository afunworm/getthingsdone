import { Component, inject, OnInit, signal, computed, ViewChild, ElementRef, ChangeDetectorRef, SecurityContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { DialogRef, DIALOG_DATA, Dialog } from '@angular/cdk/dialog';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AssignDialogComponent, Assignees } from '../assign-dialog/assign-dialog.component';
import { RichTextEditorComponent } from '../rich-text-editor/rich-text-editor.component';

interface StepDef { label: string; color: string; bg: string; }
const DEFAULT_STEPS: StepDef[] = [
  { label: 'New',         color: '#1565c0', bg: '#e3f2fd' },
  { label: 'In Progress', color: '#e65100', bg: '#fff3e0' },
  { label: 'Done',        color: '#1b5e20', bg: '#e8f5e9' },
];

@Component({
  selector: 'app-todo-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, RichTextEditorComponent],
  template: `
    <div class="dialog-card">

      <!-- ── Header ─────────────────────────────────────── -->
      <div class="dialog-header">
        @if (isCreate) {
          <span class="dialog-title">New Task</span>
        } @else {
          <div class="title-area">
            @if (!editingTitle()) {
              <div class="step-chip-wrap">
                <button class="step-chip step-chip-btn" [ngStyle]="stepStyle(todo.flow_step_index)"
                  (click)="stepPickerOpen.set(!stepPickerOpen())" title="Change step" tabindex="-1">
                  {{ stepLabel(todo.flow_step_index) }}
                  <span class="material-icons" style="font-size:10px;margin-left:2px">arrow_drop_down</span>
                </button>
                @if (stepPickerOpen()) {
                  <div class="step-backdrop" (click)="stepPickerOpen.set(false)"></div>
                  <div class="step-picker">
                    @for (s of steps; track $index) {
                      <button class="step-opt" [ngStyle]="stepStyle($index)"
                        [class.step-opt-active]="$index === todo.flow_step_index"
                        (click)="setStep($index); stepPickerOpen.set(false)">
                        {{ s.label }}
                      </button>
                    }
                  </div>
                }
              </div>
              <span class="task-title" (click)="startEditTitle()">{{ todo.title }}</span>
              <button class="btn-icon edit-icon" (click)="startEditTitle()" title="Edit title">
                <span class="material-icons" style="font-size:14px">edit</span>
              </button>
            } @else {
              <input
                #titleInput
                class="title-input"
                [(ngModel)]="titleDraft"
                (keydown.enter)="saveTitle()"
                (keydown.escape)="editingTitle.set(false)"
                (blur)="saveTitle()"
              />
            }
          </div>
        }
        <button class="btn-icon close-btn" (click)="close()">
          <span class="material-icons" style="font-size:16px">close</span>
        </button>
      </div>

      @if (!isCreate) {
        <!-- ── Meta row ──────────────────────────────────── -->
        <div class="meta-row">
          <!-- Due date (display only — edit in Schedule section) -->
          <span class="meta-chip meta-static" [class.overdue]="isOverdue">
            <span class="material-icons" style="font-size:12px">event</span>
            {{ dueDateLabel }}
          </span>

          <!-- Step control -->
          @if (isCompleted) {
            <button class="meta-chip meta-undone" (click)="setStep(0)" title="Move back to first step">
              <span class="material-icons" style="font-size:12px">undo</span>
              Mark Undone
            </button>
          } @else {
            <button class="meta-chip meta-advance" (click)="setStep(todo.flow_step_index + 1)" [title]="'Move to: ' + nextStepLabel">
              <span class="material-icons" style="font-size:12px">arrow_forward</span>
              {{ nextStepLabel }}
            </button>
          }


          <!-- Assignees (projects only — personal inbox is private) -->
          @if (todo.project_id) {
            <button class="meta-chip" [class.meta-assigned]="hasAssignees" (click)="openAssign()">
              <span class="material-icons" style="font-size:12px">person</span>
              {{ assigneeLabel }}
            </button>
          }

          <!-- Recurring (display only — edit in Schedule section) -->
          @if (todo.is_recurring) {
            <span class="meta-chip meta-static">
              <span class="material-icons" style="font-size:12px">repeat</span>
              {{ recurrenceLabel }}
            </span>
          }

          <!-- Created by -->
          <div class="creator-wrap">
            <button
              class="meta-chip meta-static meta-creator"
              [class.meta-creator-btn]="todo.project_id && accessibleUsers().length > 1"
              (click)="todo.project_id && accessibleUsers().length > 1 && creatorPickerOpen.set(!creatorPickerOpen())"
              [title]="todo.project_id && accessibleUsers().length > 1 ? 'Change creator' : ''"
            >
              <span class="material-icons" style="font-size:12px">edit_note</span>
              {{ creatorLabel }}
            </button>
            @if (creatorPickerOpen()) {
              <div class="creator-backdrop" (click)="creatorPickerOpen.set(false)"></div>
              <div class="creator-menu">
                @for (u of accessibleUsers(); track u.id) {
                  <button class="creator-opt" [class.active]="u.id === todo.created_by" (click)="changeCreator(u)">
                    <span class="material-icons" style="font-size:13px;opacity:{{ u.id === todo.created_by ? 1 : 0 }}">check</span>
                    {{ u.name }}
                  </button>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- ── Body ───────────────────────────────────────── -->
      <div class="dialog-body">

        @if (isCreate) {
          <!-- Create form -->
          <div class="field">
            <label class="field-label">Task title *</label>
            <input class="field-input" [(ngModel)]="form.title" placeholder="What needs to be done?" />
          </div>
          <div class="field">
            <label class="field-label">Description</label>
            <textarea class="field-textarea" [(ngModel)]="form.description" rows="3" placeholder="Optional"></textarea>
          </div>
          <div class="field">
            <label class="field-label">Due date</label>
            <input class="field-input" type="date" [(ngModel)]="form.dueDateStr" />
          </div>
          <div class="recurrence-row">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="form.isRecurring" />
              Recurring task
            </label>
            @if (form.isRecurring) {
              <span style="font-size:13px;color:var(--text-secondary)">Every</span>
              <input class="field-input inline-num" type="number" [(ngModel)]="form.recurrenceInterval" min="1" />
              <select class="field-select inline-sel" [(ngModel)]="form.recurrenceType">
                <option value="daily">Days</option>
                <option value="weekly">Weeks</option>
                <option value="monthly">Months</option>
              </select>
            }
          </div>

          <!-- Assignees (create mode — projects only) -->
          @if (!data.isInbox) {
          <div class="field">
            <label class="field-label">Assignees</label>
            <div class="create-assignees">
              @for (u of form.createAssignees.users; track u.id) {
                <span class="chip user-chip">
                  {{ u.name.split(' ')[0] }}
                  <button class="chip-remove" (click)="removeCreateUser(u.id)">
                    <span class="material-icons" style="font-size:11px">close</span>
                  </button>
                </span>
              }
              @for (t of form.createAssignees.teams; track t.id) {
                <span class="chip team-chip">
                  {{ t.name }}
                  <button class="chip-remove" (click)="removeCreateTeam(t.id)">
                    <span class="material-icons" style="font-size:11px">close</span>
                  </button>
                </span>
              }
              <button class="btn btn-ghost btn-sm" style="display:inline-flex;align-items:center;gap:4px" (click)="openCreateAssign()">
                <span class="material-icons" style="font-size:13px">person_add</span>
                Assign
              </button>
            </div>
          </div>
          } <!-- end @if (!data.isInbox) -->

          <!-- Sub-tasks (create mode) -->
          <div class="field">
            <label class="field-label">Sub-tasks</label>
            @for (s of form.createSubtasks; track $index) {
              <div class="create-subtask-row">
                <span class="material-icons" style="font-size:13px;color:var(--text-muted)">subdirectory_arrow_right</span>
                <span class="create-sub-title">{{ s }}</span>
                <button class="btn-icon danger-btn" (click)="removeCreateSubtask($index)">
                  <span class="material-icons" style="font-size:13px">close</span>
                </button>
              </div>
            }
            <div class="subtask-add">
              <input
                class="subtask-input"
                [(ngModel)]="newCreateSubtask"
                placeholder="Add sub-task..."
                (keydown.enter)="addCreateSubtask()"
              />
              @if (newCreateSubtask.trim()) {
                <button class="btn btn-primary btn-sm" (click)="addCreateSubtask()">Add</button>
              }
            </div>
          </div>

        } @else {
          <!-- ── Parent task context (subtasks only) ───── -->
          @if (todo.parent_todo_id && todo._parent) {
            <div class="parent-ctx">
              <span class="parent-ctx-label">
                <span class="material-icons" style="font-size:11px;vertical-align:middle">subdirectory_arrow_right</span>
                {{ todo._parent.title }}
              </span>
              @if (todo._parent.description) {
                <span class="ctx-desc">{{ todo._parent.description }}</span>
              }
            </div>
          }

          <!-- ── Description ───────────────────────────── -->
          <div class="section">
            <div class="section-hdr">
              <span class="section-label">Description</span>
              @if (!editingDesc()) {
                <button class="btn-icon edit-icon" (click)="startEditDesc()" title="Edit description">
                  <span class="material-icons" style="font-size:13px">edit</span>
                </button>
              }
            </div>
            @if (!editingDesc()) {
              <p class="desc-text" [class.desc-muted]="!todo.description" (click)="startEditDesc()">
                {{ todo.description || 'No description — click to add' }}
              </p>
            } @else {
              <textarea class="field-textarea" [(ngModel)]="descDraft" rows="4" autoFocus></textarea>
              <div class="inline-actions">
                <button class="btn btn-primary btn-sm" (click)="saveDesc()">Save</button>
                <button class="btn btn-ghost btn-sm" (click)="editingDesc.set(false)">Cancel</button>
              </div>
            }
          </div>

          <!-- ── Schedule ──────────────────────────────────── -->
          <div class="section">
            <div class="section-hdr">
              <span class="section-label">Schedule</span>
            </div>
            <div class="sch-grid">
              <div class="sch-row">
                <span class="material-icons sch-icon">event</span>
                <input type="date" class="sch-date-input"
                  [ngModel]="schedDueDate()" (ngModelChange)="schedDueDate.set($event)" />
                @if (schedDueDate()) {
                  <button class="sch-clear" (click)="schedDueDate.set('')" title="Clear due date">
                    <span class="material-icons" style="font-size:12px">close</span>
                  </button>
                }
              </div>
              <div class="sch-row">
                <span class="material-icons sch-icon">repeat</span>
                <label class="sch-toggle-label">
                  <input type="checkbox"
                    [ngModel]="schedRecurring()" (ngModelChange)="schedRecurring.set($event)" />
                  Recurring
                </label>
                @if (schedRecurring()) {
                  <span class="sch-every">every</span>
                  <input type="number" class="sch-num" min="1"
                    [ngModel]="schedInterval()" (ngModelChange)="schedInterval.set(+$event)" />
                  <select class="sch-type"
                    [ngModel]="schedType()" (ngModelChange)="schedType.set($event)">
                    <option value="daily">days</option>
                    <option value="weekly">weeks</option>
                    <option value="monthly">months</option>
                  </select>
                }
              </div>
            </div>
            @if (schedDirty()) {
              <div class="inline-actions" style="margin-top:8px">
                <button class="btn btn-primary btn-sm" (click)="saveSchedule()">Save</button>
                <button class="btn btn-ghost btn-sm" (click)="resetSchedule()">Cancel</button>
              </div>
            }
          </div>

          <!-- ── Reminders ─────────────────────────────────── -->
          <div class="section">
            <div class="section-hdr">
              <span class="material-icons" style="font-size:14px;color:var(--text-muted)">alarm</span>
              <span class="section-label">Reminders</span>
              <span class="section-count">{{ reminders().length }}</span>
            </div>
            <!-- Quick add buttons -->
            <div class="reminder-quick">
              <button class="reminder-quick-btn" (click)="addReminderIn(1, 'day')">In 1 day</button>
              <button class="reminder-quick-btn" (click)="addReminderIn(3, 'day')">In 3 days</button>
              <button class="reminder-quick-btn" (click)="addReminderIn(1, 'week')">In 1 week</button>
              <span class="reminder-sep">or</span>
              <input type="datetime-local" class="reminder-date-input" [(ngModel)]="customReminderDate" />
              @if (customReminderDate) {
                <button class="btn btn-primary btn-sm" (click)="addCustomReminder()">Set</button>
              }
            </div>
            <!-- Existing reminders -->
            @for (r of reminders(); track r.id) {
              <div class="reminder-row" [class.reminder-sent]="r.sent">
                <span class="material-icons" style="font-size:14px;color:var(--text-muted)">
                  {{ r.sent ? 'check_circle' : 'alarm' }}
                </span>
                <span class="reminder-time">{{ formatReminder(r) }}</span>
                @if (r.sent) { <span class="reminder-sent-label">sent</span> }
                @if (!r.sent) {
                  <button class="btn-icon reminder-del" (click)="deleteReminder(r.id)" title="Remove reminder">
                    <span class="material-icons" style="font-size:13px">close</span>
                  </button>
                }
              </div>
            }
            @if (reminders().length === 0) {
              <p class="no-reminders">No reminders set</p>
            }
          </div>

          <!-- ── Sub-tasks (only for top-level tasks) ─────── -->
          @if (!todo.parent_todo_id) {
          <div class="section">
            <div class="section-hdr">
              <span class="section-label">Sub-tasks</span>
              <span class="section-count">{{ todo.subtodos?.length ?? 0 }}</span>
            </div>

            @for (sub of todo.subtodos ?? []; track sub.id) {
              <div class="subtask-row" [class.sub-done]="isSubDone(sub)">
                <span class="sub-chip" [ngStyle]="stepStyle(sub.flow_step_index)">
                  {{ stepLabel(sub.flow_step_index) }}
                </span>
                <span class="sub-title">{{ sub.title }}</span>
                <div class="sub-actions">
                  <button class="icon-btn" (click)="advanceSub(sub)" [disabled]="isSubDone(sub)"
                    [title]="'Move to: ' + subNextStepLabel(sub)">
                    <span class="material-icons" style="font-size:14px">arrow_forward</span>
                  </button>
                  <button class="icon-btn sub-assign-btn" [class.sub-assigned]="subHasAssignees(sub)"
                    (click)="openSubAssign(sub)" title="Assign">
                    <span class="material-icons" style="font-size:13px">person_add</span>
                  </button>
                  <button class="icon-btn" [class.done-active]="isSubDone(sub)"
                          (click)="isSubDone(sub) ? undoneSub(sub) : completeSub(sub)"
                          [title]="isSubDone(sub) ? 'Click to undo' : 'Mark done'">
                    <span class="material-icons" style="font-size:14px">
                      {{ isSubDone(sub) ? 'check_circle' : 'check_circle_outline' }}
                    </span>
                  </button>
                  <button class="icon-btn danger-btn" (click)="deleteSub(sub.id)" title="Delete">
                    <span class="material-icons" style="font-size:13px">delete</span>
                  </button>
                </div>
              </div>
            }

            <div class="subtask-add">
              <input
                class="subtask-input"
                [(ngModel)]="newSubtask"
                placeholder="Add sub-task..."
                (keydown.enter)="addSubtask()"
              />
              @if (newSubtask.trim()) {
                <button class="btn btn-primary btn-sm" (click)="addSubtask()">Add</button>
              }
            </div>
          </div>
          } <!-- end @if (!todo.parent_todo_id) -->

          <!-- ── Comments ───────────────────────────────── -->
          <div class="section">
            <div class="section-hdr">
              <span class="section-label">Comments</span>
              <span class="section-count">{{ comments().length }}</span>
            </div>
            <div class="comments-list">
              @for (c of comments(); track c.id) {
                <div class="comment">
                  <div class="comment-hdr">
                    <span class="comment-author">{{ c.user_name }}</span>
                    <span class="comment-date">{{ c.created_at * 1000 | date:'MMM d, h:mm a' }}</span>
                  </div>
                  <div class="comment-body" [innerHTML]="sanitize(c.body)"></div>
                  @if (c.attachments?.length) {
                    <div class="attachments">
                      @for (a of c.attachments; track a.id) {
                        <a [href]="'/uploads/' + a.filename" target="_blank" class="attachment-chip">
                          <span class="material-icons" style="font-size:11px">attach_file</span>
                          {{ a.original_name }}
                        </a>
                      }
                    </div>
                  }
                </div>
              }
              @if (comments().length === 0) {
                <p class="no-comments">No comments yet</p>
              }
            </div>
            <div class="comment-compose">
              <div class="rte-field">
                <app-rich-text-editor
                  #commentEditor
                  [users]="accessibleUsers()"
                  placeholder="Add a comment… (@ to mention)"
                  (htmlChange)="newComment = $event"
                ></app-rich-text-editor>
              </div>
              <div style="display:flex;justify-content:flex-end">
                <button class="btn btn-primary btn-sm" [disabled]="!newComment.trim()" (click)="postComment()">Post</button>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- ── Footer ─────────────────────────────────────── -->
      <div class="dialog-footer">
        @if (isCreate) {
          <button class="btn btn-ghost" (click)="close()">Cancel</button>
          <button class="btn btn-primary" [disabled]="!form.title.trim()" (click)="submit()">Create Task</button>
        } @else {
          <button class="btn btn-danger" (click)="deleteTodo()">
            <span class="material-icons" style="font-size:14px">delete</span>
            Delete
          </button>
          <span style="flex:1"></span>
          <button class="btn btn-ghost" (click)="close()">Close</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .dialog-card {
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 12px; box-shadow: var(--shadow-md);
      display: flex; flex-direction: column; width: 100%; max-height: 90vh;
      overflow: hidden;
    }

    /* ── Header ──────────────────────────────────── */
    .dialog-header {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 14px 10px; border-bottom: 1px solid var(--surface-border);
      flex-shrink: 0; min-height: 46px;
    }
    .dialog-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
    .close-btn { margin-left: auto; flex-shrink: 0; }

    .title-area {
      display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0;
    }
    .step-chip-wrap { position: relative; flex-shrink: 0; }
    .step-chip {
      display: inline-flex; align-items: center;
      padding: 2px 7px; border-radius: 20px; flex-shrink: 0;
      font-size: 10px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase;
      white-space: nowrap;
    }
    .step-chip-btn {
      border: 0; cursor: pointer; font-family: inherit;
      &:hover { filter: brightness(1.1); }
    }
    .step-backdrop { position: fixed; inset: 0; z-index: 10; }
    .step-picker {
      position: absolute; top: calc(100% + 4px); left: 0;
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 8px; box-shadow: var(--shadow-md);
      padding: 4px; min-width: 130px; z-index: 11;
      animation: fadeIn 100ms ease-out;
    }
    .step-opt {
      display: block; width: 100%; text-align: left;
      padding: 5px 10px; border: 0; border-radius: 5px;
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 700;
      letter-spacing: .3px; text-transform: uppercase;
      transition: filter 80ms;
      &:hover { filter: brightness(1.15); }
    }
    .step-opt-active { outline: 2px solid currentColor; outline-offset: -2px; }
    .task-title {
      flex: 1; font-size: 15px; font-weight: 600; color: var(--text-primary);
      cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      &:hover { color: var(--accent-color); }
    }
    .edit-icon {
      opacity: 0; flex-shrink: 0; color: var(--text-muted);
      transition: opacity 120ms;
      .title-area:hover & { opacity: 1; }
      .section-hdr:hover & { opacity: 1; }
    }
    .title-input {
      flex: 1; padding: 3px 8px; border: 1px solid var(--accent-color);
      border-radius: 6px; background: var(--surface-card);
      font-family: inherit; font-size: 15px; font-weight: 600;
      color: var(--text-primary); outline: none;
    }

    /* ── Meta row ────────────────────────────────── */
    .meta-row {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      padding: 7px 14px; border-bottom: 1px solid var(--surface-border);
      flex-shrink: 0;
    }
    .meta-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 9px; border-radius: 20px;
      font-size: 11px; font-weight: 500; cursor: pointer;
      border: 1px solid var(--surface-border);
      background: var(--surface-hover); color: var(--text-secondary);
      transition: border-color 100ms, color 100ms;
      &:hover { border-color: var(--accent-color); color: var(--accent-color); }
      &.overdue { color: #d32f2f; border-color: #d32f2f; background: #fde8e8; }
      &.meta-advance { color: var(--accent-color); border-color: var(--accent-color); }
      &.meta-undone  { color: var(--text-secondary); border-color: var(--surface-border);
        &:hover { color: #e65100; border-color: #e65100; } }
      &.meta-assigned { background: color-mix(in srgb, var(--accent-color) 10%, transparent); border-color: var(--accent-color); color: var(--accent-color); }
      &.meta-static  { cursor: default; &:hover { border-color: var(--surface-border); color: var(--text-secondary); } }
&.meta-creator { font-style: italic; color: var(--text-muted); }
    }
    .date-input {
      padding: 3px 8px; border: 1px solid var(--accent-color); border-radius: 6px;
      background: var(--surface-card); font-family: inherit; font-size: 11px;
      color: var(--text-primary); outline: none;
    }

    /* ── Body ────────────────────────────────────── */
    .dialog-body {
      padding: 12px 14px; display: flex; flex-direction: column; gap: 0;
      overflow-y: auto; flex: 1;
    }

    /* Create form fields */
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .recurrence-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; input { cursor: pointer; } }
    .inline-num { width: 60px !important; }
    .inline-sel { width: 90px !important; }

    /* Sections */
    .section {
      padding: 10px 0; border-bottom: 1px solid var(--surface-border);
      &:last-child { border-bottom: 0; }
    }
    .section-hdr {
      display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
    }
    .section-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .4px; color: var(--text-muted);
    }
    .section-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px;
      background: var(--surface-hover); border-radius: 9px;
      font-size: 10px; font-weight: 700; color: var(--text-muted);
    }

    /* Parent context (shown for subtasks) */
    .parent-ctx {
      display: flex; flex-direction: column; gap: 2px;
      padding: 7px 10px; margin-bottom: 2px;
      background: var(--surface-hover); border-radius: 6px;
      border-left: 2px solid var(--surface-border);
    }
    .parent-ctx-label {
      font-size: 11px; font-weight: 600; color: var(--text-muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ctx-desc {
      font-size: 11px; color: var(--text-muted); line-height: 1.4;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* Description */
    .desc-text {
      margin: 0; font-size: 13px; line-height: 1.6; color: var(--text-primary);
      cursor: pointer; padding: 4px 0;
      &:hover { color: var(--accent-color); }
      &.desc-muted { color: var(--text-muted); font-style: italic; }
    }
    .inline-actions { display: flex; gap: 6px; margin-top: 6px; }
    .btn-sm { padding: 4px 12px; font-size: 12px; }

    /* Schedule section */
    .sch-grid { display: flex; flex-direction: column; gap: 6px; }
    .sch-row {
      display: flex; align-items: center; gap: 8px;
    }
    .sch-icon { font-size: 15px !important; color: var(--text-muted); flex-shrink: 0; }
    .sch-date-input {
      padding: 3px 8px; border: 1px solid var(--surface-border); border-radius: 6px;
      background: var(--surface-hover); font-family: inherit; font-size: 12px;
      color: var(--text-primary); outline: none;
      &:focus { border-color: var(--accent-color); }
    }
    .sch-clear {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border: 0; border-radius: 4px;
      background: transparent; color: var(--text-muted); cursor: pointer;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }
    .sch-toggle-label {
      display: flex; align-items: center; gap: 5px;
      font-size: 12px; color: var(--text-secondary); cursor: pointer;
      input { cursor: pointer; }
    }
    .sch-every { font-size: 12px; color: var(--text-muted); }
    .sch-num {
      width: 52px; padding: 3px 6px; border: 1px solid var(--surface-border); border-radius: 6px;
      background: var(--surface-hover); font-family: inherit; font-size: 12px;
      color: var(--text-primary); outline: none; text-align: center;
      &:focus { border-color: var(--accent-color); }
    }
    .sch-type {
      padding: 3px 6px; border: 1px solid var(--surface-border); border-radius: 6px;
      background: var(--surface-hover); font-family: inherit; font-size: 12px;
      color: var(--text-primary); outline: none; cursor: pointer;
      &:focus { border-color: var(--accent-color); }
    }

    /* Create-mode assignees & chips */
    .create-assignees {
      display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
    }
    .chip {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 6px 2px 8px; border-radius: 20px;
      font-size: 11px; font-weight: 500;
    }
    .user-chip { background: color-mix(in srgb, var(--accent-color) 15%, transparent); color: var(--accent-color); }
    .team-chip { background: color-mix(in srgb, #7b1fa2 15%, transparent); color: #7b1fa2; }
    .chip-remove {
      display: inline-flex; align-items: center; justify-content: center;
      border: 0; background: transparent; cursor: pointer; padding: 0;
      color: inherit; opacity: .7; &:hover { opacity: 1; }
    }

    /* Create-mode subtask rows */
    .create-subtask-row {
      display: flex; align-items: center; gap: 6px;
      padding: 3px 0;
    }
    .create-sub-title {
      flex: 1; font-size: 13px; color: var(--text-secondary);
    }

    /* Sub-tasks */
    .subtask-row {
      display: flex; align-items: center; gap: 7px;
      padding: 5px 4px; border-radius: 5px;
      transition: background 80ms;
      &:hover { background: var(--surface-hover); }
      &.sub-done { opacity: .5; }
    }
    .sub-chip {
      display: inline-flex; align-items: center;
      padding: 1px 6px; border-radius: 20px; flex-shrink: 0;
      font-size: 9px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase;
      white-space: nowrap;
    }
    .sub-title {
      flex: 1; font-size: 13px; color: var(--text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sub-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
    .icon-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border: 0; border-radius: 4px;
      background: transparent; color: var(--text-muted); cursor: pointer;
      transition: background 80ms, color 80ms;
      &:hover:not(:disabled) { background: var(--surface-border); color: var(--text-primary); }
      &:disabled { opacity: .3; cursor: default; }
      &.done-active { color: #1b5e20; }
    }
    .danger-btn { &:hover:not(:disabled) { color: #d32f2f; background: #fde8e8; } }
    .sub-assign-btn { &:hover { color: var(--accent-color) !important; } }
    .sub-assigned { color: var(--accent-color); }

    .subtask-add {
      display: flex; align-items: center; gap: 7px; margin-top: 6px;
    }
    .subtask-input {
      flex: 1; padding: 5px 9px;
      border: 1px solid var(--surface-border); border-radius: 6px;
      background: var(--surface-hover); font-family: inherit; font-size: 13px;
      color: var(--text-primary); outline: none;
      transition: border-color 100ms;
      &::placeholder { color: var(--text-muted); }
      &:focus { border-color: var(--accent-color); background: var(--surface-card); }
    }

    /* Comments */
    .comments-list {
      display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;
      max-height: 200px; overflow-y: auto;
    }
    .comment { padding: 8px 10px; background: var(--surface-hover); border-radius: 6px; }
    .comment-hdr { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .comment-author { font-size: 12px; font-weight: 600; color: var(--text-primary); }
    .comment-date { font-size: 11px; color: var(--text-muted); }
    .comment-body { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-primary);
      p { margin: 0 0 4px; } p:last-child { margin-bottom: 0; }
      ul, ol { padding-left: 18px; margin: 4px 0; }
      strong { font-weight: 600; } em { font-style: italic; }
      code { background: var(--surface-hover); border-radius: 3px; padding: 1px 4px; font-size: 12px; font-family: monospace; }
      .mention { display: inline-block; background: color-mix(in srgb, var(--accent-color) 12%, transparent);
        color: var(--accent-color); border-radius: 4px; padding: 0 4px; font-weight: 500; font-size: 12px; }
    }
    .rte-field {
      border: 1px solid var(--surface-border); border-radius: 7px;
      padding: 7px 10px; background: var(--surface-bg);
      transition: border-color 120ms;
      &:focus-within { border-color: var(--accent-color); background: var(--surface-card); }
    }
    .no-comments { text-align: center; color: var(--text-muted); font-size: 13px; padding: 12px 0; margin: 0; }

    /* Reminders */
    .reminder-quick {
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
      margin-bottom: 8px;
    }
    .reminder-quick-btn {
      font-size: 12px; padding: 3px 10px;
      border: 1px solid var(--surface-border); border-radius: 12px;
      background: transparent; cursor: pointer; color: var(--text-secondary);
      font-family: inherit; transition: border-color 100ms, color 100ms;
      &:hover { border-color: var(--accent-color); color: var(--accent-color); }
    }
    .reminder-sep { font-size: 12px; color: var(--text-muted); }
    .reminder-date-input {
      font-size: 12px; padding: 3px 7px;
      border: 1px solid var(--surface-border); border-radius: 6px;
      background: var(--surface-bg); color: var(--text-primary);
      font-family: inherit;
    }
    .reminder-row {
      display: flex; align-items: center; gap: 7px;
      padding: 5px 0; border-bottom: 1px solid var(--surface-border);
      &:last-of-type { border-bottom: 0; }
    }
    .reminder-sent { opacity: 0.55; }
    .reminder-time { flex: 1; font-size: 13px; color: var(--text-secondary); }
    .reminder-sent-label {
      font-size: 10px; font-weight: 600; padding: 1px 6px;
      background: color-mix(in srgb, #43a047 15%, transparent);
      color: #43a047; border-radius: 8px;
    }
    .reminder-del {
      width: 20px; height: 20px; opacity: 0;
      transition: opacity 120ms;
      .reminder-row:hover & { opacity: 1; }
    }
    .no-reminders { color: var(--text-muted); font-size: 13px; margin: 6px 0 0; }
    .attachments { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .attachment-chip {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 11px; padding: 2px 7px;
      background: var(--surface-border); border-radius: 10px;
      text-decoration: none; color: var(--accent-color);
    }
    .comment-compose { display: flex; flex-direction: column; gap: 6px; }

    /* Creator picker */
    .creator-wrap { position: relative; }
    .meta-creator-btn {
      cursor: pointer !important;
      &:hover { border-color: var(--accent-color); color: var(--accent-color); }
    }
    .creator-backdrop { position: fixed; inset: 0; z-index: 50; }
    .creator-menu {
      position: absolute; top: calc(100% + 4px); left: 0;
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 8px; box-shadow: var(--shadow-md);
      padding: 4px; min-width: 160px; z-index: 51;
    }
    .creator-opt {
      display: flex; align-items: center; gap: 6px;
      width: 100%; padding: 6px 10px; border: 0;
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 12px; color: var(--text-secondary);
      text-align: left; border-radius: 5px; transition: background 100ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.active { color: var(--accent-color); font-weight: 500; }
    }

    /* Footer */
    .dialog-footer {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px 12px; border-top: 1px solid var(--surface-border); flex-shrink: 0;
    }
  `],
})
export class TodoDialogComponent implements OnInit {
  @ViewChild('titleInput') titleInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('commentEditor') commentEditorRef?: RichTextEditorComponent;

  dialogRef = inject(DialogRef<any>);
  data: any = inject(DIALOG_DATA);
  private api = inject(ApiService);
  private dialog = inject(Dialog);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);

  todo: any = this.data.todo ? { ...this.data.todo } : {};
  get isCreate(): boolean { return this.data.mode === 'create'; }

  comments = signal<any[]>([]);
  reminders = signal<any[]>([]);
  accessibleUsers = signal<any[]>([]);
  creatorPickerOpen = signal(false);
  stepPickerOpen    = signal(false);
  newComment = '';
  newSubtask = '';
  newCreateSubtask = '';
  customReminderDate = '';

  // Edit state
  editingTitle = signal(false);
  editingDesc  = signal(false);
  titleDraft = '';
  descDraft  = '';

  // Schedule section (local draft — not saved until Save is clicked)
  schedDueDate  = signal('');
  schedRecurring = signal(false);
  schedInterval  = signal(1);
  schedType      = signal<'daily' | 'weekly' | 'monthly'>('weekly');

  // Saved baseline — used to detect dirty state and to cancel
  private savedDueDate   = '';
  private savedRecurring = false;
  private savedInterval  = 1;
  private savedType: 'daily' | 'weekly' | 'monthly' = 'weekly';

  schedDirty = computed(() =>
    this.schedDueDate()   !== this.savedDueDate   ||
    this.schedRecurring() !== this.savedRecurring ||
    (this.schedRecurring() && (
      this.schedInterval() !== this.savedInterval ||
      this.schedType()     !== this.savedType
    )),
  );

  // Create form
  form = {
    title: '',
    description: '',
    dueDateStr: '',
    isRecurring: false,
    recurrenceInterval: 1,
    recurrenceType: 'weekly' as 'daily' | 'weekly' | 'monthly',
    createAssignees: { users: [] as { id: string; name: string }[], teams: [] as { id: string; name: string }[] },
    createSubtasks: [] as string[],
  };

  get steps(): StepDef[] {
    const fs = this.data.flowSteps;
    if (!fs?.length) return DEFAULT_STEPS;
    return fs.map((s: any, i: number) => typeof s === 'string'
      ? (DEFAULT_STEPS[i] ?? { label: s, color: '#546e7a', bg: '#eceff1' })
      : { label: s.label, color: s.color ?? '#1565c0', bg: s.bg ?? '#e3f2fd' });
  }

  stepLabel(index: number): string {
    return this.steps[index]?.label ?? `Step ${index}`;
  }
  stepStyle(index: number): Record<string, string> {
    const s = this.steps[index];
    if (!s) return {};
    return { background: s.bg, color: s.color };
  }

  get isCompleted(): boolean {
    return this.todo.flow_step_index >= this.steps.length - 1;
  }
  isSubDone(sub: any): boolean {
    return sub.flow_step_index >= this.steps.length - 1;
  }

  get dueDateLabel(): string {
    if (!this.todo.due_date) return 'No due date';
    return new Date(this.todo.due_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  get isOverdue(): boolean {
    return !!this.todo.due_date && this.todo.due_date * 1000 < Date.now() && !this.isCompleted;
  }

  get nextStepLabel(): string {
    const next = this.steps[this.todo.flow_step_index + 1];
    return next ? next.label : 'Done';
  }

  get assigneeLabel(): string {
    const a = this.todo.assignees as Assignees | undefined;
    if (!a) return 'Assign';
    const all = [...(a.users ?? []).map((u: any) => u.name.split(' ')[0]), ...(a.teams ?? []).map((t: any) => t.name)];
    if (all.length === 0) return 'Assign';
    if (all.length === 1) return all[0];
    if (all.length === 2) return all.join(', ');
    return `${all[0]}, +${all.length - 1} more`;
  }

  get hasAssignees(): boolean {
    const a = this.todo.assignees as Assignees | undefined;
    return !!a && ((a.users?.length ?? 0) + (a.teams?.length ?? 0)) > 0;
  }

  get recurrenceLabel(): string {
    const r = this.todo.recurrence_rule;
    if (!r) return 'Recurring';
    return `Every ${r.interval} ${r.type === 'daily' ? 'day' : r.type === 'weekly' ? 'week' : 'month'}${r.interval !== 1 ? 's' : ''}`;
  }

  get creatorLabel(): string {
    const name = this.todo.created_by_name ?? 'Unknown';
    const date = this.todo.created_at
      ? new Date(this.todo.created_at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    return date ? `Created by ${name} · ${date}` : `Created by ${name}`;
  }


  ngOnInit(): void {
    // Intercept backdrop click so we always close with the current todo state
    this.dialogRef.disableClose = true;
    this.dialogRef.overlayRef.backdropClick().subscribe(() => this.close());

    if (!this.isCreate) {
      this.api.get<any[]>(`/comments/todo/${this.todo.id}`).subscribe((c) => this.comments.set(c));
      this.api.get<any[]>(`/notifications/reminders/${this.todo.id}`).subscribe((r) => this.reminders.set(r));
      if (this.todo.project_id) {
        this.api.get<any[]>(`/projects/${this.todo.project_id}/users`).subscribe((u) => this.accessibleUsers.set(u));
      }
      const dd = this.todo.due_date
        ? new Date(this.todo.due_date * 1000).toISOString().slice(0, 10)
        : '';
      const rr = !!this.todo.is_recurring;
      const ri = this.todo.recurrence_rule?.interval ?? 1;
      const rt = this.todo.recurrence_rule?.type ?? 'weekly';
      this.schedDueDate.set(dd);
      this.schedRecurring.set(rr);
      this.schedInterval.set(ri);
      this.schedType.set(rt);
      this.savedDueDate   = dd;
      this.savedRecurring = rr;
      this.savedInterval  = ri;
      this.savedType      = rt;
    }
  }

  // ── Reminders ─────────────────────────────────────────

  addReminderIn(amount: number, unit: 'day' | 'week'): void {
    const ms = unit === 'day' ? amount * 86400000 : amount * 7 * 86400000;
    const remindAt = Math.floor((Date.now() + ms) / 1000);
    const label = `In ${amount} ${unit}${amount !== 1 ? 's' : ''}`;
    this.api.post<any>(`/notifications/reminders/${this.todo.id}`, { remindAt, label })
      .subscribe((r) => this.reminders.update((list) => [...list, r]));
  }

  addCustomReminder(): void {
    if (!this.customReminderDate) return;
    const remindAt = Math.floor(new Date(this.customReminderDate).getTime() / 1000);
    if (remindAt <= Math.floor(Date.now() / 1000)) return;
    this.api.post<any>(`/notifications/reminders/${this.todo.id}`, { remindAt })
      .subscribe((r) => {
        this.reminders.update((list) => [...list, r]);
        this.customReminderDate = '';
      });
  }

  deleteReminder(id: string): void {
    this.api.delete(`/notifications/reminders/item/${id}`).subscribe(() =>
      this.reminders.update((list) => list.filter((r) => r.id !== id)),
    );
  }

  formatReminder(r: any): string {
    const d = new Date(r.remind_at * 1000);
    const label = r.label ? `${r.label} — ` : '';
    return label + d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  // ── Title editing ─────────────────────────────────────
  startEditTitle(): void {
    this.titleDraft = this.todo.title;
    this.editingTitle.set(true);
    setTimeout(() => this.titleInputRef?.nativeElement.select());
  }

  saveTitle(): void {
    const title = this.titleDraft.trim();
    if (!title || title === this.todo.title) { this.editingTitle.set(false); return; }
    this.api.patch<any>(`/todos/${this.todo.id}`, { title }).subscribe((updated) => {
      this.todo = { ...this.todo, ...updated };
      this.editingTitle.set(false);
    });
  }

  // ── Description editing ───────────────────────────────
  startEditDesc(): void {
    this.descDraft = this.todo.description ?? '';
    this.editingDesc.set(true);
  }

  saveDesc(): void {
    this.api.patch<any>(`/todos/${this.todo.id}`, { description: this.descDraft || null }).subscribe((updated) => {
      this.todo = { ...this.todo, ...updated };
      this.editingDesc.set(false);
    });
  }

  // ── Schedule editing ──────────────────────────────────
  saveSchedule(): void {
    const dueDate = this.schedDueDate()
      ? Math.floor(new Date(this.schedDueDate()).getTime() / 1000)
      : null;
    const recurrenceRule = this.schedRecurring()
      ? { interval: this.schedInterval(), type: this.schedType() }
      : null;
    this.api.patch<any>(`/todos/${this.todo.id}`, {
      dueDate,
      isRecurring: this.schedRecurring(),
      recurrenceRule,
    }).subscribe((updated) => {
      this.todo = { ...this.todo, ...updated };
      this.savedDueDate   = this.schedDueDate();
      this.savedRecurring = this.schedRecurring();
      this.savedInterval  = this.schedInterval();
      this.savedType      = this.schedType();
      this.cdr.detectChanges();
    });
  }

  resetSchedule(): void {
    this.schedDueDate.set(this.savedDueDate);
    this.schedRecurring.set(this.savedRecurring);
    this.schedInterval.set(this.savedInterval);
    this.schedType.set(this.savedType);
  }

  // ── Step control ──────────────────────────────────────
  setStep(index: number): void {
    this.todo = { ...this.todo, flow_step_index: index };
    this.api.patch<any>(`/todos/${this.todo.id}/set-step`, { stepIndex: index }).subscribe((updated) => {
      this.todo = { ...this.todo, ...updated };
      this.cdr.detectChanges();
    });
  }

subNextStepLabel(sub: any): string {
    const next = this.steps[sub.flow_step_index + 1];
    return next ? next.label : 'Done';
  }

  subHasAssignees(sub: any): boolean {
    const a = sub.assignees;
    return !!a && ((a.users?.length ?? 0) + (a.teams?.length ?? 0)) > 0;
  }

  openSubAssign(sub: any): void {
    const ref = this.dialog.open(AssignDialogComponent, {
      width: '580px', maxHeight: '70vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: { todoId: sub.id, assignees: sub.assignees ?? { users: [], teams: [] } },
    });
    ref.closed.subscribe((result: any) => {
      if (result !== undefined) {
        this.todo = {
          ...this.todo,
          subtodos: (this.todo.subtodos ?? []).map((s: any) =>
            s.id === sub.id ? { ...s, assignees: result } : s,
          ),
        };
      }
    });
  }

  // ── Change creator ────────────────────────────────────
  changeCreator(user: { id: string; name: string }): void {
    this.creatorPickerOpen.set(false);
    if (user.id === this.todo.created_by) return;
    this.api.patch<any>(`/todos/${this.todo.id}`, { createdBy: user.id }).subscribe((updated) => {
      this.todo = { ...this.todo, ...updated };
    });
  }

  // ── Assign dialog ─────────────────────────────────────
  openAssign(): void {
    const ref = this.dialog.open(AssignDialogComponent, {
      width: '580px', maxHeight: '70vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: { todoId: this.todo.id, assignees: this.todo.assignees ?? { users: [], teams: [] } },
    });
    ref.closed.subscribe((result: any) => {
      if (result !== undefined) {
        this.todo = { ...this.todo, assignees: result };
      }
    });
  }

  // ── Sub-tasks ─────────────────────────────────────────
  addSubtask(): void {
    if (!this.newSubtask.trim()) return;
    const title = this.newSubtask.trim();
    this.newSubtask = '';
    this.api.post<any>('/todos', {
      title,
      projectId: this.todo.project_id,
      parentTodoId: this.todo.id,
    }).subscribe((sub) => {
      this.todo = { ...this.todo, subtodos: [...(this.todo.subtodos ?? []), sub] };
      this.cdr.detectChanges();
    });
  }

  advanceSub(sub: any): void {
    this.api.patch<any>(`/todos/${sub.id}/advance`, {}).subscribe((updated) => {
      this.todo = { ...this.todo, subtodos: this.todo.subtodos.map((s: any) => s.id === sub.id ? { ...s, ...updated } : s) };
      this.cdr.detectChanges();
    });
  }

  completeSub(sub: any): void {
    this.api.patch<any>(`/todos/${sub.id}/complete`, {}).subscribe((updated) => {
      this.todo = { ...this.todo, subtodos: this.todo.subtodos.map((s: any) => s.id === sub.id ? { ...s, ...updated } : s) };
      this.cdr.detectChanges();
    });
  }

  undoneSub(sub: any): void {
    this.api.patch<any>(`/todos/${sub.id}/set-step`, { stepIndex: 0 }).subscribe((updated) => {
      this.todo = { ...this.todo, subtodos: this.todo.subtodos.map((s: any) => s.id === sub.id ? { ...s, ...updated } : s) };
      this.cdr.detectChanges();
    });
  }

  deleteSub(subId: string): void {
    this.api.delete(`/todos/${subId}`).subscribe(() => {
      this.todo = { ...this.todo, subtodos: this.todo.subtodos.filter((s: any) => s.id !== subId) };
      this.cdr.detectChanges();
    });
  }

  // ── Comments ──────────────────────────────────────────
  sanitize(html: string): string {
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
  }

  postComment(): void {
    this.api.post<any>(`/comments/todo/${this.todo.id}`, { body: this.newComment }).subscribe((c) => {
      this.comments.update((list) => [...list, c]);
      this.newComment = '';
      this.commentEditorRef?.clear();
    });
  }

  // ── Create-mode assignees & subtasks ─────────────────
  openCreateAssign(): void {
    const ref = this.dialog.open(AssignDialogComponent, {
      width: '580px', maxHeight: '70vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: { todoId: null, assignees: this.form.createAssignees },
    });
    ref.closed.subscribe((result: any) => {
      if (result !== undefined) {
        this.form.createAssignees = result;
      }
    });
  }

  removeCreateUser(userId: string): void {
    this.form.createAssignees = {
      ...this.form.createAssignees,
      users: this.form.createAssignees.users.filter((u) => u.id !== userId),
    };
  }

  removeCreateTeam(teamId: string): void {
    this.form.createAssignees = {
      ...this.form.createAssignees,
      teams: this.form.createAssignees.teams.filter((t) => t.id !== teamId),
    };
  }

  addCreateSubtask(): void {
    const title = this.newCreateSubtask.trim();
    if (!title) return;
    this.form.createSubtasks = [...this.form.createSubtasks, title];
    this.newCreateSubtask = '';
  }

  removeCreateSubtask(index: number): void {
    this.form.createSubtasks = this.form.createSubtasks.filter((_, i) => i !== index);
  }

  // ── Create submit ─────────────────────────────────────
  submit(): void {
    const body: any = {
      title: this.form.title.trim(),
      description: this.form.description || undefined,
      dueDate: this.form.dueDateStr
        ? Math.floor(new Date(this.form.dueDateStr).getTime() / 1000)
        : undefined,
      isRecurring: this.form.isRecurring,
      recurrenceRule: this.form.isRecurring
        ? { type: this.form.recurrenceType, interval: this.form.recurrenceInterval }
        : undefined,
    };
    if (this.data.projectId) body.projectId = this.data.projectId;
    const url = this.data.isInbox ? '/inbox' : '/todos';
    this.api.post<any>(url, body).subscribe((todo) => {
      const followUp = [
        ...this.form.createAssignees.users.map((u) =>
          this.api.post<any>(`/todos/${todo.id}/assignees`, { userId: u.id }),
        ),
        ...this.form.createAssignees.teams.map((t) =>
          this.api.post<any>(`/todos/${todo.id}/assignees`, { teamId: t.id }),
        ),
        ...this.form.createSubtasks.map((title) =>
          this.api.post<any>('/todos', { title, projectId: this.data.projectId, parentTodoId: todo.id }),
        ),
      ];
      if (followUp.length === 0) {
        this.dialogRef.close(todo);
        return;
      }
      forkJoin(followUp).subscribe(() => this.dialogRef.close(todo));
    });
  }

  deleteTodo(): void {
    this.api.delete(`/todos/${this.todo.id}`).subscribe(() => this.dialogRef.close('deleted'));
  }

  close(): void {
    this.dialogRef.close(this.isCreate ? undefined : this.todo);
  }
}
