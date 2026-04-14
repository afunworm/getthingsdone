import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { InboxStoreService } from '../../core/services/inbox-store.service';
import { NotificationService } from '../../core/services/notification.service';
import { SettingsService } from '../../core/services/settings.service';
import { TaskListComponent, PromotedEvent } from '../../shared/components/task-list/task-list.component';
import { SubtaskDroppedEvent } from '../../shared/components/todo-item/todo-item.component';
import { TodoDialogComponent } from '../../shared/components/todo-dialog/todo-dialog.component';
import { FilterBarComponent, FilterSortState, DEFAULT_FILTER_STATE } from '../../shared/components/filter-bar/filter-bar.component';
import { PriorityService } from '../../core/services/priority.service';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface TaggedTodo {
  todo: any;
  inboxId: string | 'personal';
  inboxName: string;
  inboxColor: string;
  maxStep: number;
}

const FLOW_STEPS = [
  { label: 'New',         color: '#1565c0', bg: '#e3f2fd' },
  { label: 'In Progress', color: '#e65100', bg: '#fff3e0' },
  { label: 'Done',        color: '#1b5e20', bg: '#e8f5e9' },
];

function endOfTodaySec(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return Math.floor(d.getTime() / 1000);
}

function startOfTodaySec(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

@Component({
  selector: 'app-today',
  standalone: true,
  imports: [CommonModule, TaskListComponent, FilterBarComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="header-left">
          <span class="material-icons" style="font-size:20px;color:var(--accent-color)">today</span>
          <div>
            <h1>Today's Tasks</h1>
            <p>{{ subtitle() }}</p>
          </div>
        </div>
        <button class="hide-done-btn" [class.active]="hideDone()" (click)="toggleHideDone()">
          <span class="material-icons" style="font-size:14px">{{ hideDone() ? 'visibility_off' : 'visibility' }}</span>
          {{ hideDone() ? 'Show Completed' : 'Hide Completed' }}
        </button>
      </div>

      <!-- Inbox filter chips -->
      <div class="inbox-chips">
        <button class="inbox-chip" [class.active]="selectedInboxIds().length === 0" (click)="selectedInboxIds.set([])">
          <span class="material-icons" style="font-size:12px">select_all</span>All
        </button>
        <button class="inbox-chip personal-chip" [class.active]="selectedInboxIds().includes('personal')"
          (click)="toggleInbox('personal')">
          <span class="material-icons" style="font-size:12px">inbox</span>My Inbox
        </button>
        @for (inbox of (store.inboxes() ?? []); track inbox.id) {
          <button class="inbox-chip" [class.active]="selectedInboxIds().includes(inbox.id)"
            (click)="toggleInbox(inbox.id)" [style.--chip-color]="inbox.color || 'var(--accent-color)'">
            <span class="inbox-dot">{{ inbox.emoji || inbox.name[0].toUpperCase() }}</span>
            {{ inbox.name }}
          </button>
        }
      </div>

      <!-- Sort bar -->
      <app-filter-bar settingsKey="today" [userId]="auth.user()?.id ?? ''" [hideFilters]="['assignedByMe','overdue','comingUp','recurring']" (stateChange)="filterState.set($event)" />

      <!-- Priority chips -->
      <div class="seg-row">
        <div class="pri-seg">
          <button class="pri-seg-btn" [class.active]="filterPriorities().includes(0)" (click)="togglePriority(0)">None</button>
          @for (lvl of prioritySvc.levels(); track lvl.value) {
            <button class="pri-seg-btn" [class.active]="filterPriorities().includes(lvl.value)"
              [style.--pc]="lvl.color" (click)="togglePriority(lvl.value)">
              <span class="material-icons" style="font-size:10px">priority_high</span>{{ lvl.label }}
            </button>
          }
        </div>
      </div>

      <!-- Step filter chips -->
      <div class="step-chips">
        <button class="step-chip" [class.active]="filterSteps().length === 0" (click)="filterSteps.set([])">All</button>
        @for (step of FLOW_STEPS; track $index) {
          <button class="step-chip" [class.active]="filterSteps().includes($index)" (click)="toggleStep($index)"
            [style.--sc]="step.color" [style.--sb]="step.bg">{{ step.label }}</button>
        }
      </div>

      <!-- Task list -->
      <app-task-list
        listId="today-list"
        [todos]="visibleTodoItems()"
        [sidebarIds]="[]"
        [loading]="loading()"
        emptyMessage="Nothing due today — enjoy the day!"
        [canReorder]="false"
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
    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; max-width: 860px; margin: 0 auto; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .header-left { display: flex; align-items: center; gap: 10px; }
    h1 { margin: 0 0 1px; font-size: 17px; font-weight: 600; color: var(--text-primary); }
    .header-left p { margin: 0; font-size: 11px; color: var(--text-muted); }
    .hide-done-btn {
      display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px;
      border: 1px solid var(--surface-border); background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500; color: var(--text-muted); transition: all 120ms;
      &:hover { color: var(--text-secondary); background: var(--surface-hover); }
      &.active { color: var(--accent-color); border-color: var(--accent-color);
        background: color-mix(in srgb, var(--accent-color) 8%, transparent); }
    }
    .inbox-chips { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
    .inbox-chip {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px;
      border: 1px solid var(--surface-border); background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500; color: var(--text-secondary);
      transition: all 120ms; white-space: nowrap;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.active {
        background: color-mix(in srgb, var(--chip-color, var(--accent-color)) 12%, transparent);
        color: var(--chip-color, var(--accent-color)); border-color: var(--chip-color, var(--accent-color)); font-weight: 600;
      }
    }
    .personal-chip { --chip-color: var(--accent-color); }
    .inbox-dot {
      width: 14px; height: 14px; border-radius: 4px;
      background: var(--chip-color, var(--accent-color));
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700; color: #fff; flex-shrink: 0;
    }
    .seg-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .pri-seg { display: inline-flex; border: 1px solid var(--surface-border); border-radius: 20px; overflow: hidden; }
    .pri-seg-btn {
      display: inline-flex; align-items: center; gap: 3px; padding: 3px 11px;
      border: none; border-left: 1px solid var(--surface-border); background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500; color: var(--text-secondary);
      transition: all 120ms; white-space: nowrap;
      &:first-child { border-left: none; }
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.active { background: color-mix(in srgb, var(--pc, var(--text-secondary)) 14%, transparent); color: var(--pc, var(--text-secondary)); font-weight: 600; }
    }
    .step-chips { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
    .step-chip {
      display: inline-flex; align-items: center; gap: 3px; padding: 3px 10px; border-radius: 20px;
      border: 1px solid var(--surface-border); background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500; color: var(--text-secondary);
      transition: all 120ms; white-space: nowrap;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.active {
        background: color-mix(in srgb, var(--sc, var(--accent-color)) 12%, transparent);
        color: var(--sc, var(--accent-color)); border-color: var(--sc, var(--accent-color)); font-weight: 600;
      }
    }
  `],
})
export class TodayComponent implements OnInit, OnDestroy {
  private api      = inject(ApiService);
  private dialog   = inject(Dialog);
  private settings = inject(SettingsService);
  store            = inject(InboxStoreService);
  auth             = inject(AuthService);
  private notifSvc = inject(NotificationService);
  prioritySvc      = inject(PriorityService);

  private refreshSub?: Subscription;
  private dataLoaded = false;

  readonly FLOW_STEPS = FLOW_STEPS;

  private allTodos  = signal<TaggedTodo[]>([]);
  loading           = signal(true);
  hideDone          = signal(true);
  filterState       = signal<FilterSortState>({ ...DEFAULT_FILTER_STATE, sortBy: 'due_asc' });
  selectedInboxIds  = signal<string[]>([]);
  filterSteps       = signal<number[]>([]);
  filterPriorities  = signal<number[]>([]);
  visibleTodos      = signal<TaggedTodo[]>([]);
  overdueCount      = signal(0);
  todayCount        = signal(0);

  visibleTodoItems = () => this.visibleTodos().map((i) => i.todo);

  subtitle = () => {
    const ov = this.overdueCount(), td = this.todayCount();
    if (ov === 0 && td === 0) return 'All clear';
    const parts: string[] = [];
    if (ov > 0) parts.push(`${ov} overdue`);
    if (td > 0) parts.push(`${td} due today`);
    return parts.join(', ');
  };

  constructor() {
    effect(() => {
      if (this.settings.loaded()) {
        const hd = this.settings.get('today.hideDone');
        this.hideDone.set(hd === null ? true : hd === '1');
      }
    });

    effect(() => {
      const inboxes = this.store.inboxes();
      if (!this.dataLoaded && inboxes !== null) {
        this.dataLoaded = true;
        this.load();
      }
    });

    effect(() => {
      const fs  = this.filterState();
      const eod = endOfTodaySec();
      const sod = startOfTodaySec();
      const selected = this.selectedInboxIds();

      // Base set: only tasks due today or earlier
      let list = this.allTodos().filter((item) =>
        item.todo.due_date != null && item.todo.due_date <= eod,
      );

      if (selected.length > 0) list = list.filter((item) => selected.includes(item.inboxId));

      if (this.hideDone()) {
        list = list
          .filter((item) => item.todo.flow_step_index < item.maxStep)
          .map((item) => ({
            ...item,
            todo: { ...item.todo, subtodos: (item.todo.subtodos ?? []).filter((s: any) => s.flow_step_index < item.maxStep) },
          }));
      }

      if (fs.sortBy !== 'manual') {
        list = [...list].sort((a, b) => {
          const ta = a.todo, tb = b.todo;
          switch (fs.sortBy) {
            case 'due_asc':   return (ta.due_date ?? Infinity) - (tb.due_date ?? Infinity);
            case 'due_desc':
              if (!ta.due_date && !tb.due_date) return 0;
              if (!ta.due_date) return 1; if (!tb.due_date) return -1;
              return tb.due_date - ta.due_date;
            case 'title_asc':  return ta.title.localeCompare(tb.title);
            case 'title_desc': return tb.title.localeCompare(ta.title);
            case 'step':       return ta.flow_step_index - tb.flow_step_index;
            default: return 0;
          }
        });
      }

      const steps = this.filterSteps();
      if (steps.length > 0) list = list.filter((item) => steps.includes(item.todo.flow_step_index));

      const pris = this.filterPriorities();
      if (pris.length > 0) list = list.filter((item) => pris.includes(item.todo.priority ?? 0));

      this.visibleTodos.set(list);

      // Recount on the visible set (before priority/step filters to show totals)
      const base = this.allTodos().filter((item) =>
        item.todo.due_date != null && item.todo.due_date <= eod &&
        (selected.length === 0 || selected.includes(item.inboxId)) &&
        (!this.hideDone() || item.todo.flow_step_index < item.maxStep),
      );
      this.overdueCount.set(base.filter((i) => i.todo.due_date < sod).length);
      this.todayCount.set(base.filter((i) => i.todo.due_date >= sod && i.todo.due_date <= eod).length);
    });
  }

  ngOnInit(): void {
    this.refreshSub = this.notifSvc.refresh$.subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  toggleHideDone(): void {
    const next = !this.hideDone();
    this.hideDone.set(next);
    this.settings.set('today.hideDone', next ? '1' : '0');
  }

  toggleInbox(id: string): void {
    this.selectedInboxIds.update((sel) => sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);
  }

  toggleStep(index: number): void {
    this.filterSteps.update((s) => s.includes(index) ? [] : [index]);
  }

  togglePriority(value: number): void {
    this.filterPriorities.update((s) => s.includes(value) ? [] : [value]);
  }

  load(): void {
    this.loading.set(true);
    const inboxes = this.store.inboxes() ?? [];
    const personal$ = this.api.get<any[]>('/inbox').pipe(catchError(() => of([])));
    const team$ = inboxes.map((inbox) =>
      this.api.get<any[]>(`/todos/project/${inbox.id}`).pipe(catchError(() => of([]))),
    );

    forkJoin([personal$, ...team$]).subscribe((results) => {
      const [personalTodos, ...teamResults] = results;
      const tagged: TaggedTodo[] = [
        ...(personalTodos as any[]).map((t) => ({
          todo: t, inboxId: 'personal' as const,
          inboxName: 'My Inbox', inboxColor: 'var(--accent-color)', maxStep: 2,
        })),
        ...inboxes.flatMap((inbox, i) => {
          const steps: any[] = inbox.flow_steps ?? [];
          const maxStep = Math.max(0, steps.length - 1);
          return (teamResults[i] as any[]).map((t) => ({
            todo: t, inboxId: inbox.id as string,
            inboxName: inbox.name as string,
            inboxColor: (inbox.color as string) || 'var(--accent-color)', maxStep,
          }));
        }),
      ];
      this.allTodos.set(tagged);
      this.loading.set(false);
    });
  }

  // ── Task list event handlers ──────────────────────────

  onPromoted(ev: PromotedEvent): void {
    const parentItem = this.allTodos().find((i) => i.todo.id === ev.parentId);
    this.api.patch<any>(`/todos/${ev.sub.id}`, { parentTodoId: null }).subscribe((promoted) => {
      this.allTodos.update((list) => list.map((item) =>
        item.todo.id === ev.parentId
          ? { ...item, todo: { ...item.todo, subtodos: item.todo.subtodos?.filter((s: any) => s.id !== ev.sub.id) } }
          : item,
      ));
      if (parentItem) {
        this.allTodos.update((list) => {
          const next = [...list];
          next.splice(ev.insertIndex, 0, { todo: promoted, inboxId: parentItem.inboxId, inboxName: parentItem.inboxName, inboxColor: parentItem.inboxColor, maxStep: parentItem.maxStep });
          return next;
        });
      }
    });
  }

  onSubtaskReordered(updated: any): void {
    this.allTodos.update((list) => list.map((item) =>
      item.todo.id === updated.id ? { ...item, todo: updated } : item,
    ));
  }

  onSubtaskCreated(ev: { parentId: string; sub: any }): void {
    this.allTodos.update((list) => list.map((item) =>
      item.todo.id === ev.parentId
        ? { ...item, todo: { ...item.todo, subtodos: [...(item.todo.subtodos ?? []), ev.sub] } }
        : item,
    ));
  }

  onSubtaskDropped(ev: SubtaskDroppedEvent): void {
    if (ev.type === 'reattach') {
      this.api.patch<any>(`/todos/${ev.item.id}`, { parentTodoId: ev.newParentId }).subscribe((updated) => {
        this.allTodos.update((list) => {
          let next = list.map((item) =>
            item.todo.id === ev.oldParentId
              ? { ...item, todo: { ...item.todo, subtodos: (item.todo.subtodos ?? []).filter((s: any) => s.id !== ev.item.id) } }
              : item,
          );
          next = next.map((item) => {
            if (item.todo.id !== ev.newParentId) return item;
            const subs = [...(item.todo.subtodos ?? [])];
            subs.splice(ev.currentIndex, 0, updated);
            return { ...item, todo: { ...item.todo, subtodos: subs } };
          });
          return next;
        });
      });
    } else if (ev.type === 'demote') {
      const flatten = ev.subtasksToFlatten ?? [];
      forkJoin([
        this.api.patch<any>(`/todos/${ev.item.id}`, { parentTodoId: ev.newParentId }),
        ...flatten.map((s: any) => this.api.patch<any>(`/todos/${s.id}`, { parentTodoId: ev.newParentId })),
      ]).subscribe(([demoted, ...flatSubs]) => {
        this.allTodos.update((list) => {
          const next = list.filter((item) => item.todo.id !== ev.item.id);
          return next.map((item) => {
            if (item.todo.id !== ev.newParentId) return item;
            const subs = [...(item.todo.subtodos ?? [])];
            subs.splice(ev.currentIndex, 0,
              { ...demoted, parent_todo_id: ev.newParentId },
              ...flatSubs.map((s: any) => ({ ...s, parent_todo_id: ev.newParentId })),
            );
            return { ...item, todo: { ...item.todo, subtodos: subs } };
          });
        });
      });
    }
  }

  openDetail(todo: any): void {
    const ref = this.dialog.open(TodoDialogComponent, {
      width: '640px', maxHeight: '90vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: { mode: 'detail', todo, isInbox: !todo.project_id },
    });
    ref.closed.subscribe((result: any) => {
      if (result === 'deleted') {
        if (todo.project_id) this.store.adjustCounts(todo.project_id, todo.flow_step_index === 0 ? -1 : 0, -1);
        this.allTodos.update((list) => list.filter((i) => i.todo.id !== todo.id));
      } else if (result) {
        if (result.project_id && result.flow_step_index !== todo.flow_step_index) {
          const wasNew = todo.flow_step_index === 0;
          const isNew  = result.flow_step_index === 0;
          if (wasNew && !isNew) this.store.adjustCounts(result.project_id, -1, 0);
          else if (!wasNew && isNew) this.store.adjustCounts(result.project_id, 1, 0);
        }
        this.mergeTodo(result);
      }
    });
  }

  private mergeTodo(updated: any): void {
    this.allTodos.update((list) =>
      list.map((item) => {
        if (item.todo.id === updated.id) return { ...item, todo: { ...item.todo, ...updated } };
        if (item.todo.subtodos?.some((s: any) => s.id === updated.id)) {
          return { ...item, todo: { ...item.todo, subtodos: item.todo.subtodos.map((s: any) => s.id === updated.id ? { ...s, ...updated } : s) } };
        }
        return item;
      }),
    );
  }

  private appendSpawned(spawned: any): void {
    const parent = this.allTodos().find((i) => i.todo.id === spawned.recurrence_parent_id);
    if (!parent) return;
    const wrapped: TaggedTodo = { todo: spawned, inboxId: parent.inboxId, inboxName: parent.inboxName, inboxColor: parent.inboxColor, maxStep: parent.maxStep };
    this.allTodos.update((list) => [...list, wrapped]);
    if (spawned.project_id) this.store.adjustCounts(spawned.project_id, 1, 1);
  }

  advanceTodo(todo: any): void {
    const wasNew = todo.flow_step_index === 0;
    this.api.patch<any>(`/todos/${todo.id}/advance`, {}).subscribe((updated) => {
      const { _spawned, ...t } = updated;
      this.mergeTodo(t);
      if (wasNew && todo.project_id) this.store.adjustCounts(todo.project_id, -1, 0);
      if (_spawned) this.appendSpawned(_spawned);
    });
  }

  completeTodo(todo: any): void {
    const wasNew = todo.flow_step_index === 0;
    this.api.patch<any>(`/todos/${todo.id}/complete`, {}).subscribe((updated) => {
      const { _spawned, ...t } = updated;
      this.mergeTodo(t);
      if (wasNew && todo.project_id) this.store.adjustCounts(todo.project_id, -1, 0);
      if (_spawned) this.appendSpawned(_spawned);
    });
  }

  todoAssigned(updated: any): void {
    const current = this.allTodos().find((i) => i.todo.id === updated.id);
    if (current && updated.flow_step_index === 0 && current.todo.flow_step_index !== 0 && updated.project_id) {
      this.store.adjustCounts(updated.project_id, 1, 0);
    }
    this.mergeTodo(updated);
  }

  deleteTodo(id: string): void {
    this.api.delete(`/todos/${id}`).subscribe(() => {
      this.allTodos.update((list) => list.filter((i) => i.todo.id !== id));
    });
  }
}
