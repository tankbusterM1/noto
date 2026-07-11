import ActivityKit

// MUST stay byte-identical to targets/widget/Shared.swift's copy — ActivityKit
// matches a running activity to its widget UI by this type, so the app (which
// starts/updates it here) and the extension (which draws it) must agree exactly.
struct NotoReviewAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var remaining: Int
    var total: Int
    var quote: String
    var streak: Int
  }
  var title: String
}
