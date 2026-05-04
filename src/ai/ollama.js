// src/ai/ollama.js
//
// Local Ollama integration.
//
// What this is: the bridge between the atlas UI and a self-hosted
// Ollama instance running on the user's machine. It exposes a small
// API (ping, complete, summarizeChunked) that other modules call when
// they want AI-generated text — timeline summaries, country
// comparisons, etc.
//
// Why local: no API costs, no data leaves the user's machine, no API
// keys to manage. Trade-off: AI features only work when the user is on
// a machine that can reach their Ollama instance. The atlas degrades
// gracefully without it.
//
// CORS: Ollama refuses cross-origin requests by default. To use this
// from a deployed site (e.g. *.github.io), the user must run Ollama
// with OLLAMA_ORIGINS set to allow the site's origin. See docs/SETUP.md
// (to be written in a later section) for the user-facing instructions.
//
// In Section 1 this file only exposes ping(), used to detect whether
// Ollama is reachable so the UI can disable AI features when it's not.
// The actual completion and chunked-summarization functions arrive in
// the section that introduces AI-powered timeline summarization.

const DEFAULT_ENDPOINT = "http://localhost:11434";
const DEFAULT_MODEL = "gemma3:12b";

/**
 * Get the user's configured Ollama endpoint and model. Stored in
 * localStorage so settings persist across page loads. Defaults match
 * a stock Ollama install with the model the user already has loaded.
 *
 * @returns {{ endpoint: string, model: string }}
 */
export function getConfig() {
  return {
    endpoint:
      localStorage.getItem("atlas.ollama.endpoint") || DEFAULT_ENDPOINT,
    model: localStorage.getItem("atlas.ollama.model") || DEFAULT_MODEL,
  };
}

/**
 * Update the saved Ollama endpoint and/or model.
 *
 * @param {{ endpoint?: string, model?: string }} patch
 */
export function setConfig(patch) {
  if (patch.endpoint) {
    localStorage.setItem("atlas.ollama.endpoint", patch.endpoint);
  }
  if (patch.model) {
    localStorage.setItem("atlas.ollama.model", patch.model);
  }
}

/**
 * Probe the configured Ollama endpoint to see if it's reachable and
 * has the configured model loaded.
 *
 * Used to enable/disable AI features in the UI. Cheap enough to call
 * on app startup; cache the result on `state.aiAvailable` rather than
 * pinging on every interaction.
 *
 * @returns {Promise<{ ok: boolean, reason?: string, version?: string }>}
 */
export async function ping() {
  const { endpoint } = getConfig();
  try {
    // /api/tags lists installed models. If this returns 200, Ollama is
    // up and reachable; if not, we know to disable AI features.
    const res = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      // CORS-safe: this is a simple GET with no custom headers.
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, models: data.models?.map((m) => m.name) ?? [] };
  } catch (err) {
    // Network error, CORS rejection, or DNS failure. We don't try to
    // distinguish — from the UI's perspective, all of these mean
    // "AI not available right now."
    return { ok: false, reason: err.message };
  }
}
