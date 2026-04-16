import { Component, inject, signal } from '@angular/core';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { DueDateSectionComponent } from '../due-date-section/due-date-section.component';
import { RemindersSectionComponent } from '../reminders-section/reminders-section.component';

@Component({
  selector: 'app-due-date-reminder-dialog',
  standalone: true,
  imports: [DueDateSectionComponent, RemindersSectionComponent],
  template: `
    <div class="dialog-card">
      <div class="dialog-header">
        <span class="dialog-title">Due Date &amp; Reminders</span>
        <button class="btn-icon" (click)="close()">
          <span class="material-icons" style="font-size:16px">close</span>
        </button>
      </div>
      <div class="dialog-body">
        <app-due-date-section
          [todo]="todo()"
          (updated)="onDueDateUpdated($event)"
          (dueDateDraftChanged)="pendingDueDateStr.set($event)"
        ></app-due-date-section>
        <app-reminders-section
          [todo]="todo()"
          [pendingDueDate]="pendingDueDateStr()"
          (todoChanged)="onTodoChanged($event)"
        ></app-reminders-section>
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
      flex-shrink: 0;
    }

    .dialog-title { font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1; }

    .btn-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 6px; border: 0;
      background: transparent; color: var(--text-muted); cursor: pointer;
      transition: background 120ms, color 120ms;
      &:hover { background: var(--surface-hover); color: var(--text-primary); }
    }

    .dialog-body {
      padding: 0 14px; display: flex; flex-direction: column;
      overflow-y: auto; flex: 1;
    }
  `],
})
export class DueDateReminderDialogComponent {
  private dialogRef = inject(DialogRef<any>);
  private data: any  = inject(DIALOG_DATA);

  todo             = signal({ ...this.data.todo });
  pendingDueDateStr = signal('');

  onDueDateUpdated(updated: any): void {
    this.todo.set({ ...this.todo(), ...updated });
  }

  onTodoChanged(partial: Partial<any>): void {
    this.todo.set({ ...this.todo(), ...partial });
  }

  close(): void {
    this.dialogRef.close(this.todo());
  }
}
