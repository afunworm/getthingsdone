import { Injectable, NgZone, inject } from '@angular/core';
import { DragStateService } from '../services/drag-state.service';

export interface AppDropEvent {
  dragData: any;
  fromZoneId: string;
  toZoneId: string;
  previousIndex: number;
  currentIndex: number;
}

interface ZoneEntry {
  id: string;
  element: HTMLElement;
  predicate: (data: any) => boolean;
  onDrop: (e: AppDropEvent) => void;
}

@Injectable({ providedIn: 'root' })
export class AppDragDropService {
  private ngZone  = inject(NgZone);
  private dragState = inject(DragStateService);

  private zones = new Map<string, ZoneEntry>();

  // ── Active drag state ──────────────────────────────────────────────────────
  private active       = false;
  private dragData: any = null;
  private sourceZoneId  = '';
  private sourceIndex   = -1;
  private sourceEl: HTMLElement | null     = null;
  private sourceHeight  = 0;
  private previewEl: HTMLElement | null    = null;
  private placeholderEl: HTMLElement | null = null;
  private currentZoneId: string | null     = null;
  private offsetX = 0;
  private offsetY = 0;
  private lastX   = 0;
  private lastY   = 0;

  private scrollRaf = 0;
  private boundMove = this.onMove.bind(this);
  private boundUp   = this.onUp.bind(this);

  // ── Zone registry ──────────────────────────────────────────────────────────

  register(entry: ZoneEntry): void  { this.zones.set(entry.id, entry); }
  unregister(id: string): void      { this.zones.delete(id); }

  // ── Start drag ─────────────────────────────────────────────────────────────

  startDrag(event: PointerEvent, el: HTMLElement, data: any, sourceZoneId: string): void {
    if (this.active) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = el.getBoundingClientRect();
    this.active       = true;
    this.dragData     = data;
    this.sourceZoneId = sourceZoneId;
    this.sourceEl     = el;
    this.sourceHeight = rect.height;
    this.offsetX      = event.clientX - rect.left;
    this.offsetY      = event.clientY - rect.top;
    this.lastX        = event.clientX;
    this.lastY        = event.clientY;

    // Capture source index BEFORE touching the DOM.
    // Prefer dragData.index (set by Angular's $index) over DOM-based lookup,
    // which can be unreliable when Angular comment anchors shift children.
    const zone = this.zones.get(sourceZoneId);
    if (this.dragData?.index !== undefined) {
      this.sourceIndex = this.dragData.index;
    } else {
      const domIdx = zone ? Array.from(zone.element.children).indexOf(el) : -1;
      this.sourceIndex = domIdx >= 0 ? domIdx : 0;
    }

    // Placeholder occupies source's space; source is hidden but stays in DOM
    // so Angular's @for can still find and reuse the element after re-render.
    this.placeholderEl = document.createElement('div');
    this.placeholderEl.className    = 'dz-placeholder';
    this.placeholderEl.style.height = `${rect.height}px`;
    el.parentElement!.insertBefore(this.placeholderEl, el);
    el.style.display = 'none';        // hide but keep in DOM for Angular tracking
    this.currentZoneId = sourceZoneId;

    // Floating preview
    this.previewEl = this.buildPreview(el, rect);
    this.previewEl.style.left = `${rect.left}px`;
    this.previewEl.style.top  = `${rect.top}px`;
    document.body.appendChild(this.previewEl);

    this.dragState.isDragging.set(true);
    this.dragState.draggingType.set(data?.type ?? null);

    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('pointermove', this.boundMove, { passive: false });
      document.addEventListener('pointerup',   this.boundUp);
      this.startScrollLoop();
    });

    document.body.style.userSelect = 'none';
    document.body.style.cursor     = 'grabbing';
  }

  // ── Pointer move ───────────────────────────────────────────────────────────

  private onMove(event: PointerEvent): void {
    if (!this.active) return;
    event.preventDefault();

    this.lastX = event.clientX;
    this.lastY = event.clientY;

    if (this.previewEl) {
      this.previewEl.style.left = `${event.clientX - this.offsetX}px`;
      this.previewEl.style.top  = `${event.clientY - this.offsetY}px`;
    }

    // Log zone detection every ~30 frames so the console isn't flooded
    const verbose = (++this._logTick % 30 === 0);
    const zone = this.zoneAt(event.clientX, event.clientY, verbose);
    if (zone) {
      this.currentZoneId = zone.id;
      const idx = this.insertIndex(zone.element, event.clientY);
      this.movePlaceholder(zone.element, idx);
    }
  }

  // ── Pointer up ─────────────────────────────────────────────────────────────

  private onUp(event: PointerEvent): void {
    if (!this.active) return;

    document.removeEventListener('pointermove', this.boundMove);
    document.removeEventListener('pointerup',   this.boundUp);
    cancelAnimationFrame(this.scrollRaf);

    document.body.style.userSelect = '';
    document.body.style.cursor     = '';

    this._logTick = 0; // reset throttle for drop
    let zone             = this.zoneAt(event.clientX, event.clientY, true);

    // Fallback: if cursor landed outside every zone (e.g. empty page space below the list)
    // and we're dragging a subtask, use any registered 'area-*' catch-all zone so the
    // subtask still gets promoted instead of the drag silently cancelling.
    if (!zone && this.dragData?.type === 'subtask') {
      zone = Array.from(this.zones.values()).find(
        z => z.id.startsWith('area-') && z.predicate(this.dragData),
      ) ?? null;
      if (zone) console.log('[dnd] using fallback zone:', zone.id);
    }

    const currentIndex = zone ? this.insertIndex(zone.element, event.clientY) : 0;
    const isValidDrop  = !!(zone && zone.predicate(this.dragData));
    console.log('[dnd] DROP', {
      dragType:    this.dragData?.type,
      zone:        zone?.id ?? '(none)',
      isValidDrop,
      previousIndex: this.sourceIndex,
      currentIndex,
    });

    if (!isValidDrop) {
      // Cancelled — put source back where the placeholder currently is
      if (this.sourceEl && this.placeholderEl?.parentElement) {
        this.placeholderEl.parentElement.insertBefore(this.sourceEl, this.placeholderEl);
      }
    }

    this.placeholderEl?.remove();
    this.previewEl?.remove();
    this.placeholderEl = null;
    this.previewEl     = null;

    this.dragState.isDragging.set(false);
    this.dragState.draggingType.set(null);

    // Capture everything before clearing state
    const sourceEl    = this.sourceEl;
    const dragData    = this.dragData;
    const sourceZoneId = this.sourceZoneId;
    const sourceIndex  = this.sourceIndex;

    this.active        = false;
    this.dragData      = null;
    this.sourceEl      = null;
    this.currentZoneId = null;

    if (!isValidDrop) {
      // Restore source at original position (already re-inserted above)
      if (sourceEl) sourceEl.style.display = '';
      return;
    }

    const dropEvent: AppDropEvent = {
      dragData,
      fromZoneId:    sourceZoneId,
      toZoneId:      zone!.id,
      previousIndex: sourceIndex,
      currentIndex,
    };

    // Run inside Angular zone — CD fires synchronously on exit, moving sourceEl to new position
    this.ngZone.run(() => zone!.onDrop(dropEvent));

    // Restore display after Angular has re-rendered (element is now at its new position)
    if (sourceEl) sourceEl.style.display = '';
  }

  // ── Placeholder management ─────────────────────────────────────────────────

  private movePlaceholder(zoneEl: HTMLElement, index: number): void {
    if (!this.placeholderEl) return;
    const items = this.zoneItems(zoneEl);
    if (index >= items.length) {
      zoneEl.appendChild(this.placeholderEl);
    } else {
      zoneEl.insertBefore(this.placeholderEl, items[index]);
    }
  }

  // ── Zone lookup ────────────────────────────────────────────────────────────

  private _logTick = 0;

  private zoneAt(x: number, y: number, verbose = false): ZoneEntry | null {
    if (this.previewEl) this.previewEl.style.display = 'none';
    const els = document.elementsFromPoint(x, y);
    if (this.previewEl) this.previewEl.style.display = '';

    const candidates: string[] = [];
    for (const el of els) {
      const id = el.getAttribute('data-dz-id');
      if (id) {
        const zone = this.zones.get(id);
        const accepted = !!(zone && zone.predicate(this.dragData));
        candidates.push(`${id}:${accepted ? '✓' : '✗'}`);
        if (zone && accepted) {
          if (verbose) console.log('[dnd] zoneAt hit:', id, '| checked:', candidates.join(', '));
          return zone;
        }
      }
    }
    if (verbose) console.log('[dnd] zoneAt MISS | checked:', candidates.join(', ') || '(none)');
    return null;
  }

  // ── Index calculation ──────────────────────────────────────────────────────

  private insertIndex(zoneEl: HTMLElement, clientY: number): number {
    const items = this.zoneItems(zoneEl);
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return items.length;
  }

  /** Zone children, excluding the placeholder and the hidden source element. */
  private zoneItems(zoneEl: HTMLElement): HTMLElement[] {
    return Array.from(zoneEl.children).filter(
      el => el !== this.placeholderEl && el !== this.sourceEl,
    ) as HTMLElement[];
  }

  // ── Preview builder ────────────────────────────────────────────────────────

  private buildPreview(el: HTMLElement, rect: DOMRect): HTMLElement {
    const p = el.cloneNode(true) as HTMLElement;
    p.removeAttribute('style');
    p.style.cssText = `
      position: fixed; left: 0; top: 0;
      width: ${rect.width}px;
      pointer-events: none; z-index: 9999;
      opacity: 0.93;
      box-shadow: 0 8px 28px rgba(0,0,0,.22);
      border-radius: 6px; overflow: hidden;
      transform: rotate(1deg) scale(1.02);
      will-change: transform;
    `;
    return p;
  }

  // ── Auto-scroll ────────────────────────────────────────────────────────────

  private startScrollLoop(): void {
    const tick = () => {
      if (!this.active) return;
      this.doScroll(this.lastX, this.lastY);
      this.scrollRaf = requestAnimationFrame(tick);
    };
    this.scrollRaf = requestAnimationFrame(tick);
  }

  private doScroll(x: number, y: number): void {
    const EDGE = 80, MAX = 20;
    const vh = window.innerHeight;
    if (y < EDGE)        { window.scrollBy(0, -this.speed(y, EDGE, MAX));       return; }
    if (y > vh - EDGE)   { window.scrollBy(0,  this.speed(vh - y, EDGE, MAX));  return; }

    if (this.previewEl) this.previewEl.style.display = 'none';
    const els = document.elementsFromPoint(x, y) as HTMLElement[];
    if (this.previewEl) this.previewEl.style.display = '';

    for (const el of els) {
      if (el === document.body || el === document.documentElement) continue;
      const ov = getComputedStyle(el).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight) {
        const r = el.getBoundingClientRect();
        if      (y < r.top    + EDGE) el.scrollTop -= this.speed(y - r.top,    EDGE, MAX);
        else if (y > r.bottom - EDGE) el.scrollTop += this.speed(r.bottom - y, EDGE, MAX);
        break;
      }
    }
  }

  private speed(dist: number, edge: number, max: number): number {
    return Math.max(0, Math.round(max * (1 - dist / edge)));
  }
}
