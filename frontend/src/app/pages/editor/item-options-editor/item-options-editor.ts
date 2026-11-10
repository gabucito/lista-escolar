import { Component, computed, effect, input, output, signal } from '@angular/core';
import { disabled, form, FormField, maxLength, required } from '@angular/forms/signals';
import { attributeSummary, UNITS } from '../../../core/models';
import {
  AlternativeChoice,
  AlternativeDetails,
  AlternativeSelection,
  MAX_ALTERNATIVES,
  alternativeDetails,
  alternativeKey,
} from '../item-alternatives';
import { quantityIssue } from '../editor-workspace';

export interface OptionsReview {
  selection: AlternativeSelection;
  details: AlternativeDetails;
}
@Component({
  selector: 'app-item-options-editor',
  imports: [FormField],
  templateUrl: './item-options-editor.html',
  styleUrl: './item-options-editor.scss',
})
export class ItemOptionsEditor {
  readonly selection = input.required<AlternativeSelection>();
  readonly blocked = input(false);
  readonly saved = output<OptionsReview>();
  readonly back = output<OptionsReview>();
  readonly cancelled = output<void>();
  readonly options = signal<AlternativeChoice[]>([]);
  readonly details = signal<AlternativeDetails>({
    name: '',
    quantity: '1',
    unit: 'unidad',
    note: '',
  });
  readonly freeOption = signal({ name: '' });
  readonly freeFields = form(this.freeOption, (path) => {
    disabled(path, () => this.blocked());
    maxLength(path.name, 300);
  });
  readonly optionError = signal('');
  readonly maximum = MAX_ALTERNATIVES;
  readonly fields = form(this.details, (path) => {
    disabled(path, () => this.blocked());
    required(path.name);
    maxLength(path.name, 300);
    maxLength(path.note, 2000);
  });
  readonly units = UNITS;
  readonly summary = attributeSummary;
  readonly issue = computed(() => quantityIssue(this.details().quantity, this.details().unit));
  readonly valid = computed(
    () =>
      !!this.details().name.trim() &&
      this.details().name.length <= 300 &&
      this.details().note.length <= 2000 &&
      !this.issue() &&
      this.options().length > 0 &&
      !this.freeOption().name.trim(),
  );
  constructor() {
    effect(() => {
      const selected = this.selection();
      this.options.set(structuredClone(selected.options));
      this.details.set({ ...alternativeDetails(selected) });
      this.freeOption.set({ name: selected.freeOptionName || '' });
    });
  }
  remove(index: number) {
    if (!this.blocked()) this.options.update((options) => options.filter((_, i) => i !== index));
  }
  addFreeOption() {
    if (this.blocked() || this.options().length >= MAX_ALTERNATIVES) return;
    const name = this.freeOption().name.trim();
    if (!name || name.length > 300) {
      this.optionError.set('Escribe una opción de hasta 300 caracteres.');
      return;
    }
    const choice: AlternativeChoice = {
      catalog_id: '',
      name,
      attributes: {},
      category:
        this.selection().category ||
        this.selection().original?.category ||
        this.options()[0]?.category ||
        'Otros',
    };
    if (this.options().some((option) => alternativeKey(option) === alternativeKey(choice))) {
      this.optionError.set('Esa opción ya está incluida.');
      return;
    }
    this.options.update((options) => [...options, choice]);
    this.freeOption.set({ name: '' });
    this.optionError.set('');
  }
  review(): OptionsReview {
    const details = { ...this.details() };
    return {
      selection: {
        ...this.selection(),
        options: structuredClone(this.options()),
        details,
        freeOptionName: this.freeOption().name,
      },
      details,
    };
  }
  submit() {
    if (!this.blocked() && this.valid()) this.saved.emit(this.review());
  }
}
