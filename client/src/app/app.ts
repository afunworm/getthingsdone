import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { BUILD_TIME } from '../generated/build-time';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    <div style="
      position:fixed; bottom:8px; right:8px; z-index:99999;
      background:rgba(0,0,0,.55); color:#fff;
      font-size:10px; padding:2px 6px; border-radius:4px;
      pointer-events:none; font-family:monospace;
    ">{{ buildTime }}</div>
  `,
})
export class App {
  readonly buildTime = BUILD_TIME;
  constructor(private _theme: ThemeService) { }
}
