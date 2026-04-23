import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, signal, Input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { InboxStoreService } from '../../../core/services/inbox-store.service';
import { DragStateService } from '../../../core/services/drag-state.service';
import { SettingsService } from '../../../core/services/settings.service';
import { TaskListComponent, PromotedEvent, ReorderEvent } from '../../../shared/components/task-list/task-list.component';
import { SubtaskDroppedEvent } from '../../../shared/components/todo-item/todo-item.component';
import { TodoDialogComponent } from '../../../shared/components/todo-dialog/todo-dialog.component';
import { NewProjectDialogComponent } from '../new-project-dialog/new-project-dialog.component';
import { FilterBarComponent, FilterSortState, DEFAULT_FILTER_STATE, isFilterActive, comingUpCutoff } from '../../../shared/components/filter-bar/filter-bar.component';
import { forkJoin, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NotificationService } from '../../../core/services/notification.service';
import { PriorityService } from '../../../core/services/priority.service';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TaskListComponent, FilterBarComponent],
  template: `
    <div class="page">
      @if (project()) {
        <!-- Breadcrumb -->
        <div class="breadcrumb">
          <a routerLink="/projects" class="bc-link">Inboxes</a>
          <span class="material-icons" style="font-size:13px">chevron_right</span>
          <span>{{ project().name }}</span>
        </div>

        <!-- Header -->
        <div class="page-header">
          <div class="header-left">
            <div class="proj-avatar" [style.background]="project().color || 'var(--accent-color)'">
              {{ project().emoji || project().name[0].toUpperCase() }}
            </div>
            <div>
              <h1>{{ project().name }}</h1>
              <div class="header-meta">
                @if (project().description) {
                  <span class="meta-desc">{{ project().description }}</span>
                }
                <span class="member-count">
                  <span class="material-icons" style="font-size:11px">group</span>
                  {{ memberSummary() }}
                </span>
                @if (project().owner_name) {
                  <span class="member-count">
                    <span class="material-icons" style="font-size:11px">person</span>
                    Owned by {{ project().owner_name }}
                  </span>
                }
              </div>
            </div>
          </div>
          <div class="header-right">
            <div class="flow-steps">
              @for (step of project().flow_steps; track $index) {
                <span class="flow-step-label">{{ stepLabel(step) }}</span>
                @if ($index < project().flow_steps.length - 1) {
                  <span class="material-icons" style="font-size:12px;color:var(--text-muted)">arrow_forward</span>
                }
              }
            </div>
            <button class="btn btn-primary" (click)="openCreate()">
              <span class="material-icons" style="font-size:16px">add</span>
              Add Task
            </button>
            @if (isOwnerOrAdmin()) {
              <button class="btn btn-ghost" (click)="openEdit()" title="Edit inbox">
                <span class="material-icons" style="font-size:15px">settings</span>
              </button>
            }
          </div>
        </div>

        <!-- Filter & sort bar -->
        <app-filter-bar
          [settingsKey]="'project.' + id"
          [userId]="auth.user()?.id ?? ''"
          (stateChange)="filterState.set($event)"
        />

        <!-- Assignment + Priority filters -->
        <div class="seg-row">
          <div class="pri-seg">
            <button class="pri-seg-btn" [class.active]="filterMine()" (click)="toggleAssignment('mine')">
              <span class="material-icons" style="font-size:10px">person</span>Assigned to Me
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

        <!-- Step filter tabs -->
        <div class="filter-bar">
          <button class="filter-btn" [class.active]="filterSteps().length === 0" (click)="filterSteps.set([])">
            All ({{ todos().length }})
          </button>
          @for (step of project().flow_steps; track $index) {
            <button class="filter-btn" [class.active]="filterSteps().includes($index)" (click)="toggleStepFilter($index)">
              {{ stepLabel(step) }} ({{ countByStep($index) }})
            </button>
          }
          <div class="filter-spacer"></div>
          <button class="filter-toggle" [class.active]="hideDone()" (click)="toggleHideDone()">
            <span class="material-icons" style="font-size:14px">{{ hideDone() ? 'visibility_off' : 'visibility' }}</span>
            {{ hideDone() ? 'Show Completed' : 'Hide Completed' }}
          </button>
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
        <app-task-list
          [listId]="mainListId"
          [todos]="filteredTodos()"
          [flowSteps]="project().flow_steps"
          [sidebarIds]="sidebarDropIds"
          [canReorder]="canReorderMain"
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

      } @else {
        <div class="loading-state"><div class="spinner"></div></div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; max-width: 860px; margin: 0 auto; }

    .breadcrumb {
      display: flex; align-items: center; gap: 3px;
      margin-bottom: 14px; font-size: 11px; color: var(--text-muted);
    }
    .bc-link { color: var(--accent-color); text-decoration: none; &:hover { text-decoration: underline; } }

    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 16px; gap: 12px; flex-wrap: wrap;
    }
    .header-left { display: flex; gap: 10px; align-items: center; }
    .proj-avatar {
      width: 34px; height: 34px; flex-shrink: 0;
      color: #fff; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 18px;
    }
    h1 { margin: 0 0 2px; font-size: 17px; font-weight: 600; color: var(--text-primary); }
    .header-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .meta-desc { font-size: 11px; color: var(--text-muted); }
    .member-count {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 11px; color: var(--text-muted);
    }
    .header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

    .flow-steps {
      display: flex; align-items: center; gap: 4px;
      background: var(--surface-hover); border-radius: 20px; padding: 3px 10px;
    }
    .flow-step-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); }

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
    .filter-bar { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; }
    .filter-btn {
      padding: 3px 10px; border-radius: 20px;
      border: 1px solid var(--surface-border);
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500;
      color: var(--text-secondary); transition: all 120ms;
      &:hover { background: var(--surface-hover); }
      &.active { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
    }
    .filter-spacer { flex: 1; }
    .filter-toggle {
      display: flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      border: 1px solid var(--surface-border);
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500;
      color: var(--text-muted); transition: all 120ms;
      &:hover { color: var(--text-secondary); background: var(--surface-hover); }
      &.active { color: var(--accent-color); border-color: var(--accent-color);
        background: color-mix(in srgb, var(--accent-color) 8%, transparent); }
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

    .loading-state {
      display: flex; align-items: center; justify-content: center; height: 160px;
    }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid var(--surface-border); border-top-color: var(--accent-color);
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class ProjectDetailComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id!: string;

  private api      = inject(ApiService);
  auth             = inject(AuthService);
  private store    = inject(InboxStoreService);
  private dialog   = inject(Dialog);
  private settings = inject(SettingsService);
  dragState        = inject(DragStateService);
  private notifSvc = inject(NotificationService);

  private refreshSub?: Subscription;

  prioritySvc      = inject(PriorityService);

  project          = signal<any>(null);
  todos            = signal<any[]>([]);
  filterSteps      = signal<number[]>([]);
  filterPriorities = signal<number[]>([]);
  filterMine       = signal(false);
  filterMyTeams    = signal(false);
  hideDone         = signal(true);
  hideRecurring    = signal(true);
  filterState      = signal<FilterSortState>(DEFAULT_FILTER_STATE);
  filteredTodos    = signal<any[]>([]);
  userTeamIds      = signal<string[]>([]);
  quickTitle = '';

  get mainListId(): string { return `project-main-${this.id}`; }

  get sidebarDropIds(): string[] {
    return [
      'inbox-drop-personal',
      ...(this.store.inboxes() ?? [])
        .filter((i) => i.id !== this.id)
        .map((i) => `inbox-drop-${i.id}`),
    ];
  }

  get canReorderMain(): boolean {
    return this.filterSteps().length === 0 && this.filterPriorities().length === 0
      && !this.filterMine() && !this.filterMyTeams()
      && !this.hideDone() && !isFilterActive(this.filterState());
  }

  constructor() {
    effect(() => {
      if (this.settings.loaded() && this.id) {
        const hd = this.settings.get(`project.${this.id}.hideDone`);
        const newHideDone = hd === null ? true : hd === '1';
        this.hideDone.set(newHideDone);
        if (!newHideDone) this.loadTodos();
        const hr = this.settings.get(`project.${this.id}.hideRecurring`);
        this.hideRecurring.set(hr === null ? true : hr === '1');
      }
    });

    effect(() => {
      let list = this.todos();
      const maxStep   = (this.project()?.flow_steps?.length ?? 3) - 1;
      const fs        = this.filterState();
      const userId    = this.auth.user()?.id ?? '';
      const nowSec    = Math.floor(Date.now() / 1000);

      if (this.hideDone()) {
        list = list
          .filter((t) => t.flow_step_index < maxStep)
          .map((t) => ({ ...t, subtodos: (t.subtodos ?? []).filter((s: any) => s.flow_step_index < maxStep) }));
      }
      if (this.filterMine())     list = list.filter((t) => t.assignees?.users?.some((u: any) => u.id === userId));
      if (this.filterMyTeams())  list = list.filter((t) => t.assignees?.teams?.some((team: any) => this.userTeamIds().includes(team.id)));
      if (fs.assignedByMe)       list = list.filter((t) => t.created_by === userId);
      if (fs.overdue)     list = list.filter((t) => t.due_date && t.due_date < nowSec && t.flow_step_index < maxStep);
      if (fs.comingUp)    { const cut = comingUpCutoff(fs.comingUp); list = list.filter((t) => t.due_date && t.due_date >= nowSec && (cut === null || t.due_date <= cut)); }
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

      this.filteredTodos.set(list);
    });

    effect(() => {
      const movedId = this.dragState.movedTodoId();
      if (movedId) {
        this.todos.update((list) => list.filter((t) => t.id !== movedId));
        this.dragState.movedTodoId.set(null);
      }
    });

    effect(() => {
      const info = this.dragState.movedSubtaskInfo();
      if (info) {
        this.todos.update((list) => list.map((t) =>
          t.id === info.parentId
            ? { ...t, subtodos: (t.subtodos ?? []).filter((s: any) => s.id !== info.id) }
            : t,
        ));
        this.dragState.movedSubtaskInfo.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.dragState.currentProjectId.set(this.id);
    this.loadProject();
    this.api.get<{ id: string }[]>('/teams/mine').subscribe((teams) =>
      this.userTeamIds.set(teams.map((t) => t.id)),
    );
    this.loadTodos();
    this.refreshSub = this.notifSvc.refresh$
      .pipe(filter((p) => p.projectId === this.id))
      .subscribe(() => this.loadTodos());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && !changes['id'].isFirstChange()) {
      this.project.set(null);
      this.todos.set([]);
      this.dragState.currentProjectId.set(this.id);
      this.loadProject();
      this.loadTodos();
    }
  }

  ngOnDestroy(): void {
    this.dragState.currentProjectId.set(null);
    this.dragState.isDragging.set(false);
    this.refreshSub?.unsubscribe();
  }

  loadProject(): void {
    this.api.get<any>(`/projects/${this.id}`).subscribe((p) => this.project.set(p));
  }

  loadTodos(): void {
    const qs = this.hideDone() ? '' : '?includeDone=true';
    this.api.get<any[]>(`/todos/project/${this.id}${qs}`).subscribe((t) => this.todos.set(t));
  }

  countByStep(step: number): number {
    return this.todos().filter((t) => t.flow_step_index === step).length;
  }

  toggleStepFilter(index: number): void {
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

  toggleHideDone(): void {
    const next = !this.hideDone();
    this.hideDone.set(next);
    this.settings.set(`project.${this.id}.hideDone`, next ? '1' : '0');
    this.loadTodos();
  }

  toggleHideRecurring(): void {
    const next = !this.hideRecurring();
    this.hideRecurring.set(next);
    this.settings.set(`project.${this.id}.hideRecurring`, next ? '1' : '0');
  }

  memberSummary(): string {
    const p = this.project();
    if (!p) return '';
    const members: any[] = p.members ?? [];
    const userCount = 1 + members.filter((m: any) => m.user_id).length;
    const teamCount = members.filter((m: any) => m.team_id).length;
    const parts: string[] = [];
    if (userCount > 0) parts.push(`${userCount} user${userCount !== 1 ? 's' : ''}`);
    if (teamCount > 0) parts.push(`${teamCount} team${teamCount !== 1 ? 's' : ''}`);
    return parts.join(', ');
  }

  stepLabel(step: any): string {
    return typeof step === 'string' ? step : step?.label ?? '';
  }

  // ── Task list event handlers ──────────────────────────

  onReorder(ev: ReorderEvent): void {
    this.todos.set(ev.todos.map((t, i) => ({ ...t, sort_order: i })));
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
      const ordered = this.todos();
      this.api.patch('/todos/reorder', ordered.map((t, i) => ({ id: t.id, sortOrder: i }))).subscribe();
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
        const parent = this.todos().find((t) => t.id === ev.newParentId);
        if (parent?.subtodos?.length) {
          this.api.patch('/todos/reorder', parent.subtodos.map((s: any, i: number) => ({ id: s.id, sortOrder: i }))).subscribe();
        }
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

  // ── Quick add ────────────────────────────────────────────
  quickAdd(): void {
    const title = this.quickTitle.trim();
    if (!title) return;
    this.api.post<any>('/todos', { title, projectId: this.id }).subscribe((todo) => {
      this.todos.update((list) => [...list, todo]);
      this.quickTitle = '';
      this.store.adjustCounts(this.id, 1, 1);
    });
  }

  // ── Task CRUD dialogs ────────────────────────────────────
  openCreate(): void {
    const ref = this.dialog.open(TodoDialogComponent, {
      width: '640px', maxHeight: '90vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: { mode: 'create', projectId: this.id, flowSteps: this.project()?.flow_steps },
    });
    ref.closed.subscribe((todo: any) => {
      if (todo) {
        this.todos.update((list) => [...list, todo]);
        this.store.adjustCounts(this.id, 1, 1);
      }
    });
  }

  openDetail(todo: any): void {
    const ref = this.dialog.open(TodoDialogComponent, {
      width: '640px', maxHeight: '90vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: {
        mode: 'detail', todo,
        projectId: todo.project_id ?? this.id,
        flowSteps: this.project()?.flow_steps,
        onUpdate: (updated: any) => this.todos.update((list) => this.mergeTodo(list, updated)),
      },
    });
    ref.closed.subscribe((result: any) => {
      if (!result) return;
      if (result === 'deleted') {
        this.todos.update((list) => list
          .filter((t) => t.id !== todo.id)
          .map((t) => ({ ...t, subtodos: t.subtodos?.filter((s: any) => s.id !== todo.id) })));
        if (!todo.parent_todo_id) this.store.adjustCounts(this.id, todo.flow_step_index === 0 ? -1 : 0, -1);
      } else {
        if (result.flow_step_index !== todo.flow_step_index && !todo.parent_todo_id) {
          const wasNew = todo.flow_step_index === 0;
          const isNew  = result.flow_step_index === 0;
          if (wasNew && !isNew) this.store.adjustCounts(this.id, -1, 0);
          else if (!wasNew && isNew) this.store.adjustCounts(this.id, 1, 0);
        }
        this.todos.update((list) => list.map((t) => {
          if (t.id === result.id) return result;
          if (t.subtodos?.some((s: any) => s.id === result.id)) {
            return { ...t, subtodos: t.subtodos.map((s: any) => s.id === result.id ? result : s) };
          }
          return t;
        }));
      }
    });
  }

  openEdit(): void {
    const ref = this.dialog.open(NewProjectDialogComponent, {
      width: '500px', maxHeight: '90vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: { project: this.project() },
    });
    ref.closed.subscribe((result: any) => {
      if (result && result !== 'deleted') {
        this.project.update((p) => ({ ...p, ...result }));
        this.store.update(result);
      }
    });
  }

  isOwnerOrAdmin(): boolean {
    const p = this.project();
    const u = this.auth.user();
    if (!p || !u) return false;
    return u.role === 'admin' || p.owner_id === u.id;
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
    const wasNew = todo.flow_step_index === 0;
    this.api.patch<any>(`/todos/${todo.id}/advance`, {}).subscribe((updated) => {
      const { _spawned, ...t } = updated;
      this.todos.update((list) => {
        const next = this.mergeTodo(list, t);
        return _spawned ? [...next, _spawned] : next;
      });
      if (wasNew) this.store.adjustCounts(this.id, -1, 0);
      if (_spawned) this.store.adjustCounts(this.id, 1, 1);
    });
  }

  completeTodo(todo: any): void {
    const wasNew = todo.flow_step_index === 0;
    this.api.patch<any>(`/todos/${todo.id}/complete`, {}).subscribe((updated) => {
      const { _spawned, ...t } = updated;
      this.todos.update((list) => {
        const next = this.mergeTodo(list, t);
        return _spawned ? [...next, _spawned] : next;
      });
      if (wasNew) this.store.adjustCounts(this.id, -1, 0);
      if (_spawned) this.store.adjustCounts(this.id, 1, 1);
    });
  }

  todoAssigned(updated: any): void {
    // Handle undo-to-step-0: if updated is now step 0, find current step in list to diff
    const current = this.todos().find((t) => t.id === updated.id);
    if (current && updated.flow_step_index === 0 && current.flow_step_index !== 0) {
      this.store.adjustCounts(this.id, 1, 0);
    }
    this.todos.update((list) => this.mergeTodo(list, updated));
  }

  deleteTodo(id: string): void {
    const todo = this.todos().find((t) => t.id === id);
    this.api.delete(`/todos/${id}`).subscribe(() => {
      this.todos.update((list) => list.filter((t) => t.id !== id));
      if (todo) this.store.adjustCounts(this.id, todo.flow_step_index === 0 ? -1 : 0, -1);
    });
  }
}
