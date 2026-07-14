import ActivityKit

// The daily-nudge Live Activity — Noto's "keep your streak" companion. MUST stay
// byte-identical to targets/widget/Shared.swift's copy: ActivityKit matches a
// running activity to its widget UI by this type, so the app (which starts and
// updates it) and the extension (which draws it) must agree exactly.
//
// `line` is the motivational sentence, generated app-side by the same engine as
// the push notifications (src/lib/notify.ts) so the voice — and the chosen mode —
// match. The extension just renders whatever string it's handed.
struct NotoTodoAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var name: String
    var due: Int
    var todos: Int
    var streak: Int
    var line: String
    var doneToday: Int
    var totalToday: Int
  }
  var title: String
}
