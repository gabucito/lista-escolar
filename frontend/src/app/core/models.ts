export interface Item {
  id: string;
  catalog_id: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  note: string;
  attributes: Record<string, unknown>;
}
export interface Content {
  school: string;
  class_name: string;
  school_year: number;
  comuna: string;
  region: string;
  instructions: string;
  logo_id: string;
  items: Item[];
}
export interface PdfPreferences {
  layout: 'columns' | 'sidebar' | 'cards';
  paper: 'LETTER' | 'A4';
  color: boolean;
}
export interface User {
  id: string;
  email: string;
  display_name: string;
  preferences: Partial<PdfPreferences>;
}
export interface ListSummary {
  id: string;
  school: string;
  class_name: string;
  school_year: number;
  comuna: string;
  region: string;
  visibility: string;
  archived: boolean;
  hidden: boolean;
  current_version: number;
  votes: number;
  published_at: string;
  owner_name: string;
  role: string;
  following?: boolean;
}
export interface ListDetail {
  id: string;
  owner_id: string;
  owner_name: string;
  visibility: string;
  archived: boolean;
  hidden: boolean;
  comments_enabled: boolean;
  current_version: number;
  version: number;
  published_at: string;
  content: Content;
  role: string;
  votes: number;
  voted: boolean;
  following: boolean;
  versions: { number: number; published_at: string }[];
}
export interface Draft {
  id: string;
  content: Content;
  revision: number;
  current_version: number;
  visibility: string;
  archived: boolean;
  hidden: boolean;
  role: string;
}
export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  category_slug: string;
  category_id?: number;
  subcategory_id?: number;
  subcategory: string;
  review_status: string;
  attributes: Record<string, unknown>;
}
export type CatalogAttributeValue = string | number | boolean;
export interface CatalogFacet {
  key: string;
  name: string;
  data_type: 'text' | 'number' | 'boolean';
  unit: string | null;
  values: { value: CatalogAttributeValue; count: number }[];
}
export interface CatalogBrowseResult {
  items: CatalogItem[];
  total: number;
  offset: number;
  limit: number;
  facets: CatalogFacet[];
}
export interface CategoryAttribute {
  key: string;
  name: string;
  data_type: 'text' | 'number' | 'boolean';
  unit: string | null;
  options: string[];
  applies_to_types: string[];
  sort_order: number;
}
export interface Category {
  id: number;
  slug: string;
  name: string;
  type_attribute: string | null;
  attributes: CategoryAttribute[];
  subcategories: {
    id: number;
    slug: string;
    name: string;
    attributes?: { key: string; name: string; data_type: string; unit: string | null }[];
  }[];
}
export interface Template {
  id: string;
  name: string;
  grade: string;
  content: Content;
}
export interface Progress {
  version: number;
  items: Record<string, { checked: boolean; review: boolean }>;
  changes: { added: string[]; changed: string[]; removed: string[]; details_changed: boolean };
}
export interface Comment {
  id: string;
  body: string;
  author: string;
  user_id: string;
  created_at: string;
  deleted: boolean;
}
export const UNITS = [
  'unidad',
  'caja',
  'paquete',
  'par',
  'set',
  'hoja',
  'pliego',
  'rollo',
  'm',
  'cm',
  'L',
  'ml',
  'kg',
  'g',
];
export function emptyContent(): Content {
  return {
    school: '',
    class_name: '',
    school_year: new Date().getFullYear(),
    comuna: '',
    region: '',
    instructions: '',
    logo_id: '',
    items: [],
  };
}
export function newItem(name = '', category = 'Otros'): Item {
  return {
    id: crypto.randomUUID(),
    catalog_id: '',
    name,
    quantity: '1',
    unit: 'unidad',
    category,
    note: '',
    attributes: {},
  };
}
export function dateLabel(value: string): string {
  if (!value) return 'Sin publicar';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin fecha'
    : new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(
        date,
      );
}
export function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

export function attributeSummary(attributes: Record<string, unknown>): string {
  return Object.entries(attributes)
    .map(([key, value]) => {
      if (value && typeof value === 'object' && 'value' in value) {
        const entry = value as { name?: string; value: unknown; unit?: string };
        return `${entry.name || key}: ${typeof entry.value === 'boolean' ? (entry.value ? 'Sí' : 'No') : String(entry.value)}${entry.unit ? ' ' + entry.unit : ''}`;
      }
      return `${key}: ${String(value)}`;
    })
    .join(' · ');
}
