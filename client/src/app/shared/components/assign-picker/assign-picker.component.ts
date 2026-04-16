import {
  Component, Input, Output, EventEmitter, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { AssignDialogComponent, Assignees } from '../assign-dialog/assign-dialog.component';

@Component({
  selector: 'app-assign-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (compact) {
      <button
        class="trigger-btn"
        [class.trigger-assigned]="isAssigned"
        (click)="openAssign()"
        title="Assign task"
      >
        <span class="material-icons" style="font-size:15px">person</span>
      </button>
    } @else {
      <button
        class="meta-chip"
        [class.meta-assigned]="isAssigned"
        (click)="openAssign()"
      >
        <span class="material-icons" style="font-size:12px">person</span>
        {{ label }}
      </button>
    }
  `,
  styles: [`
    :host { display: contents; }

    .trigger-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 5px; border: 0;
      background: transparent; color: var(--text-muted);
      cursor: pointer; transition: background 120ms, color 120ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    .trigger-assigned { color: var(--accent-color) !important; }

    .meta-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 9px; border-radius: 20px;
      font-size: 11px; font-weight: 500; cursor: pointer;
      border: 1px solid var(--surface-border);
      background: var(--surface-hover); color: var(--text-secondary);
      transition: border-color 100ms, color 100ms; font-family: inherit;
      &:hover { border-color: var(--accent-color); color: var(--accent-color); }
    }

    .meta-assigned {
      background: color-mix(in srgb, var(--accent-color) 10%, transparent);
      border-color: var(--accent-color); color: var(--accent-color);
    }
  `],
})
export class AssignPickerComponent {
  private dialog = inject(Dialog);

  @Input({ required: true }) todo: any;
  @Input() compact = true;
  @Output() updated = new EventEmitter<any>();

  get isAssigned(): boolean {
    const a = this.todo.assignees as Assignees | undefined;
    return !!a && (a.users.length + a.teams.length) > 0;
  }

  get label(): string {
    const a = this.todo.assignees as Assignees | undefined;
    if (!a) return 'Assign';
    const all = [
      ...(a.users ?? []).map((u: any) => u.name.split(' ')[0]),
      ...(a.teams ?? []).map((t: any) => t.name),
    ];
    if (all.length === 0) return 'Assign';
    if (all.length === 1) return all[0];
    if (all.length === 2) return all.join(', ');
    return `${all[0]}, +${all.length - 1} more`;
  }

  openAssign(): void {
    const ref = this.dialog.open(AssignDialogComponent, {
      width: '580px',
      maxHeight: '70vh',
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop',
      panelClass: 'app-dialog-panel',
      data: {
        todoId: this.todo.id,
        assignees: this.todo.assignees ?? { users: [], teams: [] },
        projectId: this.todo.project_id ?? null,
      },
    });
    ref.closed.subscribe((result: any) => {
      if (result !== undefined) {
        this.updated.emit({ ...this.todo, assignees: result });
      }
    });
  }
}
