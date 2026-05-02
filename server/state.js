/** @format */
// ============================================================
// SHARED APP STATE
// For variables that need to be shared between index.js and route handlers
// ============================================================

export const appState = {
  analysisCooldowns: new Map(),
  getLastAnalysisTimestamp(key) {
    return this.analysisCooldowns.get(String(key)) || 0;
  },
  setLastAnalysisTimestamp(key, timestamp) {
    this.analysisCooldowns.set(String(key), timestamp);
  },
};
