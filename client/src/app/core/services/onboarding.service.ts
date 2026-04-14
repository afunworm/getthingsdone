import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { driver, DriveStep } from 'driver.js';
import { ApiService } from './api.service';
import { InboxStoreService } from './inbox-store.service';

// Step indices that trigger side-effects on Next
const STEP_ANIMATE_TASKS    = 1;   // step 1  = My Inbox sidebar → navigate to /inbox + animate tasks on Next
const STEP_BEFORE_SETTINGS  = 22;  // step 22 = Settings link → navigate to /settings on Next
const STEP_BEFORE_NOTIF_TAB = 24;  // step 24 = Reminder row → click Notifications tab on Next
const STEP_BEFORE_RESTART   = 25;  // step 25 = Notifications → switch to General tab on Next

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private api = inject(ApiService);
  private router = inject(Router);
  private inboxStore = inject(InboxStoreService);

  private driverObj: ReturnType<typeof driver> | null = null;

  init(): void {
    this.api.get<any>('/users/me').subscribe((user) => {
      if (user && !user.onboarding_completed_at) {
        this.startTour();
      }
    });
  }

  restart(): void {
    this.startTour();
  }

  complete(): void {
    this.api.patch('/users/me/complete-onboarding', {}).subscribe();
  }

  private startTour(): void {
    this.api
      .post<{ task1Id: string; task2Id: string }>('/users/me/tour-demo-tasks', {})
      .subscribe(({ task1Id, task2Id }) => {
        // Navigate away from /inbox so the user never sees tasks appearing then being hidden.
        // The tour will navigate to /inbox at step 1's Next.
        const nav = this.router.url.startsWith('/inbox')
          ? this.router.navigate(['/settings'])
          : Promise.resolve(true);
        nav.then(() => this.launchDriver(task1Id, task2Id));
      });
  }

  private hideTourTasks(): void {
    document.getElementById('tour-task-list-wrap')?.classList.add('tour-tasks-hidden');
  }

  private showTourTasks(): void {
    const el = document.getElementById('tour-task-list-wrap');
    if (!el) return;
    el.classList.remove('tour-tasks-hidden');
    el.classList.add('tour-tasks-animate-in');
  }

  private cleanupTourClasses(): void {
    const el = document.getElementById('tour-task-list-wrap');
    if (!el) return;
    el.classList.remove('tour-tasks-hidden', 'tour-tasks-animate-in');
  }

  private launchDriver(task1Id: string, task2Id: string): void {
    const self = this;
    let tourEnded = false;
    // Note: hideTourTasks() is NOT called here — we start the tour away from /inbox.
    // Tasks are hidden then revealed in onNextClick when the user advances past step 1.

    this.driverObj = driver({
      showProgress: true,
      animate: true,
      overlayColor: 'rgba(0,0,0,0.55)',
      smoothScroll: true,
      stagePadding: 6,
      stageRadius: 8,
      allowClose: false,
      steps: self.buildSteps(task1Id, task2Id),

      onPopoverRender(popover) {
        // Move progress text (x of 26) above the footer nav buttons
        popover.wrapper.insertBefore(popover.progress, popover.footer);

        // Hide driver.js's own close button — we replace it with a fully custom one
        popover.closeButton.style.display = 'none';

        // Remove stale custom close button from previous step render
        popover.wrapper.querySelector('.tour-close-btn')?.remove();

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tour-close-btn';
        closeBtn.setAttribute('aria-label', 'Quit tour');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => {
          if (popover.wrapper.querySelector('.driver-confirm-overlay')) return;

          popover.title.style.display = 'none';
          popover.description.style.display = 'none';
          popover.progress.style.display = 'none';
          popover.footer.style.display = 'none';
          closeBtn.style.display = 'none';

          const overlay = document.createElement('div');
          overlay.className = 'driver-confirm-overlay';
          overlay.innerHTML = `
            <p class="driver-confirm-msg">End the tour early?</p>
            <div class="driver-confirm-actions">
              <button class="driver-confirm-end">End tour</button>
              <button class="driver-confirm-keep">Keep going</button>
            </div>
          `;
          overlay.querySelector('.driver-confirm-end')!.addEventListener('click', () => {
            if (tourEnded) return;
            tourEnded = true;
            document.body.classList.remove('tour-hide-tasks');
            self.cleanupTourClasses();
            self.complete();
            self.api.delete('/users/me/tour-demo-tasks').subscribe(() => self.inboxStore.triggerReload());
            self.driverObj!.destroy();
          });
          overlay.querySelector('.driver-confirm-keep')!.addEventListener('click', () => {
            overlay.remove();
            popover.title.style.display = '';
            popover.description.style.display = '';
            popover.progress.style.display = '';
            popover.footer.style.display = '';
            closeBtn.style.display = '';
          });
          popover.wrapper.appendChild(overlay);
        });
        popover.wrapper.prepend(closeBtn);
      },

      onNextClick() {
        const idx = self.driverObj!.getActiveIndex() ?? 0;

        if (idx === STEP_ANIMATE_TASKS) {
          // Add body class BEFORE navigating so the inbox renders with tasks invisible from the start
          document.body.classList.add('tour-hide-tasks');
          self.router.navigate(['/inbox']).then(() => {
            self.inboxStore.triggerReload();
            setTimeout(() => {
              document.body.classList.remove('tour-hide-tasks');
              self.showTourTasks();
              setTimeout(() => self.driverObj!.moveNext(), 500);
            }, 700);
          });
          return;
        }

        if (idx === STEP_BEFORE_SETTINGS) {
          self.router.navigate(['/settings']).then(() => {
            setTimeout(() => self.driverObj!.moveNext(), 450);
          });
          return;
        }

        if (idx === STEP_BEFORE_NOTIF_TAB) {
          document.getElementById('tour-notifications-tab')?.click();
          setTimeout(() => self.driverObj!.moveNext(), 250);
          return;
        }

        if (idx === STEP_BEFORE_RESTART) {
          document.getElementById('tour-general-tab')?.click();
          setTimeout(() => self.driverObj!.moveNext(), 250);
          return;
        }

        self.driverObj!.moveNext();
      },

      onPrevClick() {
        const idx = self.driverObj!.getActiveIndex() ?? 0;

        // Going back from step 2 (demo task 1) to step 1 (My Inbox sidebar) → hide tasks again
        if (idx === STEP_ANIMATE_TASKS + 1) {
          document.body.classList.add('tour-hide-tasks');
          self.cleanupTourClasses();
          self.driverObj!.movePrevious();
          return;
        }

        // Going back from first settings step → navigate back to inbox
        if (idx === STEP_BEFORE_SETTINGS + 1) {
          self.router.navigate(['/inbox']).then(() => {
            setTimeout(() => self.driverObj!.movePrevious(), 450);
          });
          return;
        }

        // Going back from Notifications to Reminder → switch to General tab
        if (idx === STEP_BEFORE_NOTIF_TAB + 1) {
          document.getElementById('tour-general-tab')?.click();
          setTimeout(() => self.driverObj!.movePrevious(), 250);
          return;
        }

        // Going back from Restart button to Notifications → switch to Notifications tab
        if (idx === STEP_BEFORE_RESTART + 1) {
          document.getElementById('tour-notifications-tab')?.click();
          setTimeout(() => self.driverObj!.movePrevious(), 250);
          return;
        }

        self.driverObj!.movePrevious();
      },

      onDestroyStarted() {
        if (tourEnded) return;
        tourEnded = true;
        document.body.classList.remove('tour-hide-tasks');
        self.cleanupTourClasses();
        self.complete();
        self.api.delete('/users/me/tour-demo-tasks').subscribe(() => self.inboxStore.triggerReload());
        self.driverObj!.destroy();
      },
    });

    this.driverObj.drive();
  }

  private buildSteps(task1Id: string, task2Id: string): DriveStep[] {
    return [
      // ── 0: Welcome ─────────────────────────────────────────────
      {
        popover: {
          title: 'Welcome to Get Things Done',
          description: `
            <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:-4px;margin-bottom:10px">by bryan</span>
            Your team's task hub - personal inboxes, shared project spaces, rich tasks
            with priorities, assignees, due dates, subtasks, and more.
          `,
          showButtons: ['next', 'close'],
          nextBtnText: "Let's go →",
          align: 'center',
        },
      },

      // ── 1: My Inbox sidebar (Next → animate tasks in) ─────────
      {
        element: '#tour-my-inbox',
        popover: {
          title: 'My Inbox',
          description: `
            Your <strong>private</strong> to-do list - only you can see it.
            Tasks can be dragged to reorder, filtered by priority, and organized by status.
            <br><br>
            Click <strong>Next</strong> to reveal the example tasks.
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 2: Demo task 1 overview ────────────────────────────────
      {
        element: `#tour-task-${task1Id}`,
        popover: {
          title: 'Demo Task: Urgent priority',
          description: `
            The <strong style="color:#c62828">red border</strong> means this task is <strong>Urgent</strong>.
            <br><br>
            Let's walk through each part of the task row. Click <strong>Next</strong> to highlight each icon.
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 3: Advance button ──────────────────────────────────────
      {
        element: `#task-advance-${task1Id}`,
        popover: {
          title: 'Advance status',
          description: `Moves the task to the next status - <em>New → In Progress → Done</em>.`,
          side: 'right',
          align: 'center',
        },
      },

      // ── 4: Due date chip ───────────────────────────────────────
      {
        element: `#task-due-${task1Id}`,
        popover: {
          title: 'Due date',
          description: `The task's deadline. Turns <strong style="color:#c62828">red</strong> when overdue.`,
          side: 'bottom',
          align: 'start',
        },
      },

      // ── 5: Assignee chip ───────────────────────────────────────
      {
        element: `#task-assignee-${task1Id}`,
        popover: {
          title: 'Assignee',
          description: `Who's responsible for this task. Open the task to assign teammates or teams.`,
          side: 'bottom',
          align: 'start',
        },
      },

      // ── 6: Subtask chip ────────────────────────────────────────
      {
        element: `#task-subtask-${task1Id}`,
        popover: {
          title: 'Subtasks',
          description: `Number of nested sub-tasks. Open the task to add, complete, or reorder them.`,
          side: 'bottom',
          align: 'start',
        },
      },

      // ── 7: Done button ─────────────────────────────────────────
      {
        element: `#task-done-${task1Id}`,
        popover: {
          title: 'Mark as done',
          description: `Completes the task and moves it to the Done column. Click again to undo.`,
          side: 'left',
          align: 'center',
        },
      },

      // ── 8: Add subtask button ─────────────────────────────────
      {
        element: `#task-add-subtask-${task1Id}`,
        popover: {
          title: 'Add subtask',
          description: `Break a task into smaller pieces. Subtasks have their own status and can be reordered or moved to another task.`,
          side: 'left',
          align: 'center',
        },
      },

      // ── 9: Schedule button ────────────────────────────────────
      {
        element: `#task-sch-btn-${task1Id}`,
        popover: {
          title: 'Due date & recurring',
          description: `Set or change the deadline. Enable <strong>Recurring</strong> to auto-reset the task daily, weekly, or monthly after it's completed.`,
          side: 'left',
          align: 'center',
        },
      },

      // ── 10: Priority button ───────────────────────────────────
      {
        element: `#task-pri-btn-${task1Id}`,
        popover: {
          title: 'Set priority',
          description: `Choose <strong>None</strong>, <strong>Low</strong>, <strong>Medium</strong>, or <strong>Urgent</strong>. Urgent tasks get a <strong style="color:#c62828">red border</strong>; other priorities show a colored accent.`,
          side: 'left',
          align: 'center',
        },
      },

      // ── 11: Reminder button ───────────────────────────────────
      {
        element: `#task-rem-btn-${task1Id}`,
        popover: {
          title: 'Reminder',
          description: `Get notified about this specific task - in 1 day, 3 days, 1 week, or a custom date and time. Sent in-app and by email if email notifications are enabled.`,
          side: 'left',
          align: 'center',
        },
      },

      // ── 12: Delete button ─────────────────────────────────────
      {
        element: `#task-del-btn-${task1Id}`,
        popover: {
          title: 'Delete task',
          description: `Permanently removes the task and all its subtasks and comments. This cannot be undone.`,
          side: 'left',
          align: 'center',
        },
      },

      // ── 13: Demo task 2 overview ──────────────────────────────
      {
        element: `#tour-task-${task2Id}`,
        popover: {
          title: 'Demo Task: No priority',
          description: `
            No colored border — this task has <strong>no priority</strong> set.
            <br><br>
            Feel free to <strong>click it</strong> to see the full task detail view — description, comments, subtasks, attachments, and more.
            <br><br>
            <em style="color:var(--text-muted);font-size:11px">Both demo tasks are automatically deleted when the tour ends.</em>
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 14: Comment chip ──────────────────────────────────────
      {
        element: `#task-comment-${task2Id}`,
        popover: {
          title: 'Comments',
          description: `Team discussion attached to the task. Open it to read, reply, or attach files.`,
          side: 'bottom',
          align: 'start',
        },
      },

      // ── 15: Filter & sort bar ─────────────────────────────────
      {
        element: '#tour-filter-bar',
        popover: {
          title: 'Search & Sort',
          description: `
            <strong>Search</strong> tasks by keyword, and <strong>sort</strong> by due date,
            priority, or creation date. Your sort preference is saved per inbox.
          `,
          side: 'bottom',
          align: 'start',
        },
      },

      // ── 16: Priority & assignment filters ─────────────────────
      {
        element: '#tour-seg-filters',
        popover: {
          title: 'Filter by Priority & Assignment',
          description: `
            Narrow the list to tasks assigned to <strong>you</strong> or your <strong>teams</strong>.
            Priority buttons filter by urgency level - the status chips focus on one stage at a time.
          `,
          side: 'bottom',
          align: 'start',
        },
      },

      // ── 17: Status chips ──────────────────────────────────────
      {
        element: '#tour-step-chips',
        popover: {
          title: 'Status filter',
          description: `
            Click <strong>New</strong>, <strong>In Progress</strong>, or <strong>Done</strong>
            to show only tasks in that stage. The number next to each label is the live count.
            Click <strong>All</strong> to remove the filter.
          `,
          side: 'bottom',
          align: 'start',
        },
      },

      // ── 18: Team Inboxes section ─────────────────────────────
      {
        element: '#tour-inboxes-section',
        popover: {
          title: 'Team Inboxes',
          description: `
            Shared project spaces where your whole team can create, assign,
            and track tasks together. Each inbox has its own color, emoji, and member list.
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 19: All Inboxes ───────────────────────────────────────
      {
        element: '#tour-all-inboxes',
        popover: {
          title: 'All Inboxes',
          description: `
            A unified view of every task across all your shared inboxes -
            handy when you want to see everything at a glance.
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 20: Today's Tasks ─────────────────────────────────────
      {
        element: '#tour-today',
        popover: {
          title: "Today's Tasks",
          description: `
            A focused view of everything due <strong>today or earlier</strong> across all your inboxes.
            Use it each morning to see exactly what needs your attention right now.
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 21: New Inbox ─────────────────────────────────────────
      {
        element: '#tour-new-inbox',
        popover: {
          title: 'Create an Inbox',
          description: `
            Click here to create a new team inbox. Give it a name, color, and emoji -
            then assign tasks to teammates to collaborate.
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 22: Settings link (navigate to /settings on Next) ─────
      {
        element: '#tour-settings-link',
        popover: {
          title: 'Settings',
          description: `
            Let's set up your personal preferences - timezone, daily reminder time,
            and notification options.
            <br><br>
            Click <strong>Next</strong> and we'll take you there.
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 23: Timezone ──────────────────────────────────────────
      {
        element: '#tour-timezone',
        popover: {
          title: 'Your Timezone',
          description: `
            Pick your local timezone. Used to reset daily reminder counters at midnight
            and schedule your overdue digest correctly.
            <br><br><em>Change it now if needed - it saves automatically.</em>
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 24: Reminder time (click Notifications tab on Next) ───
      {
        element: '#tour-reminder',
        popover: {
          title: 'Daily Overdue Reminder',
          description: `
            Time of day to receive the consolidated overdue-task digest -
            sent in-app and by email if email is enabled.
            <br><br><em>Change it now if needed - it saves automatically.</em>
          `,
          side: 'right',
          align: 'start',
        },
      },

      // ── 25: Notifications ─────────────────────────────────────
      {
        element: '#tour-notifications',
        popover: {
          title: 'Notification Preferences',
          description: `
            Control <strong>how</strong> (in-app, toast, email) and <strong>what</strong>
            you're notified about. Changes save instantly.
            <br><br>
            Per-inbox overrides: click the bell icon next to each inbox in the sidebar.
          `,
          side: 'left',
          align: 'start',
        },
      },

      // ── 26: Restart button in Settings General (final) ────────
      {
        element: '#tour-restart-btn',
        popover: {
          title: "You're all set!",
          description: `
            That's the full tour. You can click <strong>Restart tour</strong> here anytime
            to go through it again. Your demo tasks are cleaned up automatically when the tour ends.
          `,
          side: 'left',
          align: 'center',
          nextBtnText: 'Finish ✓',
          showButtons: ['next', 'previous'],
        },
      },
    ];
  }
}
