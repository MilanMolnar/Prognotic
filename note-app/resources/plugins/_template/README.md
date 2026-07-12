# Prognotic plugin starter

1. Copy this entire folder to `~/NoteMark/plugins/hello-plugin/`.
2. Keep `plugin.json` valid JSON, then change its `id`, name, description, and sidebar label.
3. In Prognotic, open **Settings → Manage plugins**, choose **Refresh**, and enable the plugin.
4. Edit `index.cjs`; Refresh reloads an enabled plugin when its manifest or entry timestamp changes.

The starter works as copied. Host AI returns a friendly error until the app-wide AI connection has been verified. For editor types, copy the adjacent `resources/plugins/plugin-host.d.ts` into your development project.

See [the complete plugin developer guide](../../../docs/PLUGINS.md) for the manifest, UI catalog, host API, prompt precedence, namespace rules, and troubleshooting.
