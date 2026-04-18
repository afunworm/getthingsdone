import {
  Component, Input, Output, EventEmitter, inject, signal, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { PriorityService } from '../../../core/services/priority.service';

@Component({
  selector: 'app-priority-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (compact) {
      <div class="pri-wrap">
        <button
          class="trigger-btn"
          [class.trigger-active]="todo.priority > 0"
          [style.color]="todo.priority > 0 ? prioritySvc.getColor(todo.priority) : ''"
          (click)="toggle($event)"
          [title]="todo.priority > 0 ? prioritySvc.getLabel(todo.priority) : 'Set priority'"
        >
          <span class="material-icons" style="font-size:14px">priority_high</span>
        </button>
        @if (open()) {
          <div class="pri-dropdown compact-dropdown" (click)="$event.stopPropagation()">
            <p class="dropdown-title">Priority</p>
            <button class="pri-opt" [class.pri-opt-active]="todo.priority === 0" (click)="set(0)">
              <span class="material-icons" style="font-size:13px;color:var(--text-muted)">priority_high</span>
              <span>None</span>
              @if (todo.priority === 0) {
                <span class="material-icons" style="font-size:13px;margin-left:auto">check</span>
              }
            </button>
            @for (lvl of prioritySvc.levels(); track lvl.value) {
              <button class="pri-opt" [class.pri-opt-active]="todo.priority === lvl.value" (click)="set(lvl.value)">
                <span class="material-icons" style="font-size:13px" [style.color]="lvl.color">priority_high</span>
                <span [style.color]="lvl.color">{{ lvl.label }}</span>
                @if (todo.priority === lvl.value) {
                  <span class="material-icons" style="font-size:13px;margin-left:auto;color:var(--text-secondary)">check</span>
                }
              </button>
            }
          </div>
        }
      </div>
    } @else {
      <div class="pri-wrap">
        <button
          class="meta-chip"
          [class.meta-pri-active]="todo.priority > 0"
          [style.color]="todo.priority > 0 ? prioritySvc.getColor(todo.priority) : ''"
          [style.border-color]="todo.priority > 0 ? prioritySvc.getColor(todo.priority) + '55' : ''"
          (click)="toggle($event)"
          title="Set priority"
        >
          <span class="material-icons" style="font-size:12px">priority_high</span>
          {{ todo.priority > 0 ? prioritySvc.getLabel(todo.priority) : 'Priority' }}
        </button>
        @if (open()) {
          <div class="pri-backdrop" (click)="open.set(false)"></div>
          <div class="pri-dropdown" (click)="$event.stopPropagation()">
            <button class="pri-opt" [class.pri-opt-active]="todo.priority === 0" (click)="set(0)">
              <span class="material-icons" style="font-size:13px;color:var(--text-muted)">priority_high</span>
              None
              @if (todo.priority === 0) {
                <span class="material-icons" style="font-size:13px;margin-left:auto">check</span>
              }
            </button>
            @for (lvl of prioritySvc.levels(); track lvl.value) {
              <button class="pri-opt" [class.pri-opt-active]="todo.priority === lvl.value" (click)="set(lvl.value)">
                <span class="material-icons" style="font-size:13px" [style.color]="lvl.color">priority_high</span>
                {{ lvl.label }}
                @if (todo.priority === lvl.value) {
                  <span class="material-icons" style="font-size:13px;margin-left:auto;color:var(--text-secondary)">check</span>
                }
              </button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .pri-wrap { position: relative; }

    .trigger-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 5px; border: 0;
      background: transparent; color: var(--text-muted);
      cursor: pointer; transition: background 120ms, color 120ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    .trigger-active { /* color set by style binding */ }

    .meta-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 9px; border-radius: 20px;
      font-size: 11px; font-weight: 500; cursor: pointer;
      border: 1px solid var(--surface-border);
      background: var(--surface-hover); color: var(--text-secondary);
      transition: border-color 100ms, color 100ms; font-family: inherit;
      &:hover { border-color: var(--accent-color); color: var(--accent-color); }
    }

    .meta-pri-active { font-weight: 600; }

    .pri-backdrop { position: fixed; inset: 0; z-index: 50; }

    .pri-dropdown {
      position: absolute; top: calc(100% + 4px); left: 0;
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 8px; box-shadow: var(--shadow-md);
      padding: 4px; min-width: 130px; z-index: 51;
      display: flex; flex-direction: column; gap: 1px;
    }

    .compact-dropdown { right: 0; left: auto; z-index: 100; }

    .dropdown-title {
      margin: 0 0 4px; padding: 0 4px;
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .4px; color: var(--text-muted);
    }

    .pri-opt {
      display: flex; align-items: center; gap: 7px;
      width: 100%; padding: 5px 10px; border: 0; border-radius: 5px;
      background: transparent; cursor: pointer; text-align: left;
      font-family: inherit; font-size: 12px; color: var(--text-secondary);
      transition: background 80ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
      &.pri-opt-active { background: var(--surface-hover); color: var(--text-primary); font-weight: 500; }
    }
  `],
})
export class PriorityPickerComponent {
  private api = inject(ApiService);
  prioritySvc  = inject(PriorityService);

  @Input({ required: true }) todo: any;
  @Input() compact = true;
  @Output() updated = new EventEmitter<any>();

  open = signal(false);

  @HostListener('document:click')
  onDocClick(): void {
    this.open.set(false);
  }

  toggle(e: MouseEvent): void {
    e.stopPropagation();
    this.open.update(v => !v);
  }

  set(priority: number): void {
    this.todo = { ...this.todo, priority };
    this.open.set(false);
    this.api.patch<any>(`/todos/${this.todo.id}`, { priority }).subscribe(updated => {
      this.updated.emit({ ...this.todo, ...updated });
    });
  }
}
