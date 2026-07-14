import Foundation
import ActivityKit

// The App Group that lets the app and this extension share storage. Must match
// app.json (ios.entitlements) and modules/noto-widgets/ios/.
let kNotoAppGroup = "group.com.noto.vault"
let kNotoSnapshotKey = "snapshot"

// The snapshot the RN app writes via the noto-widgets module (see
// src/widgetSync.ts). Everything the widgets show comes from here.
struct NotoSnapshot: Codable {
  var reviewsDue: Int
  var todosOpen: Int
  var todos: [String]
  var streak: Int
  var nextLabel: String
  var quote: String
  var quoteAuthor: String
  var doneToday: Int
  var totalToday: Int

  static let placeholder = NotoSnapshot(
    reviewsDue: 7,
    todosOpen: 4,
    todos: ["Draft the Q3 memo", "Reply to Lena", "Outline the attention paper"],
    streak: 12,
    nextLabel: "next in 3h",
    quote: "We are what we repeatedly do.",
    quoteAuthor: "Will Durant",
    doneToday: 3,
    totalToday: 7
  )
}

func loadNotoSnapshot() -> NotoSnapshot {
  guard
    let defaults = UserDefaults(suiteName: kNotoAppGroup),
    let data = defaults.data(forKey: kNotoSnapshotKey),
    let snap = try? JSONDecoder().decode(NotoSnapshot.self, from: data)
  else { return .placeholder }
  return snap
}

// Live Activity attributes. MUST stay byte-identical to the copy in
// modules/noto-widgets/ios/NotoReviewAttributes.swift — ActivityKit matches the
// activity by this type across the app and extension.
struct NotoReviewAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var remaining: Int
    var total: Int
    var quote: String
    var streak: Int
  }
  var title: String
}

// The daily-nudge Live Activity. MUST stay byte-identical to the copy in
// modules/noto-widgets/ios/NotoTodoAttributes.swift. `line` is generated app-side
// by the notify engine (same voice as the push notifications).
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
