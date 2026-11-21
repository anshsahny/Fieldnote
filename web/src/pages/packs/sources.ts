import sourcesFile from '../../../../content/sources.json';

export interface ManualSource {
  id: string;
  brand: string;
  family: string;
  title: string;
  url: string;
  localFile?: string;
  pageCount?: number;
  diagnosticPages: string;
}

export const MANUAL_SOURCES = (sourcesFile as { sources: ManualSource[] }).sources;
