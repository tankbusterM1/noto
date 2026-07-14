import ExpoModulesCore
import WidgetKit
import ActivityKit

// The app-side bridge. JS calls these to (1) hand the widgets fresh data through
// the App Group, (2) reload their timelines, and (3) drive the review Live
// Activity. All ActivityKit calls are guarded for iOS 16.1+ and the 16.2 API split.
public class NotoWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotoWidgets")

    // Write the snapshot the widgets read, then ask them to redraw.
    Function("setSnapshot") { (json: String) in
      let defaults = UserDefaults(suiteName: "group.com.noto.vault")
      defaults?.set(json.data(using: .utf8), forKey: "snapshot")
      if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
    }

    Function("liveActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.1, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
      return false
    }

    // Start a review Live Activity; returns its id (or nil if unavailable).
    Function("startReview") { (title: String, total: Int, remaining: Int, quote: String, streak: Int) -> String? in
      guard #available(iOS 16.1, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      let attributes = NotoReviewAttributes(title: title)
      let state = NotoReviewAttributes.ContentState(remaining: remaining, total: total, quote: quote, streak: streak)
      do {
        let activity: Activity<NotoReviewAttributes>
        if #available(iOS 16.2, *) {
          activity = try Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: nil), pushType: nil)
        } else {
          activity = try Activity.request(attributes: attributes, contentState: state, pushType: nil)
        }
        return activity.id
      } catch {
        return nil
      }
    }

    Function("updateReview") { (remaining: Int, total: Int, quote: String, streak: Int) in
      guard #available(iOS 16.1, *) else { return }
      let state = NotoReviewAttributes.ContentState(remaining: remaining, total: total, quote: quote, streak: streak)
      Task {
        for activity in Activity<NotoReviewAttributes>.activities {
          if #available(iOS 16.2, *) {
            await activity.update(ActivityContent(state: state, staleDate: nil))
          } else {
            await activity.update(using: state)
          }
        }
      }
    }

    Function("endReview") {
      guard #available(iOS 16.1, *) else { return }
      Task {
        for activity in Activity<NotoReviewAttributes>.activities {
          if #available(iOS 16.2, *) {
            await activity.end(nil, dismissalPolicy: .immediate)
          } else {
            await activity.end(dismissalPolicy: .immediate)
          }
        }
      }
    }

    // Start the daily-nudge Live Activity; returns its id (or nil if unavailable).
    Function("startTodos") { (title: String, name: String, due: Int, todos: Int, streak: Int, line: String, doneToday: Int, totalToday: Int) -> String? in
      guard #available(iOS 16.1, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      let attributes = NotoTodoAttributes(title: title)
      let state = NotoTodoAttributes.ContentState(name: name, due: due, todos: todos, streak: streak, line: line, doneToday: doneToday, totalToday: totalToday)
      do {
        let activity: Activity<NotoTodoAttributes>
        if #available(iOS 16.2, *) {
          activity = try Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: nil), pushType: nil)
        } else {
          activity = try Activity.request(attributes: attributes, contentState: state, pushType: nil)
        }
        return activity.id
      } catch {
        return nil
      }
    }

    Function("updateTodos") { (name: String, due: Int, todos: Int, streak: Int, line: String, doneToday: Int, totalToday: Int) in
      guard #available(iOS 16.1, *) else { return }
      let state = NotoTodoAttributes.ContentState(name: name, due: due, todos: todos, streak: streak, line: line, doneToday: doneToday, totalToday: totalToday)
      Task {
        for activity in Activity<NotoTodoAttributes>.activities {
          if #available(iOS 16.2, *) {
            await activity.update(ActivityContent(state: state, staleDate: nil))
          } else {
            await activity.update(using: state)
          }
        }
      }
    }

    Function("endTodos") {
      guard #available(iOS 16.1, *) else { return }
      Task {
        for activity in Activity<NotoTodoAttributes>.activities {
          if #available(iOS 16.2, *) {
            await activity.end(nil, dismissalPolicy: .immediate)
          } else {
            await activity.end(dismissalPolicy: .immediate)
          }
        }
      }
    }
  }
}
