import type { GlobePlace } from '@/lib/globe-bridge';

export type GlobeProps = {
  active: boolean;
  places: readonly GlobePlace[];
  selectedId?: string;
  focusRevision?: number;
  zoomOutRevision?: number;
  onSelectPlace?: (id: string) => void;
};
