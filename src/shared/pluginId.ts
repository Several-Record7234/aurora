/** Base namespace for all Aurora metadata keys (OBR reverse-domain format). */
const PLUGIN_BASE = "com.several-record.aurora";

/** Returns a namespaced key, e.g. getPluginId("config") → "com.several-record.aurora/config" */
export function getPluginId(path: string): string {
  return `${PLUGIN_BASE}/${path}`;
}
