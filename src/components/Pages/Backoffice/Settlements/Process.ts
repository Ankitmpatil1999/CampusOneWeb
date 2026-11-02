/**
 * The prototype's step-by-step "working" overlay (RP.process) for the back office's money actions:
 * the steps tick by while the request is on its way, all turn done when it succeeds, and a failure
 * marks the running step with the reason.
 */
import { ChangeDetectionStrategy, Component, input, type WritableSignal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import type { IconName } from '../../../Utils/icons';

export interface ProcessState {
  readonly title: string;
  readonly sub: string;
  readonly icon: IconName;
  readonly steps: readonly string[];
  /** The step running now; steps before it are done. */
  readonly at: number;
  readonly failed: string | null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs `work` behind the overlay; rethrows a failure after showing it on the running step. */
export async function runProcess<T>(
  state: WritableSignal<ProcessState | null>,
  o: { title: string; sub: string; icon: IconName; steps: readonly string[] },
  work: () => Promise<T>,
  failText: (e: unknown) => string,
): Promise<T> {
  state.set({ ...o, at: 0, failed: null });
  const timer = setInterval(() => {
    const s = state();
    if (s && s.at < s.steps.length - 1) state.set({ ...s, at: s.at + 1 });
  }, 230);
  try {
    const out = await work();
    clearInterval(timer);
    const s = state();
    if (s) state.set({ ...s, at: s.steps.length });
    await wait(260);
    state.set(null);
    return out;
  } catch (e) {
    clearInterval(timer);
    const s = state();
    if (s) state.set({ ...s, failed: failText(e) });
    await wait(900);
    state.set(null);
    throw e;
  }
}

@Component({
  selector: 'rp-ob-process',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (state(); as s) {
    <div class="ov fixed">
      <div class="proc" role="status" aria-live="polite">
        <div class="proc-ring"><rp-icon [name]="s.icon" [size]="26" /></div>
        <h4>{{ s.title }}</h4>
        <p class="t-xs t-muted" style="margin-top: 3px">{{ s.sub }}</p>
        <div class="proc-steps">
          @for (step of s.steps; track $index; let i = $index) {
            <div
              class="ps"
              [class.ok]="i < s.at"
              [class.run]="i === s.at && !s.failed"
              [class.bad]="i === s.at && !!s.failed"
            >
              <i></i><span>{{ i === s.at && s.failed ? s.failed : step }}</span>
            </div>
          }
        </div>
      </div>
    </div>
  }`,
})
export class ProcessOverlay {
  readonly state = input<ProcessState | null>(null);
}
