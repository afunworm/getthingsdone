import { Component, inject, OnInit, signal, computed, ViewChild, ElementRef, ChangeDetectorRef, SecurityContext, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { DialogRef, DIALOG_DATA, Dialog } from '@angular/cdk/dialog';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PriorityService } from '../../../core/services/priority.service';
import { UserPrefsService } from '../../../core/services/user-prefs.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AssignDialogComponent } from '../assign-dialog/assign-dialog.component';
import { RichTextEditorComponent } from '../rich-text-editor/rich-text-editor.component';
import { PriorityPickerComponent } from '../priority-picker/priority-picker.component';
import { AssignPickerComponent } from '../assign-picker/assign-picker.component';
import { DueDateSectionComponent } from '../due-date-section/due-date-section.component';
import { RemindersSectionComponent } from '../reminders-section/reminders-section.component';

interface StepDef { label: string; color: string; bg: string; }
const DEFAULT_STEPS: StepDef[] = [
  { label: 'New',         color: '#1565c0', bg: '#e3f2fd' },
  { label: 'In Progress', color: '#e65100', bg: '#fff3e0' },
  { label: 'Done',        color: '#1b5e20', bg: '#e8f5e9' },
];

@Component({
  selector: 'app-todo-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, RichTextEditorComponent, PriorityPickerComponent, AssignPickerComponent, DueDateSectionComponent, RemindersSectionComponent],
  template: `
    <div class="dialog-card">

      <!-- ── Header ─────────────────────────────────────── -->
      <div class="dialog-header">
        @if (isCreate) {
          <span class="dialog-title">New Task</span>
          <button class="btn-icon close-btn" (click)="close()">
            <span class="material-icons" style="font-size:16px">close</span>
          </button>
        } @else {
          <div class="detail-header">
            <!-- Row 1: flow chip + close -->
            <div class="detail-step-row">
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
              <button class="btn-icon close-btn" (click)="close()">
                <span class="material-icons" style="font-size:16px">close</span>
              </button>
            </div>
            <!-- Row 2: full task title -->
            @if (!editingTitle()) {
              <div class="detail-title-row" (click)="startEditTitle()">
                <span class="task-title-full">{{ todo.title }}</span>
                <button class="btn-icon edit-icon" (click)="$event.stopPropagation(); startEditTitle()" title="Edit title">
                  <span class="material-icons" style="font-size:14px">edit</span>
                </button>
              </div>
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
            <app-assign-picker
              [todo]="todo"
              [compact]="false"
              (updated)="onTodoUpdated($event)"
            ></app-assign-picker>
          }

          <!-- Priority -->
          <app-priority-picker
            [todo]="todo"
            [compact]="false"
            (updated)="onTodoUpdated($event)"
          ></app-priority-picker>

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
              [class.meta-creator-btn]="canChangeCreator"
              (click)="canChangeCreator && creatorPickerOpen.set(!creatorPickerOpen())"
              [title]="canChangeCreator ? 'Change creator' : ''"
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

        <!-- ── Create-only: title + priority ─────────────── -->
        @if (isCreate) {
          <div class="field">
            <label class="field-label">Task title *</label>
            <input class="field-input" [(ngModel)]="form.title" placeholder="What needs to be done?" />
          </div>
          <div class="field">
            <label class="field-label">Priority</label>
            <select class="field-select" [(ngModel)]="form.priority">
              <option [ngValue]="0">None</option>
              @for (lvl of prioritySvc.levels(); track lvl.value) {
                <option [ngValue]="lvl.value">{{ lvl.label }}</option>
              }
            </select>
          </div>
        }

        <!-- ── Detail-only: parent task context ───────────── -->
        @if (!isCreate && todo.parent_todo_id && todo._parent) {
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

        <!-- ── Description ────────────────────────────────── -->
        <div class="section">
          <div class="section-hdr">
            <span class="section-label">Description</span>
          </div>
          <div class="rte-field rte-desc-field">
            @if (isCreate) {
              <app-rich-text-editor
                [content]="form.description"
                [users]="accessibleUsers()"
                placeholder="Optional"
                (htmlChange)="form.description = $event"
              ></app-rich-text-editor>
            } @else {
              <app-rich-text-editor
                #descEditor
                [content]="descDraft"
                [users]="accessibleUsers()"
                placeholder="Optional"
                (htmlChange)="descDraft = $event"
              ></app-rich-text-editor>
            }
          </div>
          @if (!isCreate && descDirty) {
            <div class="inline-actions">
              <button class="btn btn-primary btn-sm" (click)="saveDesc()">Save</button>
              <button class="btn btn-ghost btn-sm" (click)="cancelDesc()">Cancel</button>
            </div>
          }
        </div>

        <!-- ── Due Date / Schedule ────────────────────────── -->
        @if (isCreate) {
          <div class="section">
            <div class="section-hdr">
              <span class="section-label">Due Date</span>
            </div>
            <div class="sch-body">
              <div class="sch-grid">
                <div class="sch-row">
                  <span class="material-icons sch-icon">event</span>
                  <input type="date" class="sch-date-input" [(ngModel)]="form.dueDateStr" (ngModelChange)="onDueDateChange($event)" />
                  @if (form.dueDateStr) {
                    <button class="sch-clear" (click)="onDueDateChange('')" title="Clear due date">
                      <span class="material-icons" style="font-size:12px">close</span>
                    </button>
                  }
                </div>
                <div class="sch-row">
                  <span class="material-icons sch-icon">repeat</span>
                  <label class="sch-toggle-label">
                    <input type="checkbox" [(ngModel)]="form.isRecurring" />
                    Recurring
                  </label>
                  @if (form.isRecurring) {
                    <span class="sch-every">every</span>
                    <input type="number" class="sch-num" min="1" [(ngModel)]="form.recurrenceInterval" />
                    <select class="sch-type" [(ngModel)]="form.recurrenceType">
                      <option value="daily">days</option>
                      <option value="weekly">weeks</option>
                      <option value="monthly">months</option>
                      <option value="yearly">years</option>
                    </select>
                  }
                </div>
              </div>
              @if (createNextOccurrences.length) {
                <div class="sch-occurrences">
                  <span class="sch-occ-label">Next occurrences</span>
                  @for (d of createNextOccurrences; track d) {
                    <span class="sch-occ-date">{{ d }}</span>
                  }
                </div>
              }
            </div>
            @if (form.isRecurring && !form.dueDateStr) {
              <p class="recur-warn">
                <span class="material-icons" style="font-size:13px">warning</span>
                A due date is required for recurring tasks.
              </p>
            }
          </div>
        } @else {
          <app-due-date-section
            [todo]="todo"
            (updated)="onTodoUpdated($event)"
            (dueDateDraftChanged)="pendingDueDateStr.set($event)"
          ></app-due-date-section>
        }

        <!-- ── Reminders ──────────────────────────────────── -->
        @if (isCreate) {
          <div class="section">
            <div class="section-hdr">
              <span class="material-icons" style="font-size:14px;color:var(--text-muted)">alarm</span>
              <span class="section-label">Reminders</span>
              <span class="section-count">{{ form.pendingReminders.length }}</span>
            </div>
            @if (form.pendingReminders.length) {
              <p class="reminder-edit-hint">Click a reminder time to change it.</p>
            }
            <div class="reminder-quick">
              <button class="reminder-quick-btn" (click)="addCreateReminderIn(1, 'day')">In 1 day</button>
              <button class="reminder-quick-btn" (click)="addCreateReminderIn(3, 'day')">In 3 days</button>
              <button class="reminder-quick-btn" (click)="addCreateReminderIn(1, 'week')">In 1 week</button>
              <span class="reminder-sep">or</span>
              <input type="datetime-local" class="reminder-date-input" [(ngModel)]="createCustomReminderDate" />
              @if (createCustomReminderDate) {
                <button class="btn btn-primary btn-sm" (click)="addCreateCustomReminder()">Set</button>
              }
            </div>
            @for (r of form.pendingReminders; track r.id) {
              <div class="reminder-row reminder-pending" [class.reminder-new]="animatingReminderIds().has(r.id)">
                <span class="material-icons" style="font-size:14px;color:#f57c00">alarm_add</span>
                @if (editingReminderId() === r.id) {
                  <input type="datetime-local" class="reminder-date-input reminder-edit-input"
                    [value]="r.remindAt"
                    (change)="r.remindAt = $any($event.target).value; editingReminderId.set(null)"
                    (blur)="editingReminderId.set(null)"
                    (keydown.escape)="editingReminderId.set(null)" />
                } @else {
                  <span class="reminder-time reminder-time-editable"
                    (click)="editingReminderId.set(r.id)" title="Click to change time">
                    {{ formatCreateReminder(r.remindAt) }}
                  </span>
                }
                <span class="reminder-pending-badge">pending save</span>
                <button class="btn-icon reminder-email-toggle" [class.active]="r.notifyEmail"
                  (click)="r.notifyEmail = !r.notifyEmail"
                  [title]="r.notifyEmail ? 'Email on (click to disable)' : 'Email off (click to enable)'">
                  <span class="material-icons" style="font-size:13px">email</span>
                  <span class="reminder-email-label">Email</span>
                </button>
                <button class="btn-icon reminder-del" (click)="removeCreateReminder(r.id)" title="Remove reminder">
                  <span class="material-icons" style="font-size:13px">close</span>
                </button>
              </div>
            }
          </div>
        } @else {
          <app-reminders-section
            [todo]="todo"
            [pendingDueDate]="pendingDueDateStr()"
            (todoChanged)="onTodoChanged($event)"
          ></app-reminders-section>
        }

        <!-- ── Assignees (create-only, projects only) ─────── -->
        @if (isCreate && !data.isInbox) {
          <div class="section">
            <div class="section-hdr">
              <span class="material-icons" style="font-size:14px;color:var(--text-muted)">person</span>
              <span class="section-label">Assignees</span>
            </div>
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
        }

        <!-- ── Sub-tasks ──────────────────────────────────── -->
        @if (isCreate || !todo.parent_todo_id) {
          <div class="section">
            <div class="section-hdr">
              <span class="section-label">Sub-tasks</span>
              <span class="section-count">{{ isCreate ? form.createSubtasks.length : (todo.subtodos?.length ?? 0) }}</span>
            </div>
            @if (!isCreate) {
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
            }
            @if (isCreate) {
              @for (s of form.createSubtasks; track $index) {
                <div class="create-subtask-row">
                  <span class="material-icons" style="font-size:13px;color:var(--text-muted)">subdirectory_arrow_right</span>
                  <span class="create-sub-title">{{ s }}</span>
                  <button class="btn-icon danger-btn" (click)="removeCreateSubtask($index)">
                    <span class="material-icons" style="font-size:13px">close</span>
                  </button>
                </div>
              }
            }
            <div class="subtask-add">
              @if (isCreate) {
                <input class="subtask-input" [(ngModel)]="newCreateSubtask"
                  placeholder="Add sub-task..." (keydown.enter)="addCreateSubtask()" />
                @if (newCreateSubtask.trim()) {
                  <button class="btn btn-primary btn-sm" (click)="addCreateSubtask()">Add</button>
                }
              } @else {
                <input class="subtask-input" [(ngModel)]="newSubtask"
                  placeholder="Add sub-task..." (keydown.enter)="addSubtask()" />
                @if (newSubtask.trim()) {
                  <button class="btn btn-primary btn-sm" (click)="addSubtask()">Add</button>
                }
              }
            </div>
          </div>
        }

        <!-- ── Detail-only: Attachments + Comments ────────── -->
        @if (!isCreate) {
          <div class="section">
            <div class="section-hdr">
              <span class="section-label">Attachments</span>
              <span class="section-count">{{ todoAttachments().length }}</span>
            </div>
            <div class="att-grid">
              @for (a of todoAttachments(); track a.id) {
                <div class="att-item">
                  @if (isImage(a.mimetype)) {
                    <div class="att-thumb" (click)="openLightbox('/uploads/' + a.filename, a.mimetype, a.original_name)" title="{{ a.original_name }}">
                      <img [src]="'/uploads/' + a.filename" [alt]="a.original_name" />
                    </div>
                  } @else if (isViewable(a.mimetype)) {
                    <div class="att-file att-file--viewable" (click)="openLightbox('/uploads/' + a.filename, a.mimetype, a.original_name)" title="{{ a.original_name }}">
                      <span class="material-icons" style="font-size:18px;color:var(--text-muted)">{{ fileIcon(a.mimetype) }}</span>
                      <span class="att-file-name">{{ a.original_name }}</span>
                    </div>
                  } @else {
                    <a class="att-file" [href]="'/uploads/' + a.filename" target="_blank" title="{{ a.original_name }}">
                      <span class="material-icons" style="font-size:18px;color:var(--text-muted)">insert_drive_file</span>
                      <span class="att-file-name">{{ a.original_name }}</span>
                    </a>
                  }
                  <button class="att-del" (click)="deleteTodoAttachment(a.id)" title="Remove">
                    <span class="material-icons" style="font-size:11px">close</span>
                  </button>
                </div>
              }
              <label class="att-add-btn">
                <input type="file" multiple style="display:none" (change)="onTodoFilesSelected($event)" />
                <span class="material-icons" style="font-size:15px">attach_file</span>
                Add files
              </label>
            </div>
          </div>
          <div class="section">
            <div class="section-hdr">
              <span class="section-label">Comments</span>
              <span class="section-count">{{ comments().length }}</span>
              <button class="sort-btn" (click)="commentSortDesc.set(!commentSortDesc())" title="Toggle sort order">
                <span class="material-icons" style="font-size:13px">swap_vert</span>
                {{ commentSortDesc() ? 'Newest first' : 'Oldest first' }}
              </button>
            </div>
            <div class="comments-list">
              @for (c of sortedComments(); track c.id) {
                <div class="comment">
                  <div class="comment-hdr">
                    <span class="comment-author">{{ c.user_name }}</span>
                    <span class="comment-date">{{ c.created_at * 1000 | date:'MMM d, h:mm a' }}</span>
                    @if (me()?.role === 'admin') {
                      <button class="comment-del" (click)="deleteComment(c.id)" title="Delete comment">
                        <span class="material-icons" style="font-size:13px">delete</span>
                      </button>
                    }
                  </div>
                  @if (c.body) {
                    <div class="comment-body" [innerHTML]="sanitize(c.body)"></div>
                  }
                  @if (c.attachments?.length) {
                    <div class="att-grid att-grid--sm">
                      @for (a of c.attachments; track a.id) {
                        @if (isImage(a.mimetype)) {
                          <div class="att-thumb att-thumb--sm" (click)="openLightbox('/uploads/' + a.filename, a.mimetype, a.original_name)" title="{{ a.original_name }}">
                            <img [src]="'/uploads/' + a.filename" [alt]="a.original_name" />
                          </div>
                        } @else if (isViewable(a.mimetype)) {
                          <span class="attachment-chip attachment-chip--viewable" (click)="openLightbox('/uploads/' + a.filename, a.mimetype, a.original_name)">
                            <span class="material-icons" style="font-size:11px">{{ fileIcon(a.mimetype) }}</span>
                            {{ a.original_name }}
                          </span>
                        } @else {
                          <a class="attachment-chip" [href]="'/uploads/' + a.filename" target="_blank">
                            <span class="material-icons" style="font-size:11px">attach_file</span>
                            {{ a.original_name }}
                          </a>
                        }
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
              @if (pendingFiles().length) {
                <div class="pending-files">
                  @for (f of pendingFiles(); track f.name; let i = $index) {
                    <span class="pending-chip">
                      @if (isImageFile(f)) {
                        <img class="pending-thumb" [src]="objectUrl(f)" />
                      } @else {
                        <span class="material-icons" style="font-size:12px">insert_drive_file</span>
                      }
                      {{ f.name }}
                      <button class="pending-remove" (click)="removePendingFile(i)">
                        <span class="material-icons" style="font-size:10px">close</span>
                      </button>
                    </span>
                  }
                </div>
              }
              <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">
                <label class="btn-attach" title="Attach files">
                  <input type="file" multiple style="display:none" (change)="onCommentFilesSelected($event)" />
                  <span class="material-icons" style="font-size:16px">attach_file</span>
                </label>
                <button class="btn btn-primary btn-sm"
                  [disabled]="!newComment.trim() && !pendingFiles().length"
                  (click)="postComment()">Post</button>
              </div>
            </div>
          </div>
        }
      </div>

    <!-- ── Lightbox ──────────────────────────────────────── -->
    @if (lightboxItem()) {
      <div class="lightbox-backdrop" (click)="closeLightbox()">
        <button class="lightbox-close" (click)="closeLightbox()">
          <span class="material-icons">close</span>
        </button>
        @if (isImage(lightboxItem()!.mimetype)) {
          <img class="lightbox-img" [src]="lightboxItem()!.url" (click)="$event.stopPropagation()" />
        } @else if (isPdf(lightboxItem()!.mimetype)) {
          <div class="lightbox-doc" (click)="$event.stopPropagation()">
            <iframe class="lightbox-pdf" [src]="lightboxItem()!.safeUrl" frameborder="0"></iframe>
          </div>
        } @else {
          <div class="lightbox-doc" [class.lightbox-doc--word]="isDocx(lightboxItem()!.mimetype)" (click)="$event.stopPropagation()">
            @if (lightboxLoading()) {
              <div class="lightbox-loading">
                <span class="material-icons spin" style="font-size:32px;color:#fff">refresh</span>
              </div>
            } @else {
              <div class="lightbox-html-wrap" [innerHTML]="lightboxHtml()"></div>
            }
          </div>
        }
      </div>
    }

      <!-- ── History (admin only) ──────────────────────── -->
      @if (!isCreate && isAdmin) {
        <div class="section hist-section">
          <div class="section-hdr" (click)="toggleHistory()">
            <span class="section-label">History</span>
            <span class="material-icons hist-chevron" [class.hist-open]="historyOpen()">expand_more</span>
          </div>
          @if (historyOpen()) {
            <div class="hist-list">
              @if (history().length === 0) {
                <p class="hist-empty">No history recorded yet.</p>
              }
              @for (h of history(); track h.id) {
                <div class="hist-row">
                  <span class="hist-meta">
                    <span class="hist-who">{{ h.changed_by_name }}</span>
                    <span class="hist-when">{{ formatHistoryDate(h.changed_at) }}</span>
                  </span>
                  <span class="hist-change">
                    <span class="hist-field">{{ humanizeField(h.field) }}</span>
                    @if (h.field === 'created') {
                      <span class="hist-val">{{ h.new_value }}</span>
                    } @else {
                      @if (h.old_value) { <span class="hist-old">{{ formatHistValue(h.field, h.old_value) }}</span> }
                      @if (h.old_value && h.new_value) { <span class="hist-arrow">→</span> }
                      @if (h.new_value) { <span class="hist-new">{{ formatHistValue(h.field, h.new_value) }}</span> }
                    }
                  </span>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ── Footer ─────────────────────────────────────── -->
      <div class="dialog-footer">
        @if (isCreate) {
          <button class="btn btn-ghost" (click)="close()">Cancel</button>
          <button class="btn btn-primary" [disabled]="!form.title.trim() || (form.isRecurring && !form.dueDateStr)" (click)="submit()">Create Task</button>
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

    .dialog-header {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 14px 10px; border-bottom: 1px solid var(--surface-border);
      flex-shrink: 0; min-height: 46px;
    }
    .dialog-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
    .close-btn { margin-left: auto; flex-shrink: 0; }

    .detail-header { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
    .detail-step-row {
      display: flex; align-items: center; justify-content: space-between;
    }
    .detail-title-row {
      display: flex; align-items: flex-start; gap: 6px;
      cursor: pointer;
      &:hover .task-title-full { color: var(--accent-color); }
      &:hover .edit-icon { opacity: 1; }
    }
    .task-title-full {
      flex: 1; font-size: 15px; font-weight: 600; color: var(--text-primary);
      white-space: normal; word-break: break-word; line-height: 1.4;
      transition: color 100ms;
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
    .edit-icon {
      opacity: 0; flex-shrink: 0; color: var(--text-muted);
      transition: opacity 120ms;
      .section-hdr:hover & { opacity: 1; }
    }
    .title-input {
      flex: 1; padding: 3px 8px; border: 1px solid var(--accent-color);
      border-radius: 6px; background: var(--surface-card);
      font-family: inherit; font-size: 15px; font-weight: 600;
      color: var(--text-primary); outline: none;
    }

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

    .dialog-body {
      padding: 12px 14px; display: flex; flex-direction: column; gap: 0;
      overflow-y: auto; flex: 1;
    }

    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .create-reminders-field { gap: 6px; }
    .create-reminders-hdr { display: flex; align-items: center; gap: 6px; }
    .create-row-2 { display: flex; gap: 12px; }
    .recurrence-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .recur-warn {
      display: flex; align-items: center; gap: 5px; margin: -4px 0 10px;
      font-size: 12px; color: #e65100;
    }
    .checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; input { cursor: pointer; } }
    .inline-num { width: 60px !important; }
    .inline-sel { width: 90px !important; }

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

    .desc-text {
      margin: 0; font-size: 13px; line-height: 1.6; color: var(--text-primary);
      cursor: pointer; padding: 4px 0;
      &.desc-muted { color: var(--text-muted); font-style: italic; &:hover { color: var(--accent-color); } }
    }
    .desc-html {
      font-size: 13px; line-height: 1.6; color: var(--text-primary);
      cursor: pointer; padding: 4px 0; min-height: 22px;
      &:hover { outline: 1px dashed var(--surface-border); border-radius: 4px; }
      p { margin: 0 0 4px; &:last-child { margin-bottom: 0; } }
      strong { font-weight: 600; }
      em { font-style: italic; }
      ul, ol { padding-left: 20px; margin: 4px 0; }
      li { margin: 2px 0; }
      code {
        background: var(--surface-hover); border-radius: 3px;
        padding: 1px 4px; font-size: 12px; font-family: monospace;
      }
    }
    .rte-desc-field {
      border: 1px solid var(--accent-color); border-radius: 6px;
      padding: 6px 8px; background: var(--surface-card);
    }
    .inline-actions { display: flex; gap: 6px; margin-top: 6px; }
    .btn-sm { padding: 4px 12px; font-size: 12px; }

    .sch-body { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .sch-grid { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
    .sch-occurrences {
      display: flex; flex-direction: column; gap: 3px;
      border-left: 2px solid var(--surface-border); padding-left: 12px;
    }
    .sch-occ-label {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: .4px; color: var(--text-muted); margin-bottom: 2px;
    }
    .sch-occ-date { font-size: 12px; color: var(--text-secondary); }
    .sch-row { display: flex; align-items: center; gap: 8px; }
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

    .create-subtask-row {
      display: flex; align-items: center; gap: 6px;
      padding: 3px 0;
    }
    .create-sub-title {
      flex: 1; font-size: 13px; color: var(--text-secondary);
    }

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

    .comments-list {
      display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;
      max-height: 340px; overflow-y: auto;
    }
    .sort-btn {
      margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 8px; border-radius: 5px; border: 1px solid var(--surface-border);
      background: transparent; cursor: pointer; color: var(--text-muted);
      font-family: inherit; font-size: 11px; font-weight: 500;
      &:hover { color: var(--text-primary); background: var(--surface-hover); }
    }
    .comment { padding: 8px 10px; background: var(--surface-hover); border-radius: 6px; }
    .comment-hdr { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
    .comment-author { font-size: 12px; font-weight: 600; color: var(--text-primary); }
    .comment-date { font-size: 11px; color: var(--text-muted); flex: 1; }
    .comment-del {
      flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border-radius: 4px; border: none;
      background: transparent; cursor: pointer; color: var(--text-muted);
      opacity: 0; transition: opacity 120ms, color 120ms;
      &:hover { color: #d32f2f; }
    }
    .comment:hover .comment-del { opacity: 1; }
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
    .reminder-time-editable {
      cursor: pointer; border-radius: 4px; padding: 1px 3px; margin: -1px -3px;
      transition: background 80ms, color 80ms;
      &:hover { background: var(--surface-hover); color: var(--accent-color); }
    }
    .reminder-edit-input { flex: 1; }
    .reminder-sent-label {
      font-size: 10px; font-weight: 600; padding: 1px 6px;
      background: color-mix(in srgb, #43a047 15%, transparent);
      color: #43a047; border-radius: 8px;
    }
    .reminder-email-toggle {
      width: auto; height: 20px; padding: 0 6px; gap: 3px;
      opacity: 0; transition: opacity 120ms, color 120ms;
      color: var(--text-muted); border-radius: 10px;
      font-size: 11px; font-family: inherit;
      .reminder-row:hover & { opacity: 1; }
      &.active { color: var(--accent-color); opacity: 1; background: color-mix(in srgb, var(--accent-color) 10%, transparent); }
    }
    .reminder-email-label { font-size: 11px; font-weight: 500; }
    .reminder-del {
      width: 20px; height: 20px; opacity: 0;
      transition: opacity 120ms;
      .reminder-row:hover & { opacity: 1; }
    }
    .no-reminders { color: var(--text-muted); font-size: 13px; margin: 6px 0 0; }
    .reminder-edit-hint { font-size: 11px; color: var(--text-muted); margin: 0 0 6px; font-style: italic; }
    .reminder-pending {
      border: 1px dashed color-mix(in srgb, #f57c00 50%, transparent);
      border-radius: 6px; padding: 5px 8px; margin-bottom: 4px;
      background: color-mix(in srgb, #f57c00 6%, transparent);
    }
    .reminder-pending-badge {
      font-size: 10px; font-weight: 600; white-space: nowrap;
      padding: 1px 6px; border-radius: 8px;
      background: color-mix(in srgb, #f57c00 15%, transparent);
      color: #e65100;
    }
    @keyframes reminder-flash {
      0%   { background: color-mix(in srgb, #f57c00 35%, transparent); }
      100% { background: color-mix(in srgb, #f57c00 6%, transparent); }
    }
    @keyframes reminder-flash-real {
      0%   { background: color-mix(in srgb, #f57c00 30%, transparent); }
      100% { background: transparent; }
    }
    .reminder-pending.reminder-new { animation: reminder-flash 0.9s ease-out forwards; border-radius: 6px; }
    .reminder-row:not(.reminder-pending).reminder-new { animation: reminder-flash-real 1s ease-out forwards; border-radius: 5px; }
    .hist-section { border-top: 1px solid var(--surface-border); padding: 10px 14px; }
    .hist-section .section-hdr { cursor: pointer; user-select: none; }
    .hist-chevron { font-size: 16px; color: var(--text-muted); margin-left: auto; transition: transform .15s; }
    .hist-open { transform: rotate(180deg); }
    .hist-list { margin-top: 4px; max-height: 280px; overflow-y: auto; padding: 0; }
    .hist-row { padding: 5px 0; border-bottom: 1px solid var(--surface-border); &:last-child { border-bottom: none; } }
    .hist-meta { display: flex; gap: 8px; margin-bottom: 2px; }
    .hist-who { font-size: 11px; font-weight: 600; color: var(--text-primary); }
    .hist-when,.hist-arrow { font-size: 11px; color: var(--text-muted); }
    .hist-change { display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap; }
    .hist-field { font-size: 12px; font-weight: 500; color: var(--text-secondary); min-width: 80px; }
    .hist-val,.hist-new { font-size: 12px; color: var(--text-primary); }
    .hist-old { font-size: 12px; color: var(--text-muted); text-decoration: line-through; }
    .hist-empty { font-size: 12px; color: var(--text-muted); margin: 6px 0; }
    .att-grid {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;
    }
    .att-grid--sm { margin-top: 6px; gap: 6px; }

    .att-item { position: relative; }
    .att-del {
      position: absolute; top: -4px; right: -4px;
      width: 16px; height: 16px; border-radius: 50%;
      border: 0; background: #333; color: #fff;
      display: none; align-items: center; justify-content: center;
      cursor: pointer; padding: 0;
      .att-item:hover & { display: flex; }
    }
    .att-thumb {
      width: 72px; height: 72px; border-radius: 6px;
      overflow: hidden; cursor: zoom-in;
      border: 1px solid var(--surface-border);
      background: var(--surface-hover);
      img { width: 100%; height: 100%; object-fit: cover; }
    }
    .att-thumb--sm { width: 56px; height: 56px; }
    .att-file {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 10px; border-radius: 7px;
      border: 1px solid var(--surface-border);
      background: var(--surface-hover);
      text-decoration: none; color: var(--text-primary);
      font-size: 12px; max-width: 180px;
    }
    .att-file-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .att-add-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 12px; border-radius: 7px; height: 72px;
      border: 1px dashed var(--surface-border);
      background: transparent; cursor: pointer;
      font-size: 12px; color: var(--text-muted);
      transition: all 120ms;
      &:hover { border-color: var(--accent-color); color: var(--accent-color); }
    }

    .btn-attach {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
      color: var(--text-muted); transition: all 120ms;
      &:hover { color: var(--accent-color); background: var(--surface-hover); }
    }

    .pending-files { display: flex; flex-wrap: wrap; gap: 6px; }
    .pending-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 8px; border-radius: 6px;
      background: var(--surface-hover); border: 1px solid var(--surface-border);
      font-size: 11px; color: var(--text-primary); max-width: 180px;
    }
    .pending-thumb { width: 18px; height: 18px; object-fit: cover; border-radius: 3px; }
    .pending-remove {
      flex-shrink: 0; border: 0; background: transparent; cursor: pointer;
      color: var(--text-muted); padding: 0; display: flex; align-items: center;
      &:hover { color: var(--text-primary); }
    }

    .lightbox-backdrop {
      position: fixed; inset: 0; z-index: 50000;
      background: rgba(0,0,0,.85);
      display: flex; align-items: center; justify-content: center;
      cursor: zoom-out;
    }
    .lightbox-img {
      max-width: 90vw; max-height: 90vh;
      border-radius: 6px; cursor: default;
      box-shadow: 0 8px 40px rgba(0,0,0,.5);
    }
    .lightbox-doc {
      width: 90vw; height: 90vh; cursor: default;
      border-radius: 8px; overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,.5);
      display: flex; flex-direction: column;
    }
    .lightbox-doc--word {
      width: min(680px, 90vw); height: 90vh;
    }
    .lightbox-pdf {
      width: 100%; height: 100%; border: none;
    }
    .lightbox-html-wrap {
      width: 100%; height: 100%; overflow: auto;
      background: #fff; padding: 32px 40px; box-sizing: border-box;
      font-family: Georgia, serif; font-size: 14px; line-height: 1.6; color: #222;
    }
    :host ::ng-deep .lightbox-html-wrap {
      table { border-collapse: collapse; width: 100%; font-family: sans-serif; font-size: 13px; }
      td, th { border: 1px solid #999 !important; padding: 4px 8px; }
      th { background: #e8e8e8; font-weight: 600; }
    }
    .lightbox-loading {
      flex: 1; display: flex; align-items: center; justify-content: center;
    }
    .lightbox-close {
      position: fixed; top: 16px; right: 16px;
      width: 36px; height: 36px; border-radius: 50%;
      border: 0; background: rgba(255,255,255,.15); color: #fff;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 20px; z-index: 1;
      &:hover { background: rgba(255,255,255,.25); }
    }
    .att-file--viewable { cursor: pointer; &:hover { background: var(--surface-hover); } }
    .attachment-chip--viewable { cursor: pointer; &:hover { opacity: .8; } }

    .attachments { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .attachment-chip {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 11px; padding: 2px 7px;
      background: var(--surface-border); border-radius: 10px;
      text-decoration: none; color: var(--accent-color);
    }
    .comment-compose { display: flex; flex-direction: column; gap: 6px; }

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

    .dialog-footer {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px 12px; border-top: 1px solid var(--surface-border); flex-shrink: 0;
    }
  `],
})
export class TodoDialogComponent implements OnInit {
  @ViewChild('titleInput') titleInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('commentEditor') commentEditorRef?: RichTextEditorComponent;
  @ViewChild('descEditor') descEditorRef?: RichTextEditorComponent;

  dialogRef = inject(DialogRef<any>);
  data: any = inject(DIALOG_DATA);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userPrefs = inject(UserPrefsService);
  private notifSvc  = inject(NotificationService);
  readonly prioritySvc = inject(PriorityService);
  private dialog = inject(Dialog);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);
  private zone = inject(NgZone);

  readonly me = this.auth.user;

  todo: any = this.data.todo ? { ...this.data.todo } : {};
  get isCreate(): boolean { return this.data.mode === 'create'; }

  comments = signal<any[]>([]);
  commentSortDesc = signal(true);
  sortedComments = computed(() =>
    this.commentSortDesc()
      ? [...this.comments()].reverse()
      : this.comments()
  );
  todoAttachments = signal<any[]>([]);
  accessibleUsers = signal<any[]>([]);

  get isAdmin(): boolean { return this.me()?.role === 'admin'; }
  historyOpen = signal(false);
  history = signal<any[]>([]);
  creatorPickerOpen = signal(false);
  stepPickerOpen    = signal(false);
  lightboxItem = signal<{ url: string; mimetype: string; name: string; safeUrl?: any } | null>(null);
  lightboxHtml = signal<any>(null);
  lightboxLoading = signal(false);
  pendingFiles = signal<File[]>([]);
  newComment = '';
  newSubtask = '';
  newCreateSubtask = '';
  editingReminderId = signal<string | null>(null);

  // Edit state
  editingTitle = signal(false);
  titleDraft = '';
  descDraft  = '';
  get descDirty(): boolean { return this.descDraft !== (this.todo?.description ?? ''); }

  // IDs of reminder rows currently running the flash-in animation (create mode)
  animatingReminderIds = signal<Set<string>>(new Set());

  // Pending due-date string forwarded to RemindersSection in edit mode
  pendingDueDateStr = signal('');

  get createNextOccurrences(): string[] {
    if (!this.form.isRecurring || !this.form.dueDateStr) return [];
    const interval = this.form.recurrenceInterval || 1;
    const type = this.form.recurrenceType;
    const dates: string[] = [];
    let cur = new Date(this.form.dueDateStr + 'T00:00:00');
    for (let i = 0; i < 3; i++) {
      const originalDay = cur.getDate();
      const next = new Date(cur);
      if (type === 'daily') {
        next.setDate(next.getDate() + interval);
      } else if (type === 'weekly') {
        next.setDate(next.getDate() + interval * 7);
      } else if (type === 'yearly') {
        next.setDate(1);
        next.setFullYear(next.getFullYear() + interval);
        next.setMonth(cur.getMonth());
        const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(originalDay, daysInMonth));
      } else {
        next.setDate(1);
        next.setMonth(next.getMonth() + interval);
        const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(originalDay, daysInMonth));
      }
      dates.push(next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
      cur = next;
    }
    return dates;
  }

  // Create form
  form = {
    title: '',
    description: '',
    dueDateStr: '',
    priority: 0,
    pendingReminders: [] as { id: string; remindAt: string; label: string; notifyEmail: boolean }[],
    isRecurring: false,
    recurrenceInterval: 1,
    recurrenceType: 'weekly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
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

  get recurrenceLabel(): string {
    const r = this.todo.recurrence_rule;
    if (!r) return 'Recurring';
    const unit = r.type === 'daily' ? 'day' : r.type === 'weekly' ? 'week' : r.type === 'yearly' ? 'year' : 'month';
    return `Every ${r.interval} ${unit}${r.interval !== 1 ? 's' : ''}`;
  }

  get canChangeCreator(): boolean {
    if (!this.todo.project_id || this.accessibleUsers().length <= 1) return false;
    if (this.todo.created_via_token_id && this.me()?.role !== 'admin') return false;
    return true;
  }

  get creatorLabel(): string {
    const name = this.todo.created_via_token_name
      ? `API:${this.todo.created_via_token_name}`
      : (this.todo.created_by_name ?? 'Unknown');
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
      this.descDraft = this.todo.description ?? '';
      this.api.get<any[]>(`/comments/todo/${this.todo.id}`).subscribe((c) => this.comments.set(c));
      this.api.get<any>(`/todos/${this.todo.id}`).subscribe((t) => this.todoAttachments.set(t.attachments ?? []));
      if (this.todo.project_id) {
        this.api.get<any[]>(`/projects/${this.todo.project_id}/users`).subscribe((u) => this.accessibleUsers.set(u));
      }
    }
  }

  createCustomReminderDate = '';
  private createReminderAutoFillId: string | null = null;

  private flashReminder(id: string): void {
    this.animatingReminderIds.update((s) => new Set([...s, id]));
    setTimeout(() => this.animatingReminderIds.update((s) => { const n = new Set(s); n.delete(id); return n; }), 1000);
  }

  onDueDateChange(val: string): void {
    this.form.dueDateStr = val;
    this.onCreateDueDateChange(val);
  }

  onCreateDueDateChange(dateStr: string): void {
    if (dateStr && !this.createReminderAutoFillId) {
      this.userPrefs.load();
      const remindAt = this.userPrefs.calcDueReminderDatetime(dateStr);
      const id = crypto.randomUUID();
      this.form.pendingReminders = [
        ...this.form.pendingReminders,
        { id, remindAt, label: 'Due date', notifyEmail: this.notifSvc.getEffectiveSettings(null).email_upcoming },
      ];
      this.createReminderAutoFillId = id;
      setTimeout(() => this.flashReminder(id), 30);
    } else if (!dateStr && this.createReminderAutoFillId) {
      this.form.pendingReminders = this.form.pendingReminders.filter(
        (r) => r.id !== this.createReminderAutoFillId,
      );
      this.createReminderAutoFillId = null;
    }
  }

  addCreateReminderIn(amount: number, unit: 'day' | 'week'): void {
    const ms = unit === 'day' ? amount * 86400000 : amount * 7 * 86400000;
    const d = new Date(Date.now() + ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    const remindAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const label = `In ${amount} ${unit}${amount !== 1 ? 's' : ''}`;
    this.form.pendingReminders = [
      ...this.form.pendingReminders,
      { id: crypto.randomUUID(), remindAt, label, notifyEmail: this.notifSvc.getEffectiveSettings(null).email_upcoming },
    ];
  }

  addCreateCustomReminder(): void {
    if (!this.createCustomReminderDate) return;
    this.form.pendingReminders = [
      ...this.form.pendingReminders,
      {
        id: crypto.randomUUID(),
        remindAt: this.createCustomReminderDate,
        label: '',
        notifyEmail: this.notifSvc.getEffectiveSettings(null).email_upcoming,
      },
    ];
    this.createCustomReminderDate = '';
  }

  removeCreateReminder(id: string): void {
    if (id === this.createReminderAutoFillId) this.createReminderAutoFillId = null;
    this.form.pendingReminders = this.form.pendingReminders.filter((r) => r.id !== id);
  }

  formatCreateReminder(remindAt: string): string {
    const d = new Date(remindAt);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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
  saveDesc(): void {
    this.api.patch<any>(`/todos/${this.todo.id}`, { description: this.descDraft || null }).subscribe((updated) => {
      this.todo = { ...this.todo, ...updated };
    });
  }

  cancelDesc(): void {
    this.descDraft = this.todo.description ?? '';
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
      data: { todoId: sub.id, assignees: sub.assignees ?? { users: [], teams: [] }, projectId: this.todo.project_id ?? null },
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

  // ── Component update handlers ─────────────────────────
  onTodoUpdated(updated: any): void {
    this.todo = { ...this.todo, ...updated };
  }

  onTodoChanged(partial: Partial<any>): void {
    this.todo = { ...this.todo, ...partial };
  }

  // ── Change creator ────────────────────────────────────
  changeCreator(user: { id: string; name: string }): void {
    this.creatorPickerOpen.set(false);
    if (user.id === this.todo.created_by) return;
    this.api.patch<any>(`/todos/${this.todo.id}`, { createdBy: user.id }).subscribe((updated) => {
      this.todo = { ...this.todo, ...updated };
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
    const patched = html.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
    return this.sanitizer.sanitize(SecurityContext.HTML, patched) ?? '';
  }

  postComment(): void {
    const files = this.pendingFiles();
    this.api.post<any>(`/comments/todo/${this.todo.id}`, { body: this.newComment }).subscribe((c) => {
      this.newComment = '';
      this.pendingFiles.set([]);
      this.commentEditorRef?.clear();
      this.todo = { ...this.todo, comment_count: (this.todo.comment_count ?? 0) + 1 };
      if (!files.length) {
        this.comments.update((list) => [...list, c]);
        return;
      }
      const uploads = files.map((f) => {
        const fd = new FormData(); fd.append('file', f);
        return this.api.post<any>(`/comments/${c.id}/attachments`, fd);
      });
      import('rxjs').then(({ forkJoin }) => {
        forkJoin(uploads).subscribe({
          next: (atts) => this.comments.update((list) => [...list, { ...c, attachments: atts }]),
          error: ()    => this.comments.update((list) => [...list, c]),
        });
      });
    });
  }

  deleteComment(id: string): void {
    this.api.delete(`/comments/${id}`).subscribe(() => {
      this.comments.update((list) => list.filter((c) => c.id !== id));
      this.todo = { ...this.todo, comment_count: Math.max(0, (this.todo.comment_count ?? 0) - 1) };
    });
  }

  // ── Attachments ───────────────────────────────────────
  isImage(mimetype: string): boolean    { return mimetype?.startsWith('image/'); }
  isPdf(mimetype: string): boolean      { return mimetype === 'application/pdf'; }
  isXlsx(mimetype: string): boolean     { return mimetype?.includes('spreadsheet') || mimetype?.includes('excel'); }
  isDocx(mimetype: string): boolean     { return mimetype?.includes('wordprocessingml') || mimetype?.includes('msword'); }
  isViewable(mimetype: string): boolean { return this.isPdf(mimetype) || this.isXlsx(mimetype) || this.isDocx(mimetype); }
  isImageFile(file: File): boolean      { return file.type.startsWith('image/'); }
  objectUrl(file: File): string         { return URL.createObjectURL(file); }

  fileIcon(mimetype: string): string {
    if (this.isPdf(mimetype))  return 'picture_as_pdf';
    if (this.isXlsx(mimetype)) return 'table_chart';
    if (this.isDocx(mimetype)) return 'description';
    return 'insert_drive_file';
  }

  openLightbox(url: string, mimetype: string, name: string): void {
    this.lightboxHtml.set(null);
    if (this.isPdf(mimetype)) {
      const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.lightboxItem.set({ url, mimetype, name, safeUrl });
      return;
    }
    this.lightboxItem.set({ url, mimetype, name });
    if (this.isImage(mimetype)) return;
    // XLSX or DOCX — fetch and render
    this.lightboxLoading.set(true);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then(async (buf) => {
        let html = '';
        if (this.isXlsx(mimetype)) {
          const wb = XLSX.read(buf, { type: 'array' });
          html = XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]]);
        } else if (this.isDocx(mimetype)) {
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          html = result.value;
        }
        const safe = this.sanitizer.bypassSecurityTrustHtml(html);
        this.zone.run(() => { this.lightboxHtml.set(safe); this.lightboxLoading.set(false); });
      })
      .catch(() => this.zone.run(() => this.lightboxLoading.set(false)));
  }

  closeLightbox(): void { this.lightboxItem.set(null); this.lightboxHtml.set(null); }

  onTodoFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const files = Array.from(input.files);
    input.value = '';
    files.forEach((file) => {
      const fd = new FormData(); fd.append('file', file);
      this.api.post<any>(`/todos/${this.todo.id}/attachments`, fd).subscribe((att) => {
        this.todoAttachments.update((list) => [...list, att]);
        this.todo = { ...this.todo, attachment_count: (this.todo.attachment_count ?? 0) + 1 };
      });
    });
  }

  deleteTodoAttachment(id: string): void {
    this.api.delete(`/todos/attachments/${id}`).subscribe(() => {
      this.todoAttachments.update((list) => list.filter((a) => a.id !== id));
      this.todo = { ...this.todo, attachment_count: Math.max(0, (this.todo.attachment_count ?? 0) - 1) };
    });
  }

  onCommentFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.pendingFiles.update((list) => [...list, ...Array.from(input.files!)]);
    input.value = '';
  }

  removePendingFile(index: number): void {
    this.pendingFiles.update((list) => list.filter((_, i) => i !== index));
  }

  // ── Create-mode assignees & subtasks ─────────────────
  openCreateAssign(): void {
    const ref = this.dialog.open(AssignDialogComponent, {
      width: '580px', maxHeight: '70vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: { todoId: null, assignees: this.form.createAssignees, projectId: this.data.projectId ?? null },
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
        ? Math.floor(new Date(this.form.dueDateStr + 'T00:00:00').getTime() / 1000)
        : undefined,
      isRecurring: this.form.isRecurring,
      recurrenceRule: this.form.isRecurring
        ? { type: this.form.recurrenceType, interval: this.form.recurrenceInterval }
        : undefined,
      priority: this.form.priority || undefined,
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
      for (const r of this.form.pendingReminders) {
        const remindAt = Math.floor(new Date(r.remindAt).getTime() / 1000);
        followUp.push(this.api.post<any>(`/notifications/reminders/${todo.id}`, { remindAt, label: r.label || undefined, notifyEmail: r.notifyEmail }));
        todo.reminder_count = (todo.reminder_count ?? 0) + 1;
      }
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

  // ── History ────────────────────────────────────────────

  toggleHistory(): void {
    if (!this.historyOpen() && this.history().length === 0) {
      this.api.get<any[]>(`/todos/${this.todo.id}/history`).subscribe((h) => this.history.set(h));
    }
    this.historyOpen.update((v) => !v);
  }

  formatHistoryDate(ts: number): string {
    return new Date(ts * 1000).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  humanizeField(field: string): string {
    const map: Record<string, string> = {
      created:          'Created',
      title:            'Title',
      description:      'Description',
      due_date:         'Due date',
      priority:         'Priority',
      is_recurring:     'Recurring',
      recurrence_rule:  'Recurrence',
      status:           'Status',
      project:          'Project',
      moved:            'Moved',
      created_by:       'Creator',
      parent_task:      'Parent task',
      assignee_added:   'Assignee added',
      assignee_removed: 'Assignee removed',
      team_assigned:    'Team assigned',
      team_unassigned:  'Team unassigned',
    };
    return map[field] ?? field;
  }

  formatHistValue(field: string, value: string): string {
    if (field === 'recurrence_rule') {
      try {
        const r = JSON.parse(value);
        const unit = r.type === 'daily' ? 'day' : r.type === 'weekly' ? 'week' : r.type === 'yearly' ? 'year' : 'month';
        return `Every ${r.interval} ${unit}${r.interval !== 1 ? 's' : ''}`;
      } catch { return value; }
    }
    return value;
  }
}
