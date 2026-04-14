import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { DragStateService } from '../../core/services/drag-state.service';
import { InboxStoreService } from '../../core/services/inbox-store.service';
import { SettingsService } from '../../core/services/settings.service';
import { TaskListComponent, PromotedEvent, ReorderEvent } from '../../shared/components/task-list/task-list.component';
import { SubtaskDroppedEvent } from '../../shared/components/todo-item/todo-item.component';
import { TodoDialogComponent } from '../../shared/components/todo-dialog/todo-dialog.component';
import { FilterBarComponent, FilterSortState, DEFAULT_FILTER_STATE } from '../../shared/components/filter-bar/filter-bar.component';
import { PriorityService } from '../../core/services/priority.service';
import { forkJoin, Subscription } from 'rxjs';

const INBOX_STEPS = [
  { label: 'New',         color: '#1565c0', bg: '#e3f2fd' },
  { label: 'In Progress', color: '#e65100', bg: '#fff3e0' },
  { label: 'Done',        color: '#1b5e20', bg: '#e8f5e9' },
];

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, TaskListComponent, FilterBarComponent],
  template: `
    <div class="page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <span class="material-icons" style="font-size:20px;color:var(--accent-color)">inbox</span>
          <div>
            <h1>My Inbox</h1>
            <p>Your personal task list</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="hide-done-btn" [class.active]="hideDone()" (click)="toggleHideDone()">
            <span class="material-icons" style="font-size:14px">{{ hideDone() ? 'visibility_off' : 'visibility' }}</span>
            {{ hideDone() ? 'Show Completed' : 'Hide Completed' }}
          </button>
          <button class="btn btn-primary" (click)="openCreate()">
            <span class="material-icons" style="font-size:16px">add</span>
            New Task
          </button>
        </div>
      </div>

      <!-- Filter & sort bar -->
      <div id="tour-filter-bar">
        <app-filter-bar
          settingsKey="inbox"
          [userId]="auth.user()?.id ?? ''"
          (stateChange)="filterState.set($event)"
        />
      </div>

      <!-- Assignment + Priority filters -->
      <div id="tour-seg-filters" class="seg-row">
        <div class="pri-seg">
          <button class="pri-seg-btn" [class.active]="filterMine()" (click)="toggleAssignment('mine')">
            <span class="material-icons" style="font-size:10px">person</span>Me
          </button>
          <button class="pri-seg-btn" [class.active]="filterMyTeams()" (click)="toggleAssignment('teams')">
            <span class="material-icons" style="font-size:10px">groups</span>My Teams
          </button>
        </div>
        <div class="pri-seg">
          <button class="pri-seg-btn" [class.active]="filterPriorities().includes(0)" (click)="togglePriorityFilter(0)">
            None
          </button>
          @for (lvl of prioritySvc.levels(); track lvl.value) {
            <button
              class="pri-seg-btn"
              [class.active]="filterPriorities().includes(lvl.value)"
              [style.--pc]="lvl.color"
              (click)="togglePriorityFilter(lvl.value)"
            >
              <span class="material-icons" style="font-size:10px">priority_high</span>
              {{ lvl.label }}
            </button>
          }
        </div>
      </div>

      <!-- Step filter chips -->
      <div id="tour-step-chips" class="step-chips">
        <button class="step-chip" [class.active]="filterSteps().length === 0" (click)="filterSteps.set([])">
          All ({{ todos().length }})
        </button>
        @for (step of INBOX_STEPS; track $index) {
          <button class="step-chip" [class.active]="filterSteps().includes($index)" (click)="toggleStep($index)"
            [style.--sc]="step.color" [style.--sb]="step.bg">
            {{ step.label }} ({{ countByStep($index) }})
          </button>
        }
      </div>

      <!-- Quick add -->
      <div class="quick-add">
        <span class="material-icons quick-icon">add_circle_outline</span>
        <input
          class="quick-input"
          [(ngModel)]="quickTitle"
          placeholder="Quick add task..."
          (keydown.enter)="quickAdd()"
        />
        @if (quickTitle.trim()) {
          <button class="btn btn-primary" style="flex-shrink:0" (click)="quickAdd()">Add</button>
        }
      </div>

      <!-- Task list -->
      <div id="tour-task-list-wrap">
        <app-task-list
        listId="project-main-inbox"
        [todos]="visibleTodos()"
        [sidebarIds]="sidebarDropIds"
        [loading]="loading()"
        [emptyMessage]="emptyMessage"
        [canReorder]="canReorder"
        (reorder)="onReorder($event)"
        (open)="openDetail($event)"
        (advance)="advanceTodo($event)"
        (complete)="completeTodo($event)"
        (assigned)="todoAssigned($event)"
        (delete)="deleteTodo($event)"
        (subtaskReordered)="onSubtaskReordered($event)"
        (subtaskDropped)="onSubtaskDropped($event)"
        (subtaskCreated)="onSubtaskCreated($event)"
        (promoted)="onPromoted($event)"
      />
      </div><!-- /tour-task-list-wrap -->
    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; max-width: 860px; margin: 0 auto; }

    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
    }
    .header-left { display: flex; align-items: center; gap: 10px; }
    h1 { margin: 0 0 1px; font-size: 17px; font-weight: 600; color: var(--text-primary); }
    .header-left p { margin: 0; font-size: 11px; color: var(--text-muted); }

    .seg-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .pri-seg {
      display: inline-flex;
      border: 1px solid var(--surface-border); border-radius: 20px; overflow: hidden;
    }
    .pri-seg-btn {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 11px;
      border: none; border-left: 1px solid var(--surface-border);
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500;
      color: var(--text-secondary); transition: all 120ms; white-space: nowrap;
      &:first-child { border-left: none; }
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.active {
        background: color-mix(in srgb, var(--pc, var(--text-secondary)) 14%, transparent);
        color: var(--pc, var(--text-secondary)); font-weight: 600;
      }
    }
    .step-chips {
      display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;
    }
    .step-chip {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 10px; border-radius: 20px;
      border: 1px solid var(--surface-border);
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500;
      color: var(--text-secondary); transition: all 120ms; white-space: nowrap;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.active {
        background: color-mix(in srgb, var(--sc, var(--accent-color)) 12%, transparent);
        color: var(--sc, var(--accent-color));
        border-color: var(--sc, var(--accent-color));
        font-weight: 600;
      }
    }

    .quick-add {
      display: flex; align-items: center; gap: 8px;
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 8px; padding: 8px 12px; margin-bottom: 12px;
      transition: border-color 120ms;
      &:focus-within { border-color: var(--accent-color); }
    }
    .quick-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }
    .quick-input {
      flex: 1; border: 0; background: transparent; outline: none;
      font-family: inherit; font-size: 14px; color: var(--text-primary);
      &::placeholder { color: var(--text-muted); }
    }

    /* Tour animation */
    #tour-task-list-wrap { transition: opacity 150ms; }
    #tour-task-list-wrap.tour-tasks-hidden { opacity: 0; pointer-events: none; }
    #tour-task-list-wrap.tour-tasks-animate-in {
      animation: tourTasksIn 450ms cubic-bezier(.22,1,.36,1) forwards;
    }
    @keyframes tourTasksIn {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .hide-done-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 20px;
      border: 1px solid var(--surface-border);
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500;
      color: var(--text-muted); transition: all 120ms;
      &:hover { color: var(--text-secondary); background: var(--surface-hover); }
      &.active { color: var(--accent-color); border-color: var(--accent-color);
        background: color-mix(in srgb, var(--accent-color) 8%, transparent); }
    }
  `],
})
export class InboxComponent implements OnInit, OnDestroy {
  private api      = inject(ApiService);
  private dialog   = inject(Dialog);
  private store    = inject(InboxStoreService);
  private settings = inject(SettingsService);
  auth             = inject(AuthService);
  dragState        = inject(DragStateService);
  prioritySvc      = inject(PriorityService);

  readonly INBOX_STEPS = INBOX_STEPS;

  todos            = signal<any[]>([]);
  loading          = signal(true);
  hideDone         = signal(false);
  hideRecurring    = signal(true);
  filterState      = signal<FilterSortState>(DEFAULT_FILTER_STATE);
  filterSteps      = signal<number[]>([]);
  filterPriorities = signal<number[]>([]);
  filterMine       = signal(false);
  filterMyTeams    = signal(false);
  visibleTodos     = signal<any[]>([]);
  userTeamIds      = signal<string[]>([]);
  quickTitle = '';
  private reloadSub?: Subscription;

  get sidebarDropIds(): string[] {
    return (this.store.inboxes() ?? []).map((i) => `inbox-drop-${i.id}`);
  }

  get canReorder(): boolean {
    return this.filterSteps().length === 0 && this.filterPriorities().length === 0
      && !this.filterMine() && !this.filterMyTeams()
      && !this.hideDone() && this.filterState().sortBy === 'manual';
  }

  get emptyMessage(): string {
    return this.hideDone() && this.todos().length > 0 ? 'All tasks are done!' : 'Your inbox is clear!';
  }

  constructor() {
    effect(() => {
      if (this.settings.loaded()) {
        const hd = this.settings.get('inbox.hideDone');
        this.hideDone.set(hd === null ? true : hd === '1');
        const hr = this.settings.get('inbox.hideRecurring');
        this.hideRecurring.set(hr === null ? true : hr === '1');
      }
    });

    effect(() => {
      const fs        = this.filterState();
      const userId    = this.auth.user()?.id ?? '';
      const teamIds   = this.userTeamIds();
      const nowSec    = Math.floor(Date.now() / 1000);
      let list = this.todos();

      if (this.hideDone()) {
        list = list
          .filter((t) => t.flow_step_index < 2)
          .map((t) => ({ ...t, subtodos: (t.subtodos ?? []).filter((s: any) => s.flow_step_index < 2) }));
      }
      if (this.filterMine())     list = list.filter((t) => t.assignees?.users?.some((u: any) => u.id === userId));
      if (this.filterMyTeams())  list = list.filter((t) => t.assignees?.teams?.some((team: any) => teamIds.includes(team.id)));
      if (fs.assignedByMe)       list = list.filter((t) => t.created_by === userId);
      if (fs.overdue)     list = list.filter((t) => t.due_date && t.due_date < nowSec && t.flow_step_index < 2);
      if (fs.comingUp)    list = list.filter((t) => t.due_date && t.due_date >= nowSec);
      if (fs.recurring)   list = list.filter((t) => t.is_recurring);

      if (fs.sortBy !== 'manual') {
        list = [...list].sort((a, b) => {
          switch (fs.sortBy) {
            case 'due_asc':   return (a.due_date ?? Infinity) - (b.due_date ?? Infinity);
            case 'due_desc':
              if (!a.due_date && !b.due_date) return 0;
              if (!a.due_date) return 1;
              if (!b.due_date) return -1;
              return b.due_date - a.due_date;
            case 'title_asc':  return a.title.localeCompare(b.title);
            case 'title_desc': return b.title.localeCompare(a.title);
            case 'step':       return a.flow_step_index - b.flow_step_index;
            default: return 0;
          }
        });
      }

      const steps = this.filterSteps();
      if (steps.length > 0) list = list.filter((t) => steps.includes(t.flow_step_index));

      const priorities = this.filterPriorities();
      if (priorities.length > 0) list = list.filter((t) => priorities.includes(t.priority ?? 0));

      this.visibleTodos.set(list);
    });

    effect(() => {
      const movedId = this.dragState.movedTodoId();
      if (movedId) {
        this.todos.update((list) => list.filter((t) => t.id !== movedId));
        this.dragState.movedTodoId.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.dragState.currentProjectId.set('inbox');
    this.load();
    this.api.get<{ id: string }[]>('/teams/mine').subscribe((teams) =>
      this.userTeamIds.set(teams.map((t) => t.id)),
    );
    this.reloadSub = this.store.reload$.subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.dragState.currentProjectId.set(null);
    this.dragState.isDragging.set(false);
    this.reloadSub?.unsubscribe();
  }

  toggleHideDone(): void {
    const next = !this.hideDone();
    this.hideDone.set(next);
    this.settings.set('inbox.hideDone', next ? '1' : '0');
  }

  toggleHideRecurring(): void {
    const next = !this.hideRecurring();
    this.hideRecurring.set(next);
    this.settings.set('inbox.hideRecurring', next ? '1' : '0');
  }

  toggleStep(index: number): void {
    this.filterSteps.update((s) => s.includes(index) ? [] : [index]);
  }

  toggleAssignment(which: 'mine' | 'teams'): void {
    if (which === 'mine') {
      const next = !this.filterMine();
      this.filterMine.set(next);
      if (next) this.filterMyTeams.set(false);
    } else {
      const next = !this.filterMyTeams();
      this.filterMyTeams.set(next);
      if (next) this.filterMine.set(false);
    }
  }

  togglePriorityFilter(value: number): void {
    this.filterPriorities.update((s) => s.includes(value) ? [] : [value]);
  }

  hasPriorityTasks(): boolean {
    return this.todos().some((t) => (t.priority ?? 0) > 0);
  }

  countByStep(index: number): number {
    return this.todos().filter((t) => t.flow_step_index === index).length;
  }

  load(): void {
    this.loading.set(true);
    this.api.get<any[]>('/inbox').subscribe({
      next: (todos) => { this.todos.set(todos); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  // ── Task list event handlers ──────────────────────────

  onReorder(ev: ReorderEvent): void {
    this.todos.set(ev.todos);
    this.api.patch('/todos/reorder', ev.todos.map((t, i) => ({ id: t.id, sortOrder: i }))).subscribe();
  }

  onPromoted(ev: PromotedEvent): void {
    const { sub, parentId, insertIndex } = ev;
    this.api.patch<any>(`/todos/${sub.id}`, { parentTodoId: null }).subscribe((promoted) => {
      this.todos.update((list) => list.map((t) =>
        t.id === parentId ? { ...t, subtodos: t.subtodos?.filter((s: any) => s.id !== sub.id) } : t,
      ));
      this.todos.update((list) => {
        const next = [...list];
        next.splice(insertIndex, 0, promoted);
        return next;
      });
    });
  }

  onSubtaskReordered(updated: any): void {
    this.todos.update((list) => list.map((t) => t.id === updated.id ? updated : t));
  }

  onSubtaskCreated(ev: { parentId: string; sub: any }): void {
    this.todos.update((list) => list.map((t) =>
      t.id === ev.parentId ? { ...t, subtodos: [...(t.subtodos ?? []), ev.sub] } : t,
    ));
  }

  onSubtaskDropped(ev: SubtaskDroppedEvent): void {
    if (ev.type === 'reattach') {
      this.api.patch<any>(`/todos/${ev.item.id}`, { parentTodoId: ev.newParentId }).subscribe((updated) => {
        this.todos.update((list) => {
          let next = list.map((t) =>
            t.id === ev.oldParentId
              ? { ...t, subtodos: (t.subtodos ?? []).filter((s: any) => s.id !== ev.item.id) }
              : t,
          );
          next = next.map((t) => {
            if (t.id !== ev.newParentId) return t;
            const subs = [...(t.subtodos ?? [])];
            subs.splice(ev.currentIndex, 0, updated);
            return { ...t, subtodos: subs };
          });
          return next;
        });
      });
    } else if (ev.type === 'demote') {
      const flatten = ev.subtasksToFlatten ?? [];
      const calls = [
        this.api.patch<any>(`/todos/${ev.item.id}`, { parentTodoId: ev.newParentId }),
        ...flatten.map((s: any) => this.api.patch<any>(`/todos/${s.id}`, { parentTodoId: ev.newParentId })),
      ];
      forkJoin(calls).subscribe(([demoted, ...flatSubs]) => {
        this.todos.update((list) => {
          const next = list.filter((t) => t.id !== ev.item.id);
          return next.map((t) => {
            if (t.id !== ev.newParentId) return t;
            const subs = [...(t.subtodos ?? [])];
            subs.splice(ev.currentIndex, 0,
              { ...demoted, parent_todo_id: ev.newParentId },
              ...flatSubs.map((s: any) => ({ ...s, parent_todo_id: ev.newParentId })),
            );
            return { ...t, subtodos: subs };
          });
        });
      });
    }
  }

  // ── Quick add ─────────────────────────────────────────
  quickAdd(): void {
    const title = this.quickTitle.trim();
    if (!title) return;
    this.api.post<any>('/inbox', { title }).subscribe((todo) => {
      this.todos.update((list) => [...list, todo]);
      this.quickTitle = '';
    });
  }

  // ── Task dialogs ──────────────────────────────────────
  openCreate(): void {
    const ref = this.dialog.open(TodoDialogComponent, {
      width: '540px', maxHeight: '90vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: { mode: 'create', isInbox: true },
    });
    ref.closed.subscribe((result: any) => {
      if (result) this.todos.update((list) => [...list, result]);
    });
  }

  openDetail(todo: any): void {
    const ref = this.dialog.open(TodoDialogComponent, {
      width: '640px', maxHeight: '90vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: { mode: 'detail', todo, isInbox: !todo.project_id },
    });
    ref.closed.subscribe((result: any) => {
      if (result === 'deleted') {
        this.todos.update((list) => list.filter((t) => t.id !== todo.id));
      } else if (result) {
        this.todos.update((list) => list.map((t) => (t.id === result.id ? result : t)));
      }
    });
  }

  private mergeTodo(list: any[], updated: any): any[] {
    return list.map((t) => {
      if (t.id === updated.id) return { ...t, ...updated };
      if (t.subtodos?.some((s: any) => s.id === updated.id)) {
        return { ...t, subtodos: t.subtodos.map((s: any) => s.id === updated.id ? { ...s, ...updated } : s) };
      }
      return t;
    });
  }

  advanceTodo(todo: any): void {
    this.api.patch<any>(`/todos/${todo.id}/advance`, {}).subscribe((updated) => {
      this.todos.update((list) => {
        const { _spawned, ...t } = updated;
        const next = this.mergeTodo(list, t);
        return _spawned ? [...next, _spawned] : next;
      });
    });
  }

  completeTodo(todo: any): void {
    this.api.patch<any>(`/todos/${todo.id}/complete`, {}).subscribe((updated) => {
      this.todos.update((list) => {
        const { _spawned, ...t } = updated;
        const next = this.mergeTodo(list, t);
        return _spawned ? [...next, _spawned] : next;
      });
    });
  }

  todoAssigned(updated: any): void {
    this.todos.update((list) => this.mergeTodo(list, updated));
  }

  deleteTodo(id: string): void {
    this.api.delete(`/todos/${id}`).subscribe(() => {
      this.todos.update((list) => list.filter((t) => t.id !== id));
    });
  }
}
