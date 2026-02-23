/** Base namespace for all Aurora metadata keys, matching the hosting URL. */
const PLUGIN_BASE = "https://aurora-0nm6.onrender.com";

/** Returns a namespaced key, e.g. getPluginId("config") → "https://aurora-0nm6.onrender.com/config" */
export function getPluginId(path: string): string {
  return `${PLUGIN_BASE}/${path}`;
}
