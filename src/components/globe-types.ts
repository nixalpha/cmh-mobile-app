import type { GlobeLandmark, GlobePlace } from '@/lib/globe-bridge';

export type GlobeProps = {
  active: boolean;
  places: readonly GlobePlace[];
  selectedId?: string;
  /** Landmarks of the selected place; shown as tappable pins when zoomed into it. */
  landmarks?: readonly GlobeLandmark[];
  focusRevision?: number;
  zoomOutRevision?: number;
  /** One of `landmarks` to fly to and highlight. */
  selectedLandmarkId?: string;
  onSelectPlace?: (id: string) => void;
  onSelectLandmark?: (id: string) => void;
};
