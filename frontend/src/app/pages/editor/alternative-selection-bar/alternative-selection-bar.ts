import { Component, input, output } from '@angular/core';
import { AlternativeSelection, MAX_ALTERNATIVES } from '../item-alternatives';
@Component({
  selector: 'app-alternative-selection-bar',
  templateUrl: './alternative-selection-bar.html',
  styleUrl: './alternative-selection-bar.scss',
})
export class AlternativeSelectionBar {
  readonly selection = input.required<AlternativeSelection>();
  readonly blocked = input(false);
  readonly review = output<void>();
  readonly cancelled = output<void>();
  readonly removed = output<number>();
  readonly maximum = MAX_ALTERNATIVES;
}
