import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.1, *)
private func reviewProgress(_ s: NotoReviewAttributes.ContentState) -> Double {
  let total = max(s.total, 1)
  return Double(min(total - s.remaining, total)) / Double(total)
}

// The lock-screen / banner presentation of a running review session.
@available(iOS 16.1, *)
struct LockScreenReviewView: View {
  let context: ActivityViewContext<NotoReviewAttributes>
  var body: some View {
    let s = context.state
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        HStack(spacing: 7) {
          NotoDiamond(size: 11)
          Text("Review session").font(.notoMono(12)).foregroundColor(.white.opacity(0.9))
        }
        Spacer()
        Text("re-inking memory").font(.notoMono(10)).foregroundColor(.white.opacity(0.45))
      }
      HStack(alignment: .bottom, spacing: 12) {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text("\(s.remaining)").font(.notoSerif(40)).foregroundColor(.white)
          Text("left").font(.notoMono(13)).foregroundColor(.white.opacity(0.5))
        }
        Text("“\(s.quote)”")
          .font(.notoSerif(13)).italic()
          .foregroundColor(.white.opacity(0.82))
          .lineLimit(2)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      ProgressView(value: reviewProgress(s)).tint(.notoAmber)
      HStack {
        Text("\(max(s.total - s.remaining, 0)) of \(s.total) reviewed")
        Spacer()
        Text("\(s.streak)-day streak")
      }
      .font(.notoMono(10)).foregroundColor(.white.opacity(0.5))
    }
    .padding(16)
  }
}

@available(iOS 16.1, *)
struct NotoReviewLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: NotoReviewAttributes.self) { context in
      LockScreenReviewView(context: context)
        .activityBackgroundTint(Color.notoInk)
        .activitySystemActionForegroundColor(Color.notoAmber)
    } dynamicIsland: { context in
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            NotoDiamond(size: 10)
            Text("Review").font(.notoMono(12)).foregroundColor(.white.opacity(0.85))
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text("\(s.remaining) of \(s.total)")
            .font(.notoMono(12)).foregroundColor(.white.opacity(0.6))
        }
        DynamicIslandExpandedRegion(.center) {
          Text("“\(s.quote)”")
            .font(.notoSerif(14)).italic()
            .foregroundColor(.white.opacity(0.9))
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .padding(.top, 2)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 6) {
            ProgressView(value: reviewProgress(s)).tint(.notoAmber)
            HStack {
              Text("\(s.remaining) left").font(.notoSerif(13)).foregroundColor(.white)
              Spacer()
              Text("\(s.streak)-day streak").font(.notoMono(10)).foregroundColor(.white.opacity(0.5))
            }
          }
        }
      } compactLeading: {
        NotoDiamond(size: 12)
      } compactTrailing: {
        Text("\(s.remaining)").font(.notoMono(14, weight: .semibold)).foregroundColor(.white)
      } minimal: {
        Text("\(s.remaining)").font(.notoMono(13, weight: .semibold)).foregroundColor(.notoAmber)
      }
      .keylineTint(Color.notoAmber)
    }
  }
}
