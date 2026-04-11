import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy,
  ElementRef, ViewChild, ChangeDetectorRef, NgZone, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';

interface PopupState {
  items: { id: string; name: string }[];
  selectedIndex: number;
  top: number;
  left: number;
  command: (props: { id: string; label: string }) => void;
}

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rte-wrap">
      <div #editorEl></div>
      @if (popup()) {
        <div class="mention-popup"
             [style.top.px]="popup()!.top"
             [style.left.px]="popup()!.left">
          @for (user of popup()!.items; track user.id; let i = $index) {
            <button class="mention-item" [class.active]="i === popup()!.selectedIndex"
              (mousedown)="$event.preventDefault(); pick(user)">
              {{ user.name }}
            </button>
          }
          @if (!popup()!.items.length) {
            <div class="mention-item mention-empty">No matches</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .rte-wrap { position: relative; }

    :host ::ng-deep .tiptap {
      outline: none;
      min-height: 58px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-primary);
    }

    /* Placeholder */
    :host ::ng-deep .tiptap p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      color: var(--text-muted);
      pointer-events: none;
      height: 0;
    }

    /* Mention chip */
    :host ::ng-deep .mention {
      display: inline-block;
      background: color-mix(in srgb, var(--accent-color) 12%, transparent);
      color: var(--accent-color);
      border-radius: 4px;
      padding: 0 4px;
      font-weight: 500;
      font-size: 12px;
    }

    /* Basic prose */
    :host ::ng-deep .tiptap p { margin: 0 0 4px; }
    :host ::ng-deep .tiptap p:last-child { margin-bottom: 0; }
    :host ::ng-deep .tiptap strong { font-weight: 600; }
    :host ::ng-deep .tiptap em { font-style: italic; }
    :host ::ng-deep .tiptap ul,
    :host ::ng-deep .tiptap ol { padding-left: 20px; margin: 4px 0; }
    :host ::ng-deep .tiptap li { margin: 2px 0; }
    :host ::ng-deep .tiptap code {
      background: var(--surface-hover); border-radius: 3px;
      padding: 1px 4px; font-size: 12px; font-family: monospace;
    }

    /* Mention popup */
    .mention-popup {
      position: fixed; z-index: 9999;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,.12);
      overflow: hidden;
      min-width: 160px;
      max-height: 200px;
      overflow-y: auto;
    }
    .mention-item {
      display: block; width: 100%;
      padding: 7px 12px; border: 0;
      background: transparent;
      font-family: inherit; font-size: 13px;
      color: var(--text-primary);
      text-align: left; cursor: pointer;
    }
    .mention-item:hover,
    .mention-item.active { background: var(--surface-hover); }
    .mention-empty { cursor: default; color: var(--text-muted); font-size: 12px; }
  `],
})
export class RichTextEditorComponent implements OnInit, OnDestroy {
  @Input() users: { id: string; name: string }[] = [];
  @Input() placeholder = 'Add a comment…';
  @Output() htmlChange = new EventEmitter<string>();

  @ViewChild('editorEl', { static: true }) editorEl!: ElementRef<HTMLDivElement>;

  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  editor!: Editor;
  popup = signal<PopupState | null>(null);

  ngOnInit() {
    // Capture refs for use inside Tiptap callbacks (outside Angular zone)
    const self = this;

    this.editor = new Editor({
      element: this.editorEl.nativeElement,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: this.placeholder }),
        Mention.configure({
          HTMLAttributes: { class: 'mention' },
          suggestion: {
            items: ({ query }) =>
              self.users
                .filter(u => u.name.toLowerCase().includes(query.toLowerCase()))
                .slice(0, 8),

            render: () => ({
              onStart: (props) => {
                const rect = props.clientRect?.();
                self.zone.run(() => {
                  self.popup.set({
                    items: props.items as { id: string; name: string }[],
                    selectedIndex: 0,
                    top: rect ? rect.bottom + 4 : 0,
                    left: rect ? rect.left : 0,
                    command: props.command,
                  });
                });
              },

              onUpdate: (props) => {
                const rect = props.clientRect?.();
                self.zone.run(() => {
                  self.popup.update(s => s ? {
                    ...s,
                    items: props.items as { id: string; name: string }[],
                    selectedIndex: 0,
                    top: rect ? rect.bottom + 4 : s.top,
                    left: rect ? rect.left : s.left,
                    command: props.command,
                  } : null);
                });
              },

              onExit: () => {
                self.zone.run(() => self.popup.set(null));
              },

              onKeyDown: ({ event }) => {
                const p = self.popup();
                if (!p || !p.items.length) return false;
                if (event.key === 'ArrowDown') {
                  self.zone.run(() =>
                    self.popup.update(s => s
                      ? { ...s, selectedIndex: (s.selectedIndex + 1) % s.items.length }
                      : null)
                  );
                  return true;
                }
                if (event.key === 'ArrowUp') {
                  self.zone.run(() =>
                    self.popup.update(s => s
                      ? { ...s, selectedIndex: (s.selectedIndex - 1 + s.items.length) % s.items.length }
                      : null)
                  );
                  return true;
                }
                if (event.key === 'Enter') {
                  const item = p.items[p.selectedIndex];
                  if (item) self.zone.run(() => self.pick(item));
                  return true;
                }
                if (event.key === 'Escape') {
                  self.zone.run(() => self.popup.set(null));
                  return true;
                }
                return false;
              },
            }),
          },
        }),
      ],

      onUpdate: ({ editor }) => {
        const html = editor.isEmpty ? '' : editor.getHTML();
        self.zone.run(() => self.htmlChange.emit(html));
      },
    });
  }

  pick(user: { id: string; name: string }) {
    const p = this.popup();
    if (!p) return;
    p.command({ id: user.id, label: user.name });
    this.popup.set(null);
  }

  clear() {
    this.editor?.commands.clearContent(true);
    this.popup.set(null);
  }

  focus() {
    this.editor?.commands.focus();
  }

  ngOnDestroy() {
    this.editor?.destroy();
  }
}
