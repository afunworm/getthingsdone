import {
  Directive, Input, Output, EventEmitter, ElementRef, OnInit, OnDestroy, inject,
} from '@angular/core';
import { AppDragDropService, AppDropEvent } from './drag-drop.service';

/**
 * Marks an element as a drop zone.
 *
 * Usage:
 *   <div appDropZone [dzId]="'my-list'" [dzPredicate]="myPredicate" (dzDrop)="onDrop($event)">
 */
@Directive({
  selector: '[appDropZone]',
  standalone: true,
  host: { '[attr.data-dz-id]': 'dzId' },
})
export class DropZoneDirective implements OnInit, OnDestroy {
  @Input({ required: true }) dzId!: string;
  /** Return true to accept the dragged item. Receives the dragData value. */
  @Input() dzPredicate: (data: any) => boolean = () => true;
  @Output() dzDrop = new EventEmitter<AppDropEvent>();

  private el  = inject<ElementRef<HTMLElement>>(ElementRef);
  private svc = inject(AppDragDropService);

  ngOnInit(): void {
    this.svc.register({
      id:        this.dzId,
      element:   this.el.nativeElement,
      predicate: (data) => this.dzPredicate(data),
      onDrop:    (e)    => this.dzDrop.emit(e),
    });
  }

  ngOnDestroy(): void {
    this.svc.unregister(this.dzId);
  }
}
