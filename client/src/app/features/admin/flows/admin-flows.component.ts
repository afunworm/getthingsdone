import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

interface FlowStep { label: string; color: string; bg: string; }

const PRESETS = [
  { bg: '#e3f2fd', color: '#1565c0', name: 'Blue'        },
  { bg: '#fff3e0', color: '#e65100', name: 'Orange'      },
  { bg: '#e8f5e9', color: '#1b5e20', name: 'Green'       },
  { bg: '#f3e5f5', color: '#4a148c', name: 'Purple'      },
  { bg: '#fce4ec', color: '#880e4f', name: 'Pink'        },
  { bg: '#e8eaf6', color: '#283593', name: 'Indigo'      },
  { bg: '#e0f7fa', color: '#00695c', name: 'Teal'        },
  { bg: '#fff8e1', color: '#f57f17', name: 'Amber'       },
  { bg: '#fbe9e7', color: '#bf360c', name: 'Deep Orange' },
  { bg: '#f5f5f5', color: '#424242', name: 'Grey'        },
];

function preset(i: number) { return PRESETS[i % PRESETS.length]; }

@Component({
  selector: 'app-admin-flows',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h2>Flow Templates</h2>
        @if (!creating()) {
          <button class="btn btn-primary" (click)="startCreate()">
            <span class="material-icons" style="font-size:16px">add</span>
            New Flow
          </button>
        }
      </div>

      <!-- ── Create form ─────────────────────────────────────── -->
      @if (creating()) {
        <div class="flow-form">
          <div class="form-header">
            <h3>New Flow Template</h3>
            <button class="btn-icon" (click)="cancelCreate()">
              <span class="material-icons" style="font-size:16px">close</span>
            </button>
          </div>

          <div class="field">
            <label class="field-label">Name</label>
            <input class="field-input" [(ngModel)]="newName" placeholder="e.g. Bug Tracker" />
          </div>

          <div class="steps-editor">
            <span class="field-label">Steps (in order)</span>
            @for (step of newSteps; track $index; let si = $index) {
              <div class="step-row">
                <span class="step-num">{{ si + 1 }}</span>
                <span class="step-preview" [style.background]="step.bg" [style.color]="step.color">
                  {{ step.label || '…' }}
                </span>
                <input class="field-input step-label-input" [(ngModel)]="newSteps[si].label" placeholder="Step name" />
                <div class="color-presets">
                  @for (p of allPresets; track p.name) {
                    <button
                      class="preset-dot"
                      [style.background]="p.bg"
                      [class.selected]="newSteps[si].bg === p.bg"
                      [title]="p.name"
                      (click)="applyPreset(newSteps, si, p)"
                    ></button>
                  }
                </div>
                <button class="btn-icon" (click)="removeNewStep(si)" [disabled]="newSteps.length <= 2" title="Remove">
                  <span class="material-icons" style="font-size:15px">remove_circle_outline</span>
                </button>
              </div>
            }
            <button class="btn btn-ghost" style="align-self:flex-start;margin-top:2px" (click)="addNewStep()">
              <span class="material-icons" style="font-size:15px">add</span> Add step
            </button>
          </div>

          <div class="form-actions">
            <button class="btn btn-ghost" (click)="cancelCreate()">Cancel</button>
            <button class="btn btn-primary" [disabled]="!newName.trim()" (click)="createFlow()">Save</button>
          </div>
        </div>
      }

      <!-- ── Flow list ───────────────────────────────────────── -->
      <div class="flows-list">
        @for (flow of flows(); track flow.id) {
          <div class="flow-card">

            @if (editingId() === flow.id) {
              <!-- Edit mode -->
              <div class="form-header">
                <h3>Edit: {{ flow.name }}</h3>
                <button class="btn-icon" (click)="cancelEdit()">
                  <span class="material-icons" style="font-size:16px">close</span>
                </button>
              </div>

              <div class="field" style="margin-bottom:8px">
                <label class="field-label">Name</label>
                <input class="field-input" [(ngModel)]="editName" />
              </div>

              <div class="steps-editor">
                <span class="field-label">Steps (in order)</span>
                @for (step of editSteps; track $index; let si = $index) {
                  <div class="step-row">
                    <span class="step-num">{{ si + 1 }}</span>
                    <span class="step-preview" [style.background]="step.bg" [style.color]="step.color">
                      {{ step.label || '…' }}
                    </span>
                    <input class="field-input step-label-input" [(ngModel)]="editSteps[si].label" placeholder="Step name" />
                    <div class="color-presets">
                      @for (p of allPresets; track p.name) {
                        <button
                          class="preset-dot"
                          [style.background]="p.bg"
                          [class.selected]="editSteps[si].bg === p.bg"
                          [title]="p.name"
                          (click)="applyPreset(editSteps, si, p)"
                        ></button>
                      }
                    </div>
                    <button class="btn-icon" (click)="removeEditStep(si)" [disabled]="editSteps.length <= 2" title="Remove">
                      <span class="material-icons" style="font-size:15px">remove_circle_outline</span>
                    </button>
                  </div>
                }
                <button class="btn btn-ghost" style="align-self:flex-start;margin-top:2px" (click)="addEditStep()">
                  <span class="material-icons" style="font-size:15px">add</span> Add step
                </button>
              </div>

              <div class="form-actions">
                <button class="btn btn-ghost" (click)="cancelEdit()">Cancel</button>
                <button class="btn btn-primary" [disabled]="!editName.trim()" (click)="saveEdit(flow.id)">Save</button>
              </div>

            } @else {
              <!-- View mode -->
              <div class="flow-header">
                <div class="flow-info">
                  <span class="flow-name">{{ flow.name }}</span>
                  @if (flow.is_default) {
                    <span class="default-badge">Default</span>
                  }
                </div>
                <div class="flow-actions">
                  @if (!flow.is_default) {
                    <button class="btn btn-ghost" style="font-size:12px;padding:3px 8px" (click)="setDefault(flow)">
                      Set default
                    </button>
                  }
                  <button class="btn-icon" (click)="startEdit(flow)" title="Edit">
                    <span class="material-icons" style="font-size:15px">edit</span>
                  </button>
                  <button class="btn-icon" (click)="deleteFlow(flow)" title="Delete">
                    <span class="material-icons" style="font-size:15px;color:#d32f2f">delete</span>
                  </button>
                </div>
              </div>
              <div class="flow-steps-preview">
                @for (step of flow.steps; track $index) {
                  <span class="step-chip" [style.background]="step.bg" [style.color]="step.color">
                    {{ step.label }}
                  </span>
                  @if ($index < flow.steps.length - 1) {
                    <span class="material-icons" style="font-size:13px;color:var(--text-muted)">arrow_forward</span>
                  }
                }
              </div>
            }

          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 20px 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    h2 { margin: 0; font-size: 17px; font-weight: 600; color: var(--text-primary); }
    h3 { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary); }

    .flow-form {
      background: var(--surface-card); border: 1px solid var(--accent-color);
      border-radius: 10px; padding: 14px 16px; margin-bottom: 14px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .form-header { display: flex; justify-content: space-between; align-items: center; }
    .field { display: flex; flex-direction: column; }

    .steps-editor { display: flex; flex-direction: column; gap: 6px; }
    .step-row { display: flex; align-items: center; gap: 7px; flex-wrap: nowrap; }
    .step-num { width: 16px; font-size: 11px; color: var(--text-muted); text-align: right; flex-shrink: 0; }

    .step-preview {
      display: inline-flex; align-items: center;
      padding: 2px 8px; border-radius: 20px;
      font-size: 10px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase;
      white-space: nowrap; min-width: 52px; flex-shrink: 0;
    }

    .step-label-input { flex: 1; min-width: 80px; }

    .color-presets { display: flex; gap: 3px; align-items: center; flex-shrink: 0; }
    .preset-dot {
      width: 15px; height: 15px; border-radius: 50%;
      border: 1.5px solid rgba(0,0,0,.12);
      cursor: pointer; padding: 0; flex-shrink: 0;
      transition: transform 100ms;
      &:hover { transform: scale(1.25); }
      &.selected { border-color: var(--text-primary); transform: scale(1.15); }
    }

    .form-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }

    /* List */
    .flows-list { display: flex; flex-direction: column; gap: 8px; }
    .flow-card {
      background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 10px; padding: 12px 14px;
    }
    .flow-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .flow-info { display: flex; align-items: center; gap: 7px; }
    .flow-name { font-weight: 600; font-size: 14px; color: var(--text-primary); }
    .default-badge {
      padding: 1px 7px; border-radius: 8px; font-size: 11px; font-weight: 700;
      background: color-mix(in srgb, var(--accent-color) 15%, transparent);
      color: var(--accent-color); text-transform: uppercase;
    }
    .flow-actions { display: flex; align-items: center; gap: 4px; }
    .flow-steps-preview { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
    .step-chip {
      display: inline-flex; align-items: center;
      padding: 2px 8px; border-radius: 20px;
      font-size: 11px; font-weight: 600; letter-spacing: .3px; text-transform: uppercase;
    }
  `],
})
export class AdminFlowsComponent implements OnInit {
  private api = inject(ApiService);

  flows = signal<any[]>([]);
  creating = signal(false);
  editingId = signal<string | null>(null);

  newName = '';
  newSteps: FlowStep[] = this.freshSteps();

  editName = '';
  editSteps: FlowStep[] = [];

  readonly allPresets = PRESETS;

  ngOnInit(): void {
    this.api.get<any[]>('/flows').subscribe((f) => this.flows.set(f));
  }

  private freshSteps(): FlowStep[] {
    return [
      { label: 'New',         ...preset(0) },
      { label: 'In Progress', ...preset(1) },
      { label: 'Done',        ...preset(2) },
    ];
  }

  // ── Create ──────────────────────────────────────────────
  startCreate(): void {
    this.editingId.set(null);
    this.creating.set(true);
  }

  cancelCreate(): void {
    this.creating.set(false);
    this.newName = '';
    this.newSteps = this.freshSteps();
  }

  addNewStep(): void {
    this.newSteps = [...this.newSteps, { label: '', ...preset(this.newSteps.length) }];
  }

  removeNewStep(i: number): void {
    this.newSteps = this.newSteps.filter((_, idx) => idx !== i);
  }

  createFlow(): void {
    if (!this.newName.trim()) return;
    this.api.post<any>('/flows', { name: this.newName.trim(), steps: this.newSteps }).subscribe((f) => {
      this.flows.update((list) => [...list, f]);
      this.cancelCreate();
    });
  }

  // ── Edit ────────────────────────────────────────────────
  startEdit(flow: any): void {
    this.creating.set(false);
    this.editName = flow.name;
    this.editSteps = flow.steps.map((s: any) => ({ ...s }));
    this.editingId.set(flow.id);
  }

  cancelEdit(): void { this.editingId.set(null); }

  addEditStep(): void {
    this.editSteps = [...this.editSteps, { label: '', ...preset(this.editSteps.length) }];
  }

  removeEditStep(i: number): void {
    this.editSteps = this.editSteps.filter((_, idx) => idx !== i);
  }

  saveEdit(id: string): void {
    if (!this.editName.trim()) return;
    this.api.patch<any>(`/flows/${id}`, { name: this.editName.trim(), steps: this.editSteps }).subscribe((updated) => {
      this.flows.update((list) => list.map((f) => f.id === id ? updated : f));
      this.cancelEdit();
    });
  }

  // ── Shared ──────────────────────────────────────────────
  applyPreset(steps: FlowStep[], i: number, p: { bg: string; color: string }): void {
    steps[i] = { ...steps[i], bg: p.bg, color: p.color };
    // Force reference update for change detection
    if (steps === this.newSteps) this.newSteps = [...steps];
    else this.editSteps = [...steps];
  }

  setDefault(flow: any): void {
    this.api.patch<any>(`/flows/${flow.id}/default`, {}).subscribe((updated) => {
      this.flows.update((list) => list.map((f) => ({ ...f, is_default: f.id === updated.id })));
    });
  }

  deleteFlow(flow: any): void {
    this.api.delete(`/flows/${flow.id}`).subscribe(() => {
      this.flows.update((list) => list.filter((f) => f.id !== flow.id));
    });
  }
}
