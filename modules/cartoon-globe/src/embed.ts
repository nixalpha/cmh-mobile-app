import { Globe } from '../vendor/globe/globe';
import { MAX_RANGE } from '../vendor/globe/controls';
import { isGlobeSync, type GlobeEvent, type GlobePlace } from '../../../src/lib/globe-bridge';

const HOME = { lat: 24, lon: 10, range: MAX_RANGE, heading: 0, tilt: 0 };
const mount = document.getElementById('map')!;
const markers = document.getElementById('markers')!;
const scope = window as unknown as {
  ReactNativeWebView?: { postMessage(message: string): void };
  receiveGlobeMessage?: (message: unknown) => void;
};
function send(message: GlobeEvent) {
  if (scope.ReactNativeWebView) scope.ReactNativeWebView.postMessage(JSON.stringify(message));
  else window.parent.postMessage(message, '*');
}

let globe: Globe | undefined;
let places: readonly GlobePlace[] = [];
let selectedId: string | undefined;
let focusRevision = -1;
let zoomOutRevision = 0;
let active = true;
let disposed = false;
const buttons = new Map<string, HTMLButtonElement>();

function updateMarkers() {
  if (!globe) return;
  for (const place of places) {
    const button = buttons.get(place._id)!;
    const point = globe.projectPlace(place.lat, place.lng);
    if (button.hidden !== !point) button.hidden = !point;
    if (point) button.style.transform = `translate(${point.x - 22}px, ${point.y - 44}px)`;
    button.classList.toggle('selected', selectedId === place._id);
  }
}

try {
  // Keep the reference renderer, permanently locked to cartoon.
  globe = new Globe(mount, HOME, {
    layer: 'satellite', labels: false, buildings: true,
    atmosphere: true, cartoon: true, photoreal: false, exaggeration: 1,
  });
  globe.onHud = (hud) => {
    const range = hud.view.range;
    markers.classList.toggle('overview', range > 3e5);
    mount.dataset.range = String(range);
    mount.dataset.latitude = String(hud.view.lat);
    mount.dataset.longitude = String(hud.view.lon);
  };
  globe.onFrame = updateMarkers;
  scope.receiveGlobeMessage = (data) => {
    if (!isGlobeSync(data) || disposed || !globe) return;
    places = data.places;
    const previousSelectedId = selectedId;
    selectedId = data.selectedId;
    const ids = new Set(places.map((place) => place._id));
    for (const [id, button] of buttons) if (!ids.has(id)) { button.remove(); buttons.delete(id); }
    for (const place of places) {
      let button = buttons.get(place._id);
      if (!button) {
        button = document.createElement('button');
        button.className = 'place';
        button.type = 'button';
        button.innerHTML = '<span class="town" aria-hidden="true">▥</span><span class="name"></span>';
        button.addEventListener('click', () => send({ type: 'select', id: place._id }));
        buttons.set(place._id, button);
        markers.append(button);
      }
      button.classList.toggle('friend', place.markerKind === 'friend');
      button.classList.toggle('self', place.markerKind === 'self');
      button.querySelector('.town')!.textContent = place.markerKind === 'self' ? '●' : place.markerKind === 'friend' ? place.initials ?? '●' : '▥';
      button.setAttribute('aria-label', `${place.markerKind ? 'Locate' : 'Explore'} ${place.name}`);
      button.setAttribute('aria-pressed', String(place._id === selectedId));
      button.querySelector('.name')!.textContent = place.name;
    }
    const selected = places.find((place) => place._id === selectedId);
    if (selected && (data.focusRevision !== focusRevision || selectedId !== previousSelectedId)) {
      globe.controls.flyTo({ lat: selected.lat, lon: selected.lng, range: selected.markerKind ? Math.max(5000, (selected.accuracy ?? 0) * 6) : 1800, heading: 0, tilt: selected.markerKind ? 0 : 50 },
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.01 : undefined, 'cinematic');
    }
    focusRevision = data.focusRevision;
    if ((data.zoomOutRevision ?? 0) !== zoomOutRevision) {
      globe.controls.flyTo(HOME, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.01 : 1.8);
      zoomOutRevision = data.zoomOutRevision ?? 0;
    }
    active = data.active;
    globe.setActive(active && !document.hidden);
    updateMarkers();
  };
  window.addEventListener('message', (event) => {
    if (event.source === window.parent) scope.receiveGlobeMessage?.(event.data);
  });
  document.addEventListener('visibilitychange', () => globe?.setActive(active && !document.hidden));
  mount.addEventListener('pointerdown', () => send({ type: 'interact' }));
  mount.querySelector('canvas')!.addEventListener('webglcontextlost', (event) => {
    if (disposed) return;
    event.preventDefault();
    send({ type: 'error', message: 'The map lost its graphics connection. Reload to continue.' });
  });
  window.addEventListener('pagehide', () => { disposed = true; globe?.dispose(); });
  send({ type: 'ready' });
} catch {
  globe?.dispose();
  send({ type: 'error', message: 'This device could not start the 3D map. Try reloading.' });
}
