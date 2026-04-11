import {
  Component, OnInit, Input, Output, EventEmitter, signal, ViewChild, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

export interface AutocompleteResult {
  id: string;
  name: string;
  email?: string;
  isTeam: boolean;
}

@Component({
  selector: 'app-autocomplete-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ac-wrap" [class.ac-committed]="committed()">
      <input
        #inputEl
        class="field-input ac-input"
        [(ngModel)]="query"
        (ngModelChange)="onInput()"
        (keydown)="onKeydown($event)"
        [placeholder]="placeholder"
        autocomplete="off"
      />
      @if (committed()) {
        <span class="ac-commit-icon material-icons">check</span>
      }

      @if (results().length > 0) {
        <div class="ac-dropdown" #dropdownEl>
          @for (r of results(); track r.id; let i = $index) {
            <button
              class="ac-option"
              [class.active]="i === activeIndex()"
              (mousedown)="commit(r)"
            >
              <span class="ac-avatar" [style.background]="r.isTeam ? '#7b1fa2' : 'var(--accent-color)'">
                {{ r.name[0].toUpperCase() }}
              </span>
              <div class="ac-info">
                <span class="ac-name">{{ r.name }}</span>
                @if (r.email) { <span class="ac-sub">{{ r.email }}</span> }
                @if (r.isTeam) { <span class="ac-sub">Team</span> }
              </div>
              <span class="ac-hint">↵ select</span>
            </button>
          }
        </div>
      }

      @if (query && !results().length && !committed() && loaded()) {
        <div class="ac-dropdown">
          <div class="ac-empty">No matches found</div>
        </div>
      }

      @if (committed()) {
        <div class="ac-confirm-hint">Press Enter to add</div>
      }
    </div>
  `,
  styles: [`
    .ac-wrap { position: relative; width: 100%; }

    .ac-input { padding-right: 28px !important; }

    .ac-commit-icon {
      position: absolute; right: 7px; top: 50%; transform: translateY(-50%);
      font-size: 15px; color: #16a34a; pointer-events: none;
    }
    .ac-committed .ac-input {
      border-color: #16a34a !important;
      background: color-mix(in srgb, #16a34a 5%, transparent) !important;
    }

    .ac-confirm-hint {
      font-size: 11px; color: #16a34a; margin-top: 3px; padding-left: 2px;
    }

    .ac-dropdown {
      position: absolute; left: 0; right: 0; bottom: calc(100% + 3px);
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 8px; box-shadow: var(--shadow-md);
      max-height: 220px; overflow-y: auto; z-index: 400; padding: 4px;
    }

    .ac-option {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 6px 8px; border: 0; border-radius: 5px;
      background: transparent; cursor: pointer; text-align: left;
      transition: background 80ms;
      &:hover, &.active { background: var(--surface-hover); }
    }
    .ac-avatar {
      width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 600;
    }
    .ac-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .ac-name {
      font-size: 13px; color: var(--text-primary); font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ac-sub { font-size: 11px; color: var(--text-muted); }
    .ac-hint { font-size: 10px; color: var(--text-muted); flex-shrink: 0; opacity: 0;
      .ac-option.active & { opacity: 1; }
    }
    .ac-empty { padding: 8px 12px; font-size: 13px; color: var(--text-muted); }
  `],
})
export class AutocompleteSearchComponent implements OnInit {
  @Input() placeholder = 'Search...';
  @Input() includeTeams = false;
  @Input() excludeIds: string[] = [];
  @Output() selected = new EventEmitter<AutocompleteResult>();

  @ViewChild('dropdownEl') dropdownEl?: ElementRef<HTMLElement>;

  constructor(private api: ApiService) {}

  query = '';
  results = signal<AutocompleteResult[]>([]);
  activeIndex = signal(-1);
  committed = signal<AutocompleteResult | null>(null);
  loaded = signal(false);

  private allUsers: any[] = [];
  private allTeams: any[] = [];

  ngOnInit(): void {
    this.api.get<any[]>('/users').subscribe((u) => { this.allUsers = u; this.loaded.set(true); });
    if (this.includeTeams) {
      this.api.get<any[]>('/teams').subscribe((t) => { this.allTeams = t; });
    }
  }

  onInput(): void {
    // Typing clears any committed selection
    this.committed.set(null);
    this.activeIndex.set(-1);

    const q = this.query.toLowerCase().trim();
    if (!q) { this.results.set([]); return; }

    const excluded = new Set(this.excludeIds);
    const maxUsers = this.includeTeams ? 6 : 8;

    const users: AutocompleteResult[] = this.allUsers
      .filter((u) => !excluded.has(u.id))
      .filter((u) => u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      .slice(0, maxUsers)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, isTeam: false }));

    const teams: AutocompleteResult[] = this.includeTeams
      ? this.allTeams
          .filter((t) => !excluded.has(t.id))
          .filter((t) => t.name.toLowerCase().includes(q))
          .slice(0, 4)
          .map((t) => ({ id: t.id, name: t.name, isTeam: true }))
      : [];

    this.results.set([...users, ...teams]);
  }

  onKeydown(e: KeyboardEvent): void {
    const list = this.results();

    // Dropdown is open
    if (list.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeIndex.update((i) => Math.min(i + 1, list.length - 1));
        this.scrollActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeIndex.update((i) => Math.max(i - 1, 0));
        this.scrollActive();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const idx = this.activeIndex();
        if (idx >= 0) this.commit(list[idx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.results.set([]);
        this.activeIndex.set(-1);
      }
      return;
    }

    // Dropdown is closed — second Enter confirms the committed item
    if (e.key === 'Enter') {
      e.preventDefault();
      const c = this.committed();
      if (c) {
        this.selected.emit(c);
        this.query = '';
        this.committed.set(null);
      }
    }
  }

  /** Fill the input with the chosen result and close the dropdown. Does NOT emit yet. */
  commit(r: AutocompleteResult): void {
    this.query = r.name;
    this.committed.set(r);
    this.results.set([]);
    this.activeIndex.set(-1);
  }

  private scrollActive(): void {
    setTimeout(() => {
      this.dropdownEl?.nativeElement
        .querySelectorAll('.ac-option')[this.activeIndex()]
        ?.scrollIntoView({ block: 'nearest' });
    });
  }
}
