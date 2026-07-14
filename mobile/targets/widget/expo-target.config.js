/** @type {import('@bacons/apple-targets').Config} */
// Declares an iOS Widget Extension target that @bacons/apple-targets adds to the
// Xcode project during `expo prebuild`. It compiles every .swift file in this
// folder (the WidgetKit widgets + the ActivityKit Live Activity).
//
// FREE-ACCOUNT BUILD: no App Group entitlement. A free Apple personal team can't
// provision App Groups, and requesting one makes the widget extension fail to
// sign. The Live Activity + Dynamic Island don't need it — ActivityKit carries
// their data directly (see modules/noto-widgets) — so they work free. The only
// cost is that the HOME-SCREEN widgets can't read the app's live data (they show
// the placeholder snapshot). To restore live home-widget data on a PAID account,
// add back — here AND in app.json (ios.entitlements):
//   entitlements: { 'com.apple.security.application-groups': ['group.com.noto.vault'] },
module.exports = {
  type: 'widget',
  name: 'NotoWidgets',
  deploymentTarget: '16.1',
  // Named colors surface in the asset catalog; the SwiftUI code uses literal
  // Color values (Theme.swift) so this is just the accent for the target icon.
  colors: {
    $accent: '#b87a26',
  },
};
