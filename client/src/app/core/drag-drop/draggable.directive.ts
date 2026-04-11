import { Directive, Input, HostListener, ElementRef, inject } from '@angular/core';
import { AppDragDropService } from './drag-drop.service';

/**
 * Makes an element draggable. Dragging is initiated only when the user
 * presses down on a child element marked with [appDragHandle].
 *
 * Usage:
 *   <div appDraggable [dzData]="{ type: 'task', todo }" [dzSourceId]="listId">
 *     <span appDragHandle>≡</span>
 *     ... content ...
 *   </div>
 */
@Directive({
  selector: '[appDraggable]',
  standalone: true,
})
export class DraggableDirective {
  @Input({ required: true }) dzData!: any;
  @Input({ required: true }) dzSourceId!: string;

  private el  = inject<ElementRef<HTMLElement>>(ElementRef);
  private svc = inject(AppDragDropService);

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    // Only start drag when pointer is on (or inside) a drag handle
    if (!(event.target as Element).closest('[appDragHandle]')) return;
    this.svc.startDrag(event, this.el.nativeElement, this.dzData, this.dzSourceId);
  }
}

/**
 * Marker directive: the element (or its descendants) that initiates a drag.
 * No logic — acts purely as a CSS selector target for DraggableDirective.
 */
@Directive({
  selector: '[appDragHandle]',
  standalone: true,
  host: { style: 'cursor: grab; touch-action: none; -webkit-user-drag: none;' },
})
export class DragHandleDirective {}
