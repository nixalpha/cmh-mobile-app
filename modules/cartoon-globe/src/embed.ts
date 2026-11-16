import { Globe } from '../vendor/globe/globe';
import { MAX_RANGE } from '../vendor/globe/controls';
import { isGlobeSync, landmarkRange, type GlobeEvent, type GlobeLandmark, type GlobePlace } from '../../../src/lib/globe-bridge';

// Landmark pins only make sense once the camera is over the city.
const LANDMARK_MAX_RANGE = 6e4;
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
let landmarks: readonly GlobeLandmark[] = [];
let landmarkKey = '';
let landmarkId: string | undefined;
let range = HOME.range;
// True once the user moves the camera themselves; late landmark data must not pull it back.
let interacted = false;
const landmarkButtons = new Map<string, HTMLButtonElement>();
const labels: { x: number; y: number }[] = [];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function updateMarkers() {
  if (!globe) return;
  for (const place of places) {
    const button = buttons.get(place._id)!;
    const point = globe.projectPlace(place.lat, place.lng);
    if (button.hidden !== !point) button.hidden = !point;
    if (point) button.style.transform = `translate(${point.x - 22}px, ${point.y - 44}px)`;
    button.classList.toggle('selected', selectedId === place._id);
  }
  const shown: { button: HTMLButtonElement; x: number; y: number }[] = [];
  for (const landmark of landmarks) {
    const button = landmarkButtons.get(landmark._id)!;
    const point = range <= LANDMARK_MAX_RANGE ? globe.projectPlace(landmark.lat, landmark.lng) : null;
    if (button.hidden !== !point) button.hidden = !point;
    if (!point) continue;
    button.style.transform = `translate(${point.x - 22}px, ${point.y - 22}px)`;
    button.classList.toggle('selected', landmark._id === landmarkId);
    // The highlighted landmark claims its name first.
    if (landmark._id === landmarkId) shown.unshift({ button, ...point });
    else shown.push({ button, ...point });
  }
  // Names sit just under their pin. Landmarks arrive most notable first: keep those names
  // and drop any that would cover another pin or an earlier name.
  labels.length = 0;
  for (const pin of shown) {
    const crowded = labels.some((label) => Math.abs(label.x - pin.x) < 100 && Math.abs(label.y - pin.y) < 26)
      || shown.some((other) => other !== pin && Math.abs(other.x - pin.x) < 64 && other.y - pin.y > 4 && other.y - pin.y < 50);
    pin.button.classList.toggle('quiet', crowded);
    if (!crowded) labels.push(pin);
  }
}

try {
  // Keep the reference renderer, permanently locked to cartoon.
  globe = new Globe(mount, HOME, {
    layer: 'satellite', labels: false, buildings: true,
    atmosphere: true, cartoon: true, photoreal: false, exaggeration: 1,
  });
  globe.onHud = (hud) => {
    range = hud.view.range;
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
    landmarks = selected ? data.landmarks ?? [] : [];
    const landmarkIds = new Set(landmarks.map((landmark) => landmark._id));
    for (const [id, button] of landmarkButtons) if (!landmarkIds.has(id)) { button.remove(); landmarkButtons.delete(id); }
    for (const landmark of landmarks) {
      let button = landmarkButtons.get(landmark._id);
      if (!button) {
        button = document.createElement('button');
        button.className = 'landmark';
        button.type = 'button';
        button.hidden = true;
        button.innerHTML = '<span class="pin" aria-hidden="true">★</span><span class="name"></span>';
        button.addEventListener('click', () => send({ type: 'landmark', id: landmark._id }));
        landmarkButtons.set(landmark._id, button);
        markers.append(button);
      }
      button.setAttribute('aria-label', `Open ${landmark.name}`);
      button.querySelector('.name')!.textContent = landmark.name;
    }
    const focused = landmarks.find((landmark) => landmark._id === data.landmarkId);
    landmarkId = focused?._id;
    const refocus = !!selected && (data.focusRevision !== focusRevision || selectedId !== previousSelectedId);
    if (refocus) interacted = false;
    const key = selected && landmarks.length > 0 ? `${selected._id}:${landmarks.map((landmark) => landmark._id).join()}` : '';
    // Landmarks load after the flight to their city starts; widen the view to frame them when they arrive.
    const arrived = key !== '' && key !== landmarkKey && !interacted && !focused;
    landmarkKey = key;
    if (selected && (refocus || arrived)) {
      const view = focused
        ? { lat: focused.lat, lon: focused.lng, range: 1500, heading: 0, tilt: 50 }
        : selected.markerKind
          ? { lat: selected.lat, lon: selected.lng, range: Math.max(5000, (selected.accuracy ?? 0) * 6), heading: 0, tilt: 0 }
          : { lat: selected.lat, lon: selected.lng, range: landmarkRange(selected, landmarks), heading: 0, tilt: 50 };
      if (refocus || globe.controls.destination) globe.controls.flyTo(view, reducedMotion() ? 0.01 : undefined, 'cinematic');
      else globe.controls.flyTo(view, reducedMotion() ? 0.01 : 0.9);
    }
    focusRevision = data.focusRevision;
    if ((data.zoomOutRevision ?? 0) !== zoomOutRevision) {
      globe.controls.flyTo(HOME, reducedMotion() ? 0.01 : 1.8);
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
  mount.addEventListener('pointerdown', () => { interacted = true; send({ type: 'interact' }); });
  mount.addEventListener('wheel', () => { interacted = true; }, { passive: true });
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
