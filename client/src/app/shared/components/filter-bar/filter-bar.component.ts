import {
  Component, Input, Output, EventEmitter, inject, signal, effect, ViewChild, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../core/services/settings.service';

export interface FilterSortState {
  assignedByMe: boolean;
  overdue: boolean;
  comingUp: boolean;
  recurring: boolean;
  sortBy: 'manual' | 'due_asc' | 'due_desc' | 'title_asc' | 'title_desc' | 'step';
}

export interface SavedView {
  id: string;
  name: string;
  state: FilterSortState;
}

export const DEFAULT_FILTER_STATE: FilterSortState = {
  assignedByMe: false, overdue: false, comingUp: false, recurring: false, sortBy: 'manual',
};

export function isFilterActive(s: FilterSortState): boolean {
  return s.assignedByMe || s.overdue || s.comingUp || s.recurring || s.sortBy !== 'manual';
}

const SORT_OPTIONS: { value: FilterSortState['sortBy']; label: string }[] = [
  { value: 'manual',      label: 'Manual (drag order)' },
  { value: 'due_asc',     label: 'Due date ↑' },
  { value: 'due_desc',    label: 'Due date ↓' },
  { value: 'title_asc',   label: 'Title A–Z' },
  { value: 'title_desc',  label: 'Title Z–A' },
  { value: 'step',        label: 'Step order' },
];

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filter-bar">
      <!-- Filter chips -->
      <button class="chip" [class.active]="state().assignedByMe" (click)="toggle('assignedByMe')" title="Tasks I created and assigned to others">
        <span class="material-icons" style="font-size:12px">assignment_ind</span>Created by me
      </button>
      <button class="chip" [class.active]="state().overdue" (click)="toggle('overdue')" title="Past due date, not completed">
        <span class="material-icons" style="font-size:12px">schedule</span>Overdue
      </button>
      <button class="chip" [class.active]="state().comingUp" (click)="toggle('comingUp')" title="Has a due date that hasn't passed yet">
        <span class="material-icons" style="font-size:12px">event_available</span>Coming Up
      </button>
      <button class="chip" [class.active]="state().recurring" (click)="toggle('recurring')" title="Recurring tasks only">
        <span class="material-icons" style="font-size:12px">repeat</span>Recurring
      </button>

      <!-- Saved view quick-access buttons -->
      @if (views().length) {
        <div class="bar-sep"></div>
        @for (view of views(); track view.id) {
          <button class="view-chip" [class.active]="activeViewId() === view.id" (click)="applyView(view)">
            <span class="material-icons" style="font-size:11px">bookmark</span>
            {{ view.name }}
            <span class="view-remove" (click)="$event.stopPropagation(); removeView(view.id)" title="Remove">×</span>
          </button>
        }
      }

      <div class="bar-spacer"></div>

      <!-- Sort picker -->
      <div class="sort-wrap">
        @if (sortOpen()) {
          <div class="sort-backdrop" (click)="sortOpen.set(false)"></div>
        }
        <button class="sort-btn" [class.sort-active]="state().sortBy !== 'manual'" (click)="sortOpen.set(!sortOpen())">
          <span class="material-icons" style="font-size:13px">sort</span>
          <span class="sort-label">{{ sortLabel(state().sortBy) }}</span>
          <span class="material-icons" style="font-size:15px">arrow_drop_down</span>
        </button>
        @if (sortOpen()) {
          <div class="sort-menu">
            @for (opt of SORT_OPTIONS; track opt.value) {
              <button class="sort-opt" [class.active]="state().sortBy === opt.value" (click)="setSort(opt.value)">
                <span class="material-icons" style="font-size:13px;opacity:{{ state().sortBy === opt.value ? 1 : 0 }}">check</span>
                {{ opt.label }}
              </button>
            }
          </div>
        }
      </div>

      <!-- Save view -->
      @if (saving()) {
        <input #nameInput class="view-name-input" [(ngModel)]="viewName"
          placeholder="View name..."
          (keydown.enter)="confirmSave()"
          (keydown.escape)="cancelSave()" />
        <button class="btn-icon-sm" (click)="confirmSave()" title="Save">
          <span class="material-icons" style="font-size:14px">check</span>
        </button>
        <button class="btn-icon-sm" (click)="cancelSave()" title="Cancel">
          <span class="material-icons" style="font-size:14px">close</span>
        </button>
      } @else {
        <button class="btn-save-view" (click)="startSave()"
          [disabled]="!isActive(state())"
          [title]="isActive(state()) ? 'Save current filters as a view' : 'Apply filters first'">
          <span class="material-icons" style="font-size:14px">bookmark_add</span>
        </button>
      }

      <!-- Clear -->
      @if (isActive(state())) {
        <button class="btn-clear" (click)="clear()" title="Clear all filters and sort">
          <span class="material-icons" style="font-size:13px">filter_alt_off</span>Clear
        </button>
      }
    </div>
  `,
  styles: [`
    .filter-bar {
      display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
      margin-bottom: 8px;
    }

    /* Filter chips */
    .chip {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 10px; border-radius: 20px;
      border: 1px solid var(--surface-border);
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500;
      color: var(--text-secondary); transition: all 120ms; white-space: nowrap;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.active {
        background: color-mix(in srgb, var(--accent-color) 12%, transparent);
        color: var(--accent-color); border-color: var(--accent-color); font-weight: 600;
      }
    }

    /* Separator between filter chips and saved views */
    .bar-sep {
      width: 1px; height: 14px; background: var(--surface-border); margin: 0 2px; flex-shrink: 0;
    }

    .bar-spacer { flex: 1; min-width: 8px; }

    /* Saved view chips */
    .view-chip {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 8px; border-radius: 20px;
      border: 1px solid var(--accent-color);
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500;
      color: var(--accent-color); transition: all 120ms; white-space: nowrap;
      &.active { background: color-mix(in srgb, var(--accent-color) 12%, transparent); }
      &:hover { background: color-mix(in srgb, var(--accent-color) 8%, transparent); }
    }
    .view-remove {
      margin-left: 1px; font-size: 14px; line-height: 1; opacity: .6;
      &:hover { opacity: 1; }
    }

    /* Sort */
    .sort-wrap { position: relative; }
    .sort-btn {
      display: inline-flex; align-items: center; gap: 2px;
      padding: 3px 8px; border-radius: 20px;
      border: 1px solid var(--surface-border);
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500;
      color: var(--text-secondary); transition: all 120ms; white-space: nowrap;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.sort-active { color: var(--accent-color); border-color: var(--accent-color); }
    }
    .sort-label { max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
    .sort-backdrop { position: fixed; inset: 0; z-index: 50; }
    .sort-menu {
      position: absolute; top: calc(100% + 4px); right: 0;
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 8px; box-shadow: var(--shadow-md);
      padding: 4px; min-width: 170px; z-index: 51;
    }
    .sort-opt {
      display: flex; align-items: center; gap: 6px;
      width: 100%; padding: 6px 10px; border: 0;
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 12px; color: var(--text-secondary);
      text-align: left; border-radius: 5px; transition: background 100ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.active { color: var(--accent-color); font-weight: 500; }
    }

    /* Save view */
    .btn-save-view {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 20px;
      border: 1px solid var(--surface-border);
      background: transparent; cursor: pointer; color: var(--text-muted);
      transition: all 120ms;
      &:hover:not(:disabled) { color: var(--accent-color); border-color: var(--accent-color); }
      &:disabled { opacity: .35; cursor: default; }
    }
    .view-name-input {
      height: 26px; padding: 0 10px; border-radius: 20px;
      border: 1px solid var(--accent-color); background: var(--surface-bg);
      font-family: inherit; font-size: 11px; color: var(--text-primary);
      outline: none; width: 130px;
    }
    .btn-icon-sm {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 5px; border: 0;
      background: transparent; cursor: pointer; color: var(--text-muted);
      transition: background 120ms, color 120ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    /* Clear */
    .btn-clear {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 8px; border-radius: 20px; border: 0;
      background: transparent; cursor: pointer;
      font-family: inherit; font-size: 11px; font-weight: 500;
      color: var(--text-muted); transition: color 120ms;
      &:hover { color: #d32f2f; }
    }
  `],
})
export class FilterBarComponent {
  private settings = inject(SettingsService);

  @Input({ required: true }) settingsKey!: string;
  @Input({ required: true }) userId!: string;
  @Output() stateChange = new EventEmitter<FilterSortState>();

  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  readonly SORT_OPTIONS = SORT_OPTIONS;
  readonly isActive = isFilterActive;

  state        = signal<FilterSortState>(DEFAULT_FILTER_STATE);
  views        = signal<SavedView[]>([]);
  activeViewId = signal<string | null>(null);
  sortOpen     = signal(false);
  saving       = signal(false);
  viewName     = '';

  constructor() {
    // Load persisted state once settings are ready
    effect(() => {
      if (this.settings.loaded() && this.settingsKey) {
        const stateJson = this.settings.get(`${this.settingsKey}.filterState`);
        const viewsJson = this.settings.get(`${this.settingsKey}.savedViews`);
        const loaded = stateJson ? { ...DEFAULT_FILTER_STATE, ...JSON.parse(stateJson) } : DEFAULT_FILTER_STATE;
        this.state.set(loaded);
        this.views.set(viewsJson ? JSON.parse(viewsJson) : []);
        this.stateChange.emit(loaded);
      }
    });
  }

  private persist(): void {
    this.settings.set(`${this.settingsKey}.filterState`, JSON.stringify(this.state()));
    this.stateChange.emit(this.state());
  }

  toggle(key: 'assignedByMe' | 'overdue' | 'comingUp' | 'recurring'): void {
    this.activeViewId.set(null);
    this.state.update((s) => ({ ...s, [key]: !s[key] }));
    this.persist();
  }

  setSort(value: FilterSortState['sortBy']): void {
    this.activeViewId.set(null);
    this.sortOpen.set(false);
    this.state.update((s) => ({ ...s, sortBy: value }));
    this.persist();
  }

  sortLabel(value: FilterSortState['sortBy']): string {
    return SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Manual';
  }

  clear(): void {
    this.activeViewId.set(null);
    this.state.set(DEFAULT_FILTER_STATE);
    this.persist();
  }

  startSave(): void {
    this.viewName = '';
    this.saving.set(true);
    setTimeout(() => this.nameInput?.nativeElement.focus(), 30);
  }

  cancelSave(): void {
    this.saving.set(false);
    this.viewName = '';
  }

  confirmSave(): void {
    const name = this.viewName.trim();
    if (!name) return;
    const view: SavedView = { id: crypto.randomUUID(), name, state: { ...this.state() } };
    this.views.update((v) => [...v, view]);
    this.activeViewId.set(view.id);
    this.saving.set(false);
    this.viewName = '';
    this.settings.set(`${this.settingsKey}.savedViews`, JSON.stringify(this.views()));
  }

  applyView(view: SavedView): void {
    this.activeViewId.set(view.id);
    this.state.set({ ...view.state });
    this.persist();
  }

  removeView(id: string): void {
    this.views.update((v) => v.filter((x) => x.id !== id));
    if (this.activeViewId() === id) this.activeViewId.set(null);
    this.settings.set(`${this.settingsKey}.savedViews`, JSON.stringify(this.views()));
  }
}
