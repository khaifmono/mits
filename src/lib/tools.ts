import raw from '../../data/tools.json';

export const CATEGORIES = [
  'PaaS & Containers',
  'Identity & Auth',
  'Observability & Uptime',
  'Storage & Sync',
  'Developer Tools',
  'Local AI',
  'Office & Knowledge',
] as const;

export const INDEPENDENCE_LEVELS = [
  '100% Sovereign',
  'Federated',
  'Open Core',
] as const;

export const RESOURCE_REQUIREMENTS = [
  'Light (<512MB RAM)',
  'Medium (1-2GB RAM)',
  'Heavy (4GB+ RAM)',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type IndependenceLevel = (typeof INDEPENDENCE_LEVELS)[number];
export type ResourceRequirement = (typeof RESOURCE_REQUIREMENTS)[number];

export interface Tool {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: Category;
  alternativeTo: string[];
  repoUrl: string | null;
  siteUrl: string;
  license: string | null;
  independenceLevel: IndependenceLevel;
  resourceRequirement: ResourceRequirement;
  featured: boolean;
  dockerCompose: string | null;
  addedAt: string; // ISO date, drives "Recently Added" sort
  independence?: {
    dataFormat: string;
    telemetry: string;
    offline: string;
  };
}

export const tools = raw as unknown as Tool[];

/** Compact labels for cards/badges. */
export const RESOURCE_SHORT: Record<ResourceRequirement, string> = {
  'Light (<512MB RAM)': 'Light',
  'Medium (1-2GB RAM)': 'Medium',
  'Heavy (4GB+ RAM)': 'Heavy',
};

/** Higher = more independent. Drives the "Independence" sort. */
export const INDEPENDENCE_SCORE: Record<IndependenceLevel, number> = {
  '100% Sovereign': 3,
  Federated: 2,
  'Open Core': 1,
};

export function independenceScore(level: IndependenceLevel): number {
  return INDEPENDENCE_SCORE[level] ?? 0;
}

/** Search corpus: name, tagline, description, category, replaced SaaS, license. */
export function searchKeywords(t: Tool): string {
  return [
    t.name,
    t.tagline,
    t.description,
    t.category,
    t.independenceLevel,
    t.license ?? '',
    ...t.alternativeTo,
  ]
    .join(' ')
    .toLowerCase();
}

export const LICENSES: string[] = [
  ...new Set(tools.map((t) => t.license).filter((l): l is string => !!l)),
].sort();
