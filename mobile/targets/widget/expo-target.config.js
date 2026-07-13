/** @type {import('@bacons/apple-targets').Config} */
// Declares an iOS Widget Extension target that @bacons/apple-targets adds to the
// Xcode project during `expo prebuild`. It compiles every .swift file in this
// folder (the WidgetKit widgets + the ActivityKit Live Activity) and shares data
// with the app through the App Group below — which MUST match app.json and the
// noto-widgets module's group id.
module.exports = {
  type: 'widget',
  name: 'NotoWidgets',
  deploymentTarget: '16.1',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.noto.vault'],
  },
  // Named colors surface in the asset catalog; the SwiftUI code uses literal
  // Color values (Theme.swift) so this is just the accent for the target icon.
  colors: {
    $accent: '#b87a26',
  },
};
