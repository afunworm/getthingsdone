import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { AppDropEvent, DropZoneDirective } from '../../core/drag-drop';
import { AuthService } from '../../core/auth/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { InboxStoreService } from '../../core/services/inbox-store.service';
import { DragStateService } from '../../core/services/drag-state.service';
import { SettingsService } from '../../core/services/settings.service';
import { NotificationService, AppNotification } from '../../core/services/notification.service';
import { PriorityService } from '../../core/services/priority.service';
import { NewProjectDialogComponent } from '../../features/projects/new-project-dialog/new-project-dialog.component';
import { TodoDialogComponent } from '../../shared/components/todo-dialog/todo-dialog.component';
import { OnboardingService } from '../../core/services/onboarding.service';
import { APP_VERSION } from '../../version';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, DropZoneDirective],
  template: `
    <div class="shell">
      <!-- Sidebar -->
      <aside class="sidebar">
        <!-- Logo + Bell row -->
        <div class="sidebar-logo">
          <div class="logo-mark">✓</div>
          <div class="logo-name">
            <span class="logo-text">Get Things Done</span>
            <span class="logo-by"><span class="logo-version">{{ version }}</span> by bryan</span>
          </div>
          <!-- Notification Bell -->
          <div class="bell-wrap">
            <button class="bell-btn" (click)="toggleNotifPanel($event)" title="Notifications">
              <span class="material-icons" style="font-size:18px">notifications</span>
              @if (notifSvc.unreadCount() > 0) {
                <span class="bell-badge">{{ notifSvc.unreadCount() > 9 ? '9+' : notifSvc.unreadCount() }}</span>
              }
            </button>
          </div>
        </div>

        <!-- Nav -->
        <nav class="sidebar-nav">
          <!-- All Inboxes overview -->
          <a id="tour-all-inboxes" class="nav-item" routerLink="/all-inboxes" routerLinkActive="nav-active">
            <span class="material-icons nav-icon">all_inbox</span>
            <span>All Inboxes</span>
          </a>

          <!-- My Inbox drop zone -->
          <div
            class="nav-drop-zone"
            appDropZone
            dzId="inbox-drop-personal"
            [dzPredicate]="canDropOnMyInbox"
            (dzDrop)="onMyInboxDrop($event)"
            [class.drop-active]="dragState.isDragging() && dragState.currentProjectId() !== 'inbox'"
          >
            <a id="tour-my-inbox" class="nav-item" routerLink="/inbox" routerLinkActive="nav-active">
              <span class="material-icons nav-icon">inbox</span>
              <span>My Inbox</span>
            </a>
          </div>

          <div id="tour-inboxes-section">
            @if ((store.inboxes()?.length ?? 0) > 0) {
              <div class="nav-section">Inboxes</div>
            }

          @for (inbox of store.inboxes() ?? []; track inbox.id) {
            <div
              class="nav-drop-zone inbox-drop-zone"
              appDropZone
              [dzId]="'inbox-drop-' + inbox.id"
              [dzPredicate]="canDropInSidebar"
              (dzDrop)="onInboxDrop($event, inbox)"
              [class.drop-active]="dragState.isDragging() && inbox.id !== dragState.currentProjectId()"
            >
              <a
                class="nav-item inbox-nav-item"
                [routerLink]="['/projects', inbox.id]"
                routerLinkActive="nav-active"
              >
                <span
                  class="inbox-dot"
                  [style.background]="inbox.color || 'var(--accent-color)'"
                  style="color:#fff"
                >
                  {{ inbox.emoji || inbox.name[0].toUpperCase() }}
                </span>
                <span class="nav-label truncate">{{ inbox.name }}</span>
                <!-- Per-project notification settings trigger -->
                <button
                  class="notif-settings-btn"
                  (click)="openProjectNotifSettings($event, inbox)"
                  title="Notification settings for this inbox"
                >
                  <span class="material-icons" style="font-size:13px">notifications_none</span>
                </button>
              </a>
            </div>
          }

          <button id="tour-new-inbox" class="nav-item nav-new" (click)="openNewInbox()">
            <span class="material-icons nav-icon" style="font-size:14px">add</span>
            <span>New Inbox</span>
          </button>
          </div><!-- /tour-inboxes-section -->

          <div class="nav-divider"></div>

          <a id="tour-settings-link" class="nav-item" routerLink="/settings" routerLinkActive="nav-active">
            <span class="material-icons nav-icon">settings</span>
            <span>Settings</span>
          </a>

          @if (auth.isAdmin()) {
            <a class="nav-item" routerLink="/admin" routerLinkActive="nav-active">
              <span class="material-icons nav-icon">admin_panel_settings</span>
              <span>Admin</span>
            </a>
          }
        </nav>

        <!-- Footer -->
        <div class="sidebar-footer">
          <div class="user-row">
            <div class="user-avatar">{{ userInitial }}</div>
            <div class="user-info">
              <div class="user-name truncate">{{ auth.user()?.name }}</div>
              <div class="user-email truncate">{{ auth.user()?.email }}</div>
            </div>
            <button class="btn-icon" (click)="auth.logout()" title="Sign out">
              <span class="material-icons" style="font-size:16px">logout</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- Main -->
      <main id="tour-main-content" class="main-content">
        <router-outlet />
      </main>
    </div>

    <!-- Notification panel backdrop -->
    @if (notifPanelOpen()) {
      <div class="notif-backdrop" (click)="notifPanelOpen.set(false)"></div>
    }

    <!-- Notification panel -->
    @if (notifPanelOpen()) {
      <div class="notif-panel">
        <div class="notif-panel-hdr">
          <span class="notif-panel-title">Notifications</span>
          <div class="notif-panel-actions">
            @if (notifSvc.unreadCount() > 0) {
              <button class="notif-action-btn" (click)="notifSvc.markAllRead()">Mark all read</button>
            }
            <button class="notif-action-btn" (click)="notifSvc.clearAll()">Clear all</button>
            <a class="notif-action-btn" routerLink="/settings" (click)="notifPanelOpen.set(false)">Settings</a>
          </div>
        </div>

        <div class="notif-list">
          @if (notifSvc.notifications().length === 0) {
            <div class="notif-empty">
              <span class="material-icons" style="font-size:32px;color:var(--text-muted)">notifications_none</span>
              <p>No notifications</p>
            </div>
          }
          @for (n of notifSvc.notifications(); track n.id) {
            <div
              class="notif-item"
              [class.notif-unread]="!n.is_read"
              (click)="onNotifClick(n)"
            >
              <span class="material-icons notif-item-icon" [class]="notifIconClass(n.type)">
                {{ notifIcon(n.type) }}
              </span>
              <div class="notif-item-body">
                <div class="notif-item-title">{{ n.payload.title }}</div>
                <div class="notif-item-sub">{{ n.payload.body }}</div>
                <div class="notif-item-time">{{ timeAgo(n.created_at) }}</div>
              </div>
              @if (!n.is_read) {
                <span class="notif-dot"></span>
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- Per-project notification settings popover -->
    @if (projNotifOpen()) {
      <div class="notif-backdrop" (click)="projNotifOpen.set(false)"></div>
      <div class="proj-notif-panel" [style.top.px]="projNotifY()" [style.left.px]="projNotifX()">
        <div class="proj-notif-hdr">
          <span class="proj-notif-title">{{ projNotifInbox()?.name }} notifications</span>
          <button class="btn-icon" style="width:20px;height:20px" (click)="projNotifOpen.set(false)">
            <span class="material-icons" style="font-size:13px">close</span>
          </button>
        </div>
        @if (projNotifSettings()) {
          <div class="proj-notif-body">
            <label class="pn-row">
              <input type="checkbox" [checked]="projNotifSettings()!.on_task_created"
                (change)="saveProjNotif('on_task_created', $any($event.target).checked)" />
              Task created
            </label>
            <label class="pn-row">
              <input type="checkbox" [checked]="projNotifSettings()!.on_task_deleted"
                (change)="saveProjNotif('on_task_deleted', $any($event.target).checked)" />
              Task deleted
            </label>
            <label class="pn-row">
              <input type="checkbox" [checked]="projNotifSettings()!.on_task_updated"
                (change)="saveProjNotif('on_task_updated', $any($event.target).checked)" />
              Task updated
            </label>
            <label class="pn-row">
              <input type="checkbox" [checked]="projNotifSettings()!.on_task_comment"
                (change)="saveProjNotif('on_task_comment', $any($event.target).checked)" />
              Comments
            </label>
            <label class="pn-row">
              <input type="checkbox" [checked]="projNotifSettings()!.on_upcoming"
                (change)="saveProjNotif('on_upcoming', $any($event.target).checked)" />
              Upcoming reminders
            </label>
            @if (projNotifSettings()!.on_upcoming) {
              <div class="pn-sub-row">
                <span style="color:var(--text-muted);font-size:11px">Notify</span>
                <input type="number" class="pn-hours-input" min="1" max="168"
                  [value]="projNotifSettings()!.upcoming_hours"
                  (change)="saveProjNotif('upcoming_hours', +$any($event.target).value)" />
                <span style="color:var(--text-muted);font-size:11px">hours before due</span>
              </div>
            }
            <label class="pn-row">
              <input type="checkbox" [checked]="projNotifSettings()!.on_past_due"
                (change)="saveProjNotif('on_past_due', $any($event.target).checked)" />
              Past due reminders
            </label>
            <div class="pn-divider"></div>
            <label class="pn-row">
              <input type="checkbox" [checked]="projNotifSettings()!.notify_email"
                (change)="saveProjNotif('notify_email', $any($event.target).checked)" />
              Email notifications
            </label>
            <label class="pn-row">
              <input type="checkbox" [checked]="projNotifSettings()!.notify_toast"
                (change)="saveProjNotif('notify_toast', $any($event.target).checked)" />
              Toast + sound
            </label>
            <div class="pn-reset">
              <button class="notif-action-btn" (click)="resetProjNotif()">Reset to global defaults</button>
            </div>
          </div>
        }
      </div>
    }

    <!-- Overdue modal -->
    @if (overdueItems().length > 0) {
      <div class="rem-modal-backdrop" (click)="dismissOverdue()"></div>
      <div class="overdue-modal" role="alertdialog" aria-modal="true">
        <div class="overdue-hdr">
          <span class="material-icons" style="font-size:18px;color:#e65100">schedule</span>
          <span class="overdue-hdr-title">
            {{ overdueItems().length }} overdue task{{ overdueItems().length === 1 ? '' : 's' }}
          </span>
        </div>
        <div class="overdue-list">
          @for (item of overdueItems(); track item.id) {
            <div class="overdue-row">
              <div class="overdue-row-info">
                <button class="overdue-task-title" (click)="openOverdueTask(item)">{{ item.title }}</button>
                <div class="overdue-row-meta">
                  <span class="overdue-inbox">{{ item.inbox_name }}</span>
                  <span class="overdue-age">
                    {{ item.days_overdue === 0 ? 'Due today' : item.days_overdue + (item.days_overdue === 1 ? ' day' : ' days') + ' overdue' }}
                  </span>
                </div>
              </div>
              <button class="postpone-btn" (click)="openPostponeMenu($event, item.id)">
                Postpone
                <span class="material-icons" style="font-size:12px">arrow_drop_down</span>
              </button>
            </div>
          }
        </div>
        <div class="overdue-footer">
          <button class="rem-action-btn rem-action-dismiss" (click)="dismissOverdue()">Dismiss</button>
        </div>
      </div>
      <!-- Postpone menu rendered outside the modal to escape its CSS transform -->
      @if (postponeOpenId() && postponeMenuPos()) {
        <div class="postpone-backdrop" (click)="postponeOpenId.set(null); postponeMenuPos.set(null)"></div>
        <div class="postpone-menu"
          [style.top.px]="postponeMenuPos()!.top"
          [style.right.px]="postponeMenuPos()!.right">
          <button class="postpone-opt" (click)="postponeTask(postponeOpenId()!, 1)">Tomorrow</button>
          <button class="postpone-opt" (click)="postponeTask(postponeOpenId()!, 3)">In 3 days</button>
          <button class="postpone-opt" (click)="postponeTask(postponeOpenId()!, 7)">Next week</button>
          <div class="postpone-divider"></div>
          <label class="postpone-date-row">
            <span style="font-size:11px;color:var(--text-muted)">Pick date</span>
            <input type="date" class="postpone-date-input"
              (change)="postponeCustom(postponeOpenId()!, $any($event.target).value)" />
          </label>
        </div>
      }
    }

    <!-- Reminder modal -->
    @if (reminderQueue().length > 0) {
      <div class="rem-modal-backdrop"></div>
      <div class="rem-modal" role="alertdialog" aria-modal="true">
        <div class="rem-modal-icon">
          <span class="material-icons">alarm</span>
        </div>
        <div class="rem-modal-content">
          <div class="rem-modal-label">Reminder</div>
          <div class="rem-modal-title">{{ reminderQueue()[0].title.replace('Reminder: ', '') }}</div>
          @if (reminderQueue()[0].body) {
            <div class="rem-modal-body">{{ reminderQueue()[0].body }}</div>
          }
          @if (reminderQueue().length > 1) {
            <div class="rem-modal-more">+{{ reminderQueue().length - 1 }} more reminder{{ reminderQueue().length > 2 ? 's' : '' }}</div>
          }
        </div>
        <div class="rem-modal-snooze">
          <div class="rem-snooze-label">Snooze</div>
          <div class="rem-snooze-btns">
            <button class="rem-snooze-btn" (click)="snoozeReminder(15)">15 min</button>
            <button class="rem-snooze-btn" (click)="snoozeReminder(60)">1 hour</button>
            <button class="rem-snooze-btn" (click)="snoozeToTomorrow9am()">Tomorrow 9am</button>
          </div>
        </div>
        <div class="rem-modal-actions">
          @if (reminderQueue()[0].link) {
            <button class="rem-action-btn rem-action-go" (click)="goToReminderTask()">
              <span class="material-icons" style="font-size:15px">open_in_new</span>
              Go to task
            </button>
          }
          <button class="rem-action-btn rem-action-dismiss" (click)="dismissReminder()">Dismiss</button>
        </div>
      </div>
    }

    <!-- Toast container -->
    @if (toast.toasts().length > 0) {
      <div class="toast-container">
        @for (t of toast.toasts(); track t.id) {
          @if (t.type === 'notification') {
            <div class="toast toast-notification" (click)="onToastClick(t)">
              <span class="material-icons" style="font-size:16px;color:var(--accent-color);flex-shrink:0">notifications</span>
              <div class="toast-notif-body">
                <div class="toast-notif-title">{{ t.message }}</div>
                @if (t.body) {
                  <div class="toast-notif-sub">{{ t.body }}</div>
                }
              </div>
              <button class="btn-icon" style="width:20px;height:20px;flex-shrink:0" (click)="$event.stopPropagation(); toast.dismiss(t.id)">
                <span class="material-icons" style="font-size:14px">close</span>
              </button>
            </div>
          } @else {
            <div class="toast" [class.toast-error]="t.type === 'error'">
              {{ t.message }}
              <button class="btn-icon" style="width:20px;height:20px" (click)="toast.dismiss(t.id)">
                <span class="material-icons" style="font-size:14px">close</span>
              </button>
            </div>
          }
        }
      </div>
    }
  `,
  styles: [
    `
      .shell {
        display: flex;
        height: 100vh;
        overflow: hidden;
      }

      /* Sidebar */
      .sidebar {
        width: 216px;
        flex-shrink: 0;
        background: var(--surface-card);
        border-right: 1px solid var(--surface-border);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .sidebar-logo {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 13px 12px 10px;
        flex-shrink: 0;
      }
      .logo-mark {
        width: 26px;
        height: 26px;
        background: var(--accent-color);
        color: #fff;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 13px;
        flex-shrink: 0;
      }
      .logo-name {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      .logo-text {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -0.3px;
        line-height: 1;
      }
      .logo-by {
        font-size: 10px;
        color: var(--text-muted);
        line-height: 1;
      }
      .logo-version {
        opacity: 0.7;
        margin-right: 2px;
      }

      /* Bell */
      .bell-wrap { position: relative; flex-shrink: 0; }
      .bell-btn {
        position: relative;
        width: 28px; height: 28px;
        border: 0; background: transparent;
        border-radius: 6px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: var(--text-secondary);
        transition: background 120ms, color 120ms;
        &:hover { background: var(--surface-hover); color: var(--text-primary); }
      }
      .bell-badge {
        position: absolute;
        top: 2px; right: 2px;
        min-width: 14px; height: 14px;
        background: #e53935;
        color: #fff;
        border-radius: 7px;
        font-size: 9px;
        font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        padding: 0 3px;
        line-height: 1;
      }
      .sidebar-nav {
        flex: 1;
        overflow-y: auto;
        padding: 2px 0 8px;
      }

      .nav-drop-zone {
        position: relative;
        transition: background 120ms;
        border-radius: 6px;
        margin: 1px 6px;
        &.drop-active {
          outline: 1px dashed var(--accent-color);
          outline-offset: -1px;
          background: color-mix(in srgb, var(--accent-color) 5%, transparent);
        }
        &.drop-active.cdk-drop-list-receiving {
          background: color-mix(in srgb, var(--accent-color) 15%, transparent);
          outline-style: solid;
        }
        .nav-item { margin: 0; }
      }

      .nav-item {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 6px 10px;
        margin: 1px 6px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 450;
        color: var(--text-secondary);
        text-decoration: none;
        cursor: pointer;
        background: transparent;
        border: 0;
        width: calc(100% - 12px);
        box-sizing: border-box;
        text-align: left;
        transition: background 120ms, color 120ms;
        &:hover {
          background: var(--surface-hover);
          color: var(--text-primary);
          .notif-settings-btn { opacity: 1; }
        }
        &.nav-active {
          background: color-mix(in srgb, var(--accent-color) 13%, transparent);
          color: var(--accent-color);
          font-weight: 500;
          .nav-icon { color: var(--accent-color); opacity: 1; }
        }
      }
      .nav-drop-zone .nav-item { width: 100%; margin: 0; }

      /* Per-inbox notification button */
      .inbox-nav-item { position: relative; }
      .notif-settings-btn {
        opacity: 0;
        transition: opacity 120ms;
        width: 20px; height: 20px;
        border: 0; background: transparent;
        border-radius: 4px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: var(--text-muted); flex-shrink: 0;
        margin-left: auto;
        &:hover { color: var(--accent-color); background: var(--surface-hover); }
      }

      .nav-icon {
        font-size: 16px;
        width: 16px; height: 16px;
        flex-shrink: 0;
        opacity: 0.7;
      }
      .nav-new { color: var(--text-muted); font-size: 12px; }
      .nav-new:hover { color: var(--accent-color); }

      .inbox-dot {
        width: 20px; height: 20px;
        flex-shrink: 0;
        border-radius: 5px;
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 700;
      }
      .nav-label { flex: 1; min-width: 0; }

      .nav-section {
        padding: 10px 16px 2px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: var(--text-muted);
      }
      .nav-divider { height: 1px; margin: 6px 10px; background: var(--surface-border); }

      /* Footer */
      .sidebar-footer {
        border-top: 1px solid var(--surface-border);
        padding: 8px 6px;
        flex-shrink: 0;
      }
      .user-row {
        display: flex; align-items: center; gap: 6px;
        padding: 4px; border-radius: 6px;
      }
      .user-avatar {
        width: 28px; height: 28px; flex-shrink: 0;
        background: var(--accent-color); color: #fff;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-weight: 600; font-size: 12px;
      }
      .user-info { flex: 1; min-width: 0; }
      .user-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
      .user-email { font-size: 11px; color: var(--text-muted); }

      /* Main */
      .main-content { flex: 1; overflow-y: auto; background: var(--surface-bg); }

      /* Backdrops */
      .notif-backdrop {
        position: fixed; inset: 0; z-index: 100;
      }

      /* Notification panel */
      .notif-panel {
        position: fixed;
        top: 0; left: 216px;
        width: 340px; height: 100vh;
        background: var(--surface-card);
        border-right: 1px solid var(--surface-border);
        box-shadow: var(--shadow-md);
        z-index: 101;
        display: flex; flex-direction: column;
        animation: slideRight 150ms ease-out;
      }
      @keyframes slideRight {
        from { transform: translateX(-16px); opacity: 0; }
        to   { transform: translateX(0);     opacity: 1; }
      }
      .notif-panel-hdr {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 14px 10px;
        border-bottom: 1px solid var(--surface-border);
        flex-shrink: 0;
      }
      .notif-panel-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
      .notif-panel-actions { display: flex; gap: 6px; }
      .notif-action-btn {
        font-size: 11px; color: var(--accent-color); background: transparent;
        border: 0; cursor: pointer; padding: 2px 4px; border-radius: 4px;
        text-decoration: none;
        &:hover { background: color-mix(in srgb, var(--accent-color) 10%, transparent); }
      }
      .notif-list { flex: 1; overflow-y: auto; }
      .notif-empty {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 8px;
        height: 200px; color: var(--text-muted); font-size: 13px;
      }
      .notif-item {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 10px 14px; cursor: pointer;
        border-bottom: 1px solid var(--surface-border);
        transition: background 100ms;
        position: relative;
        &:hover { background: var(--surface-hover); }
      }
      .notif-unread { background: color-mix(in srgb, var(--accent-color) 4%, transparent); }
      .notif-item-icon {
        font-size: 18px; width: 18px; height: 18px; flex-shrink: 0;
        margin-top: 1px;
        &.icon-created { color: #43a047; }
        &.icon-deleted { color: #e53935; }
        &.icon-updated { color: #fb8c00; }
        &.icon-comment { color: var(--accent-color); }
        &.icon-upcoming { color: #039be5; }
        &.icon-past-due { color: #e53935; }
        &.icon-reminder { color: #8e24aa; }
      }
      .notif-item-body { flex: 1; min-width: 0; }
      .notif-item-title { font-size: 13px; font-weight: 500; color: var(--text-primary); }
      .notif-item-sub   { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
      .notif-item-time  { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
      .notif-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--accent-color); flex-shrink: 0; margin-top: 5px;
      }

      /* Per-project notif settings popover */
      .proj-notif-panel {
        position: fixed;
        width: 240px;
        background: var(--surface-card);
        border: 1px solid var(--surface-border);
        border-radius: 10px;
        box-shadow: var(--shadow-md);
        z-index: 102;
        animation: fadeIn 120ms ease-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to   { opacity: 1; transform: scale(1); }
      }
      .proj-notif-hdr {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px 6px;
        border-bottom: 1px solid var(--surface-border);
      }
      .proj-notif-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
      .proj-notif-body { padding: 8px 12px 10px; display: flex; flex-direction: column; gap: 5px; }
      .pn-row {
        display: flex; align-items: center; gap: 7px;
        font-size: 12px; color: var(--text-secondary); cursor: pointer;
        input[type=checkbox] { cursor: pointer; accent-color: var(--accent-color); }
      }
      .pn-sub-row {
        display: flex; align-items: center; gap: 5px;
        padding-left: 20px; margin-top: -2px;
      }
      .pn-hours-input {
        width: 46px; padding: 2px 4px; border: 1px solid var(--surface-border);
        border-radius: 4px; font-size: 12px; font-family: inherit;
        background: var(--surface-bg); color: var(--text-primary);
        text-align: center;
      }
      .pn-divider { height: 1px; background: var(--surface-border); margin: 4px 0; }
      .pn-reset { margin-top: 6px; text-align: center; }

      /* Toasts */
      .toast-container {
        position: fixed; bottom: 20px; right: 20px;
        display: flex; flex-direction: column; gap: 8px; z-index: 9999;
      }
      .toast {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px;
        background: var(--surface-card);
        border: 1px solid var(--surface-border);
        border-radius: 8px;
        box-shadow: var(--shadow-md);
        font-size: 13px; color: var(--text-primary);
        animation: slideIn 150ms ease-out;
        max-width: 320px;
      }
      .toast-error { border-color: #d32f2f; color: #d32f2f; }
      .toast-notification {
        cursor: pointer;
        border-color: var(--accent-color);
        &:hover { background: var(--surface-hover); }
      }
      .toast-notif-body { flex: 1; min-width: 0; }
      .toast-notif-title { font-size: 13px; font-weight: 500; color: var(--text-primary); }
      .toast-notif-sub   { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
      @keyframes slideIn {
        from { transform: translateX(20px); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }

      /* Reminder modal */
      .rem-modal-backdrop {
        position: fixed; inset: 0;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(2px);
        z-index: 500;
        animation: fadeIn 200ms ease-out;
      }
      .rem-modal {
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 560px; max-width: calc(100vw - 32px);
        background: var(--surface-card);
        border: 1px solid var(--surface-border);
        border-radius: 16px;
        box-shadow: 0 24px 64px rgba(0,0,0,.3);
        z-index: 501;
        overflow: hidden;
        animation: remPop 220ms cubic-bezier(.34,1.56,.64,1);
      }
      @keyframes remPop {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.88); }
        to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      .rem-modal-icon {
        display: flex; align-items: center; justify-content: center;
        padding: 24px 24px 0;
        .material-icons { font-size: 40px; color: #8e24aa; }
      }
      .rem-modal-content {
        padding: 12px 24px 0;
        text-align: center;
      }
      .rem-modal-label {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .8px; color: #8e24aa; margin-bottom: 6px;
      }
      .rem-modal-title {
        font-size: 17px; font-weight: 600; color: var(--text-primary);
        line-height: 1.3;
      }
      .rem-modal-body {
        font-size: 13px; color: var(--text-secondary);
        margin-top: 6px; line-height: 1.4;
      }
      .rem-modal-more {
        display: inline-block; margin-top: 8px;
        padding: 2px 10px; border-radius: 99px;
        background: color-mix(in srgb, #8e24aa 12%, transparent);
        color: #8e24aa; font-size: 11px; font-weight: 600;
      }
      .rem-modal-snooze {
        padding: 16px 24px 0;
        text-align: center;
      }
      .rem-snooze-label {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .5px; color: var(--text-muted); margin-bottom: 8px;
      }
      .rem-snooze-btns {
        display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
      }
      .rem-snooze-btn {
        padding: 6px 14px; border-radius: 8px; border: 1px solid var(--surface-border);
        background: var(--surface-bg); color: var(--text-secondary);
        font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
        transition: background 120ms, border-color 120ms, color 120ms;
        &:hover {
          background: color-mix(in srgb, #8e24aa 10%, transparent);
          border-color: #8e24aa; color: #8e24aa;
        }
      }
      .rem-modal-actions {
        display: flex; gap: 8px; padding: 16px 24px 20px; justify-content: center;
      }
      .rem-action-btn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 8px 20px; border-radius: 8px; border: none; cursor: pointer;
        font-family: inherit; font-size: 13px; font-weight: 600;
        transition: opacity 120ms;
        &:hover { opacity: .85; }
      }
      .rem-action-go {
        background: #8e24aa; color: #fff;
      }
      .rem-action-dismiss {
        background: var(--surface-hover); color: var(--text-secondary);
      }

      /* Overdue modal */
      .overdue-modal {
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 520px; max-width: calc(100vw - 32px);
        background: var(--surface-card);
        border: 1px solid var(--surface-border);
        border-radius: 14px;
        box-shadow: 0 24px 64px rgba(0,0,0,.3);
        z-index: 501;
        overflow: visible;
        animation: remPop 220ms cubic-bezier(.34,1.56,.64,1);
      }
      .overdue-hdr {
        display: flex; align-items: center; gap: 8px;
        padding: 14px 18px 12px;
        border-bottom: 1px solid var(--surface-border);
        background: color-mix(in srgb, #e65100 6%, transparent);
        border-radius: 14px 14px 0 0;
      }
      .overdue-hdr-title {
        font-size: 14px; font-weight: 600; color: #c0392b;
      }
      .overdue-list {
        max-height: 320px; overflow-y: auto; overflow-x: visible;
      }
      .overdue-row {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 18px;
        border-bottom: 1px solid var(--surface-border);
        &:last-child { border-bottom: 0; }
      }
      .overdue-row-info { flex: 1; min-width: 0; }
      .overdue-task-title {
        display: block; width: 100%;
        background: transparent; border: 0; padding: 0;
        text-align: left; cursor: pointer;
        font-family: inherit; font-size: 13px; font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        &:hover { color: var(--accent-color); text-decoration: underline; }
      }
      .overdue-row-meta {
        display: flex; align-items: center; gap: 6px; margin-top: 2px;
      }
      .overdue-inbox {
        font-size: 11px; color: var(--text-muted);
        background: var(--surface-hover); border-radius: 4px; padding: 1px 6px;
      }
      .overdue-age {
        font-size: 11px; color: #e65100; font-weight: 500;
      }
      .postpone-btn {
        display: inline-flex; align-items: center; gap: 2px;
        padding: 4px 10px; border-radius: 6px;
        border: 1px solid var(--surface-border);
        background: transparent; cursor: pointer;
        font-family: inherit; font-size: 12px; font-weight: 500;
        color: var(--text-secondary); transition: all 120ms; white-space: nowrap;
        &:hover { border-color: #e65100; color: #e65100; }
      }
      .postpone-backdrop { position: fixed; inset: 0; z-index: 502; }
      .postpone-menu {
        position: fixed;
        background: var(--surface-card); border: 1px solid var(--surface-border);
        border-radius: 8px; box-shadow: var(--shadow-md);
        padding: 4px; min-width: 140px; z-index: 503;
        animation: fadeIn 100ms ease-out;
      }
      .postpone-opt {
        display: block; width: 100%;
        padding: 7px 12px; border: 0; border-radius: 5px;
        background: transparent; cursor: pointer; text-align: left;
        font-family: inherit; font-size: 12px; color: var(--text-secondary);
        transition: background 80ms;
        &:hover { background: var(--surface-hover); color: var(--text-primary); }
      }
      .postpone-divider { height: 1px; background: var(--surface-border); margin: 4px 0; }
      .postpone-date-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 4px 12px; gap: 8px; cursor: default;
      }
      .postpone-date-input {
        border: 1px solid var(--surface-border); border-radius: 4px;
        background: var(--surface-bg); color: var(--text-primary);
        font-family: inherit; font-size: 11px; padding: 2px 4px;
        width: 110px; cursor: pointer;
      }
      .overdue-footer {
        display: flex; justify-content: flex-end;
        padding: 10px 18px;
        border-top: 1px solid var(--surface-border);
        background: var(--surface-bg);
        border-radius: 0 0 14px 14px;
      }

      .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `,
  ],
})
export class ShellComponent implements OnInit, OnDestroy {
  auth         = inject(AuthService);
  toast        = inject(ToastService);
  prioritySvc  = inject(PriorityService);
  store     = inject(InboxStoreService);
  dragState = inject(DragStateService);
  notifSvc      = inject(NotificationService);
  onboardingSvc = inject(OnboardingService);
  readonly version = APP_VERSION;
  private api      = inject(ApiService);
  private dialog   = inject(Dialog);
  private settings = inject(SettingsService);
  private router   = inject(Router);

  // Notification panel
  notifPanelOpen = signal(false);

  // Per-project notification settings popover
  projNotifOpen     = signal(false);
  projNotifInbox    = signal<any>(null);
  projNotifX        = signal(0);
  projNotifY        = signal(0);
  projNotifSettings = signal<any>(null);

  // Reminder modal queue
  reminderQueue = signal<AppNotification['payload'][]>([]);

  // Overdue modal
  overdueItems    = signal<any[]>([]);
  postponeOpenId  = signal<string | null>(null);
  postponeMenuPos = signal<{ top: number; right: number } | null>(null);

  private reminderSub?: Subscription;

  ngOnInit(): void {
    this.api.get<any[]>('/projects').subscribe((list) => this.store.set(list));
    this.settings.load();
    this.prioritySvc.load();
    this.notifSvc.init();
    this.onboardingSvc.init();
    this.reminderSub = this.notifSvc.refresh$.subscribe((payload) => {
      if (payload.type === 'task_reminder') {
        this.reminderQueue.update((q) => [...q, payload]);
      }
    });
    this.api.get<any[]>('/notifications/overdue-check').subscribe((items) => {
      if (items.length > 0) this.overdueItems.set(items);
    });
  }

  ngOnDestroy(): void {
    this.notifSvc.destroy();
    this.reminderSub?.unsubscribe();
  }

  // ── Notification panel ────────────────────────────────────────────────────

  toggleNotifPanel(e: MouseEvent): void {
    e.stopPropagation();
    this.projNotifOpen.set(false);
    this.notifPanelOpen.update((v) => !v);
  }

  onNotifClick(n: any): void {
    this.notifSvc.navigateTo(n);
    this.notifPanelOpen.set(false);
  }

  notifIcon(type: string): string {
    const map: Record<string, string> = {
      task_created:    'add_circle_outline',
      task_deleted:    'delete_outline',
      task_updated:    'edit',
      task_flow:       'swap_horiz',
      task_assigned:   'person_add',
      task_unassigned: 'person_remove',
      task_comment:    'chat_bubble_outline',
      task_upcoming:   'schedule',
      task_past_due:   'warning_amber',
      task_reminder:   'alarm',
    };
    return map[type] ?? 'notifications';
  }

  notifIconClass(type: string): string {
    const map: Record<string, string> = {
      task_created:    'icon-created',
      task_deleted:    'icon-deleted',
      task_updated:    'icon-updated',
      task_flow:       'icon-updated',
      task_assigned:   'icon-created',
      task_unassigned: 'icon-deleted',
      task_comment:    'icon-comment',
      task_upcoming:   'icon-upcoming',
      task_past_due:   'icon-past-due',
      task_reminder:   'icon-reminder',
    };
    return map[type] ?? '';
  }

  timeAgo(unixSec: number): string {
    const diff = Math.floor(Date.now() / 1000) - unixSec;
    if (diff < 60)   return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // ── Per-project notification settings ─────────────────────────────────────

  openProjectNotifSettings(e: MouseEvent, inbox: any): void {
    e.preventDefault();
    e.stopPropagation();
    this.notifPanelOpen.set(false);
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.projNotifX.set(rect.right + 8);
    this.projNotifY.set(rect.top);
    this.projNotifInbox.set(inbox);
    this.projNotifSettings.set(this.notifSvc.getEffectiveSettings(inbox.id));
    this.projNotifOpen.set(true);
  }

  saveProjNotif(key: string, value: any): void {
    const inbox = this.projNotifInbox();
    if (!inbox) return;
    this.notifSvc.upsertSettings(inbox.id, { [key]: value });
    this.projNotifSettings.update((s) => ({ ...s, [key]: value }));
  }

  resetProjNotif(): void {
    const inbox = this.projNotifInbox();
    if (!inbox) return;
    this.notifSvc.deleteProjectSettings(inbox.id);
    this.projNotifOpen.set(false);
  }

  // ── Reminder modal ────────────────────────────────────────────────────────

  dismissReminder(): void {
    this.reminderQueue.update((q) => q.slice(1));
  }

  goToReminderTask(): void {
    const reminder = this.reminderQueue()[0];
    if (reminder?.link) this.router.navigateByUrl(reminder.link);
    this.dismissReminder();
  }

  snoozeReminder(minutes: number): void {
    const reminder = this.reminderQueue()[0];
    if (!reminder?.todoId) { this.dismissReminder(); return; }
    const remindAt = Math.floor(Date.now() / 1000) + minutes * 60;
    this.api.post(`/notifications/reminders/${reminder.todoId}`, { remindAt }).subscribe();
    this.dismissReminder();
  }

  snoozeToTomorrow9am(): void {
    const reminder = this.reminderQueue()[0];
    if (!reminder?.todoId) { this.dismissReminder(); return; }
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const remindAt = Math.floor(d.getTime() / 1000);
    this.api.post(`/notifications/reminders/${reminder.todoId}`, { remindAt }).subscribe();
    this.dismissReminder();
  }

  // ── Overdue modal ─────────────────────────────────────────────────────────

  dismissOverdue(): void {
    this.overdueItems.set([]);
    this.postponeOpenId.set(null);
    this.postponeMenuPos.set(null);
  }

  openPostponeMenu(event: MouseEvent, itemId: string): void {
    if (this.postponeOpenId() === itemId) {
      this.postponeOpenId.set(null);
      this.postponeMenuPos.set(null);
      return;
    }
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    this.postponeMenuPos.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    this.postponeOpenId.set(itemId);
  }

  postponeTask(id: string, days: number): void {
    const newDue = Math.floor(Date.now() / 1000) + days * 86400;
    this.api.patch(`/todos/${id}`, { dueDate: newDue }).subscribe();
    this.overdueItems.update((list) => list.filter((t) => t.id !== id));
    this.postponeOpenId.set(null);
    this.postponeMenuPos.set(null);
  }

  postponeCustom(id: string, dateStr: string): void {
    if (!dateStr) return;
    const newDue = Math.floor(new Date(dateStr).getTime() / 1000);
    this.api.patch(`/todos/${id}`, { dueDate: newDue }).subscribe();
    this.overdueItems.update((list) => list.filter((t) => t.id !== id));
    this.postponeOpenId.set(null);
    this.postponeMenuPos.set(null);
  }

  openOverdueTask(item: any): void {
    this.dialog.open(TodoDialogComponent, {
      width: '640px', maxHeight: '90vh', hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop', panelClass: 'app-dialog-panel',
      data: {
        mode: 'detail',
        todo: item,
        isInbox: item.is_inbox,
        flowSteps: item.flow_steps,
      },
    });
    this.dismissOverdue();
  }

  // ── Toast click ───────────────────────────────────────────────────────────

  onToastClick(t: any): void {
    if (t.link) {
      this.router.navigateByUrl(t.link);
    }
    this.toast.dismiss(t.id);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────

  canDropInSidebar = (data: any) => data?.type === 'task' || data?.type === 'subtask';

  canDropOnMyInbox = (data: any) =>
    (data?.type === 'task' && !data?.todo?.is_inbox) || data?.type === 'subtask';

  onInboxDrop(event: AppDropEvent, inbox: any): void {
    const data = event.dragData;

    if (data?.type === 'subtask') {
      const sub = data.sub;
      const parentId = data.parentId;
      this.api.patch<any>(`/todos/${sub.id}`, { parentTodoId: null }).subscribe(() => {
        this.api.patch<any>(`/todos/${sub.id}/move`, { projectId: inbox.id }).subscribe(() => {
          this.dragState.movedSubtaskInfo.set({ id: sub.id, parentId });
          this.toast.show(`Moved "${sub.title}" to ${inbox.name}`);
        });
      });
      return;
    }

    if (data?.type !== 'task') return;
    const todo = data.todo;
    if (todo.project_id === inbox.id) return;

    this.api.patch<any>(`/todos/${todo.id}/move`, { projectId: inbox.id }).subscribe(() => {
      this.dragState.movedTodoId.set(todo.id);
      this.toast.show(`Moved "${todo.title}" to ${inbox.name}`);
    });
  }

  onMyInboxDrop(event: AppDropEvent): void {
    const data = event.dragData;

    if (data?.type === 'subtask') {
      const sub = data.sub;
      const parentId = data.parentId;
      this.api.patch<any>(`/todos/${sub.id}`, { parentTodoId: null }).subscribe(() => {
        this.api.patch<any>(`/todos/${sub.id}/move`, { toInbox: true }).subscribe(() => {
          this.dragState.movedSubtaskInfo.set({ id: sub.id, parentId });
          this.toast.show(`Moved "${sub.title}" to My Inbox`);
        });
      });
      return;
    }

    if (data?.type !== 'task' || data?.todo?.is_inbox) return;
    const todo = data.todo;

    this.api.patch<any>(`/todos/${todo.id}/move`, { toInbox: true }).subscribe(() => {
      this.dragState.movedTodoId.set(todo.id);
      this.toast.show(`Moved "${todo.title}" to My Inbox`);
    });
  }

  openNewInbox(): void {
    const ref = this.dialog.open(NewProjectDialogComponent, {
      width: '500px',
      maxHeight: '90vh',
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-backdrop',
      panelClass: 'app-dialog-panel',
      data: {},
    });
    ref.closed.subscribe((inbox: any) => {
      if (inbox && inbox !== 'deleted') this.store.add(inbox);
    });
  }

  get userInitial(): string {
    return (this.auth.user()?.name ?? '?')[0].toUpperCase();
  }
}
