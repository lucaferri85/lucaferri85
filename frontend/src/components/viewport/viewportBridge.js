/**
 * Small bridge so non-Viewport components (LeftPanel etc.) can call
 * imperative methods on the ViewportManager (load mesh, remove mesh,
 * take screenshot, ...).
 *
 * Viewport3D.jsx registers/unregisters the current manager on mount.
 */
let _manager = null;
const listeners = new Set();

export function setViewportManager(m) {
  _manager = m;
  listeners.forEach(fn => fn(m));
}

export function getViewportManager() {
  return _manager;
}

export function onViewportManagerChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
