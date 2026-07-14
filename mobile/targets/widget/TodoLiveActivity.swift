import ActivityKit
import WidgetKit
import SwiftUI

// A brighter success green than Theme's notoGreen — reads on the dark activity.
private extension Color {
  static let notoSafe = Color(red: 0.51, green: 0.82, blue: 0.56)
}

@available(iOS 16.1, *)
private func nudgeProgress(_ s: NotoTodoAttributes.ContentState) -> Double {
  let total = max(s.totalToday, 1)
  return Double(min(s.doneToday, total)) / Double(total)
}

// The amber flame + streak count — the emotional hook, Duolingo-style.
@available(iOS 16.1, *)
struct StreakFlame: View {
  let streak: Int
  var suffix: String = ""
  var body: some View {
    HStack(spacing: 3) {
      Image(systemName: "flame.fill").font(.system(size: 11)).foregroundColor(.notoAmber)
      Text("\(streak)\(suffix)").font(.notoMono(12)).foregroundColor(.notoAmber)
    }
  }
}

// The lock-screen / banner presentation of the daily nudge.
@available(iOS 16.1, *)
struct LockScreenNudgeView: View {
  let context: ActivityViewContext<NotoTodoAttributes>
  var body: some View {
    let s = context.state
    let done = s.due + s.todos == 0
    VStack(alignment: .leading, spacing: 11) {
      HStack {
        HStack(spacing: 7) {
          NotoDiamond(size: 11)
          Text("\(s.name), keep it going").font(.notoMono(12)).foregroundColor(.white.opacity(0.9))
        }
        Spacer()
        StreakFlame(streak: s.streak, suffix: "-day")
      }
      Text(s.line)
        .font(.notoSerif(17)).italic()
        .foregroundColor(.white)
        .lineLimit(3)
        .fixedSize(horizontal: false, vertical: true)
      ProgressView(value: nudgeProgress(s)).tint(done ? Color.notoSafe : .notoAmber)
      HStack {
        if done {
          Text("streak safe").font(.notoMono(10)).foregroundColor(.notoSafe)
        } else {
          Text("\(s.due) reviews · \(s.todos) todos").font(.notoMono(10)).foregroundColor(.white.opacity(0.5))
        }
        Spacer()
        Text("\(s.doneToday) of \(s.totalToday) done").font(.notoMono(10)).foregroundColor(.white.opacity(0.5))
      }
    }
    .padding(16)
  }
}

@available(iOS 16.1, *)
struct NotoTodoLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: NotoTodoAttributes.self) { context in
      LockScreenNudgeView(context: context)
        .activityBackgroundTint(Color.notoInk)
        .activitySystemActionForegroundColor(Color.notoAmber)
    } dynamicIsland: { context in
      let s = context.state
      let done = s.due + s.todos == 0
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            NotoDiamond(size: 10)
            Text(s.name).font(.notoMono(12)).foregroundColor(.white.opacity(0.85))
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          StreakFlame(streak: s.streak)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(s.line)
            .font(.notoSerif(14)).italic()
            .foregroundColor(.white.opacity(0.92))
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .padding(.top, 2)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 6) {
            ProgressView(value: nudgeProgress(s)).tint(done ? Color.notoSafe : .notoAmber)
            HStack {
              Text(done ? "streak safe" : "\(s.due + s.todos) to clear")
                .font(.notoSerif(13)).foregroundColor(done ? Color.notoSafe : .white)
              Spacer()
              Text("\(s.doneToday) of \(s.totalToday) done").font(.notoMono(10)).foregroundColor(.white.opacity(0.5))
            }
          }
        }
      } compactLeading: {
        HStack(spacing: 3) {
          Image(systemName: "flame.fill").font(.system(size: 11)).foregroundColor(.notoAmber)
          Text("\(s.streak)").font(.notoMono(13, weight: .semibold)).foregroundColor(.notoAmber)
        }
      } compactTrailing: {
        if done {
          Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundColor(.notoSafe)
        } else {
          Text("\(s.due + s.todos)").font(.notoMono(14, weight: .semibold)).foregroundColor(.white)
        }
      } minimal: {
        Text("\(s.due + s.todos)").font(.notoMono(13, weight: .semibold)).foregroundColor(done ? Color.notoSafe : .notoAmber)
      }
      .keylineTint(Color.notoAmber)
    }
  }
}
