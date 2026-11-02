/**
 * A vendor merchant's approved assets on the web (client 2026-10-13; PAY-015): what the school has
 * approved the vendor to be paid against — each asset with its type, description and group.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { problemText } from '../Structure/academic-format';
import { BusinessApi, type Asset } from './business.api';

@Component({
  selector: 'rp-business-assets',
  imports: [Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head
      title="Approved assets"
      sub="The assets the school has approved you to be paid against."
    >
      <label class="search">
        <rp-icon name="search" [size]="16" />
        <input
          type="search"
          id="ba-q"
          placeholder="Name, type or group"
          aria-label="Search assets"
          autocomplete="off"
          [value]="q()"
          (input)="q.set($any($event.target).value)"
        />
      </label>
    </rp-page-head>

    @if (error()) {
      <div class="note tone-bad" role="alert" id="ba-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (!items()) {
      <div class="card pad"><div class="sk" style="height: 220px; border-radius: 16px"></div></div>
    } @else {
      <div class="tbl-wrap">
        <table class="tbl" id="ba-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>Group</th>
            </tr>
          </thead>
          <tbody>
            @for (a of shown(); track a.id) {
              <tr>
                <td>
                  <b class="t-sb">{{ a.name }}</b>
                  @if (a.description) {
                    <div class="cell-s">{{ a.description }}</div>
                  }
                </td>
                <td>{{ typeLabel[a.type] ?? a.type }}</td>
                <td>{{ a.group?.name ?? '—' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="3">
                  <rp-empty
                    icon="box"
                    [title]="items()!.length ? 'No assets match' : 'No approved assets yet'"
                    [text]="
                      items()!.length
                        ? 'Try another word.'
                        : 'The school office approves the assets you supply. They appear here once approved.'
                    "
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </div>`,
})
export class BusinessAssets implements OnInit {
  private readonly api = inject(BusinessApi);
  protected readonly typeLabel: Readonly<Record<string, string>> = {
    PHYSICAL: 'Physical',
    DIGITAL: 'Digital',
    SERVICE: 'Service',
    OTHER: 'Other',
  };
  protected readonly items = signal<readonly Asset[] | null>(null);
  protected readonly error = signal('');
  protected readonly q = signal('');
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return (this.items() ?? []).filter(
      (a) => !q || `${a.name} ${a.type} ${a.group?.name ?? ''}`.toLowerCase().includes(q),
    );
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    try {
      this.items.set((await this.api.assets()).items);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    }
  }
}
