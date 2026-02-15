/** Reverse-domain namespace for all Aurora metadata keys.
 *  Replace "com.aurora-vtt" with your actual domain. */
const PLUGIN_BASE = "com.aurora-vtt.aurora";

/** Returns a namespaced key, e.g. getPluginId("config") → "com.aurora-vtt.aurora/config" */
export function getPluginId(path: string): string {
  return `${PLUGIN_BASE}/${path}`;
}
