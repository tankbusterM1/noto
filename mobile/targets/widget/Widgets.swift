import WidgetKit
import SwiftUI

// MARK: - Timeline

struct NotoEntry: TimelineEntry {
  let date: Date
  let snap: NotoSnapshot
}

struct NotoProvider: TimelineProvider {
  func placeholder(in context: Context) -> NotoEntry { NotoEntry(date: Date(), snap: .placeholder) }
  func getSnapshot(in context: Context, completion: @escaping (NotoEntry) -> Void) {
    completion(NotoEntry(date: Date(), snap: loadNotoSnapshot()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<NotoEntry>) -> Void) {
    let entry = NotoEntry(date: Date(), snap: loadNotoSnapshot())
    // The app reloads timelines the moment data changes (WidgetCenter), so this
    // hourly cadence is just a safety net for the "next in Xh" countdown.
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// The signature memory-decay curve.
struct MemoryCurve: Shape {
  func path(in rect: CGRect) -> Path {
    var p = Path()
    let w = rect.width, h = rect.height
    p.move(to: CGPoint(x: 0, y: h * 0.78))
    p.addCurve(to: CGPoint(x: w, y: h * 0.08),
               control1: CGPoint(x: w * 0.38, y: h * 0.66),
               control2: CGPoint(x: w * 0.62, y: h * 0.12))
    return p
  }
}

// iOS 17 wants the fill declared as a container background; earlier iOS uses a
// plain background. This keeps one call site for both.
extension View {
  @ViewBuilder func notoWidgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(color, for: .widget)
    } else {
      background(color)
    }
  }
}

// MARK: - Home views

struct ReviewsSmallView: View {
  let snap: NotoSnapshot
  var body: some View {
    ZStack(alignment: .bottomLeading) {
      MemoryCurve()
        .stroke(Color.notoAmber, style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
        .frame(height: 34)
        .padding(.bottom, 26)
        .opacity(0.9)
      VStack(alignment: .leading, spacing: 1) {
        NotoKicker(text: "spaced repetition")
        Text("\(snap.reviewsDue)")
          .font(.notoSerif(56)).foregroundColor(.notoInk)
          .padding(.top, 4)
        Text("due today").font(.notoSerif(16)).foregroundColor(.notoInk2)
        Spacer(minLength: 0)
        Text(snap.nextLabel).font(.notoMono(10)).foregroundColor(.notoInk3)
      }
    }
    .padding(15)
    .notoWidgetBackground(.notoSurface)
  }
}

struct TodoRowView: View {
  let text: String
  var done: Bool = false
  var body: some View {
    HStack(spacing: 8) {
      RoundedRectangle(cornerRadius: 6, style: .continuous)
        .fill(done ? Color.notoGreen : Color.notoSurface)
        .overlay(
          RoundedRectangle(cornerRadius: 6, style: .continuous)
            .stroke(done ? Color.notoGreen : Color.notoInk3, lineWidth: 1.5)
        )
        .overlay(done ? Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundColor(.white) : nil)
        .frame(width: 16, height: 16)
      Text(text)
        .font(.notoSerif(13))
        .foregroundColor(done ? .notoInk3 : .notoInk)
        .strikethrough(done, color: .notoInk3)
        .lineLimit(1)
    }
  }
}

struct TodosSmallView: View {
  let snap: NotoSnapshot
  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      NotoKicker(text: "today")
      ForEach(Array(snap.todos.prefix(3).enumerated()), id: \.offset) { i, t in
        TodoRowView(text: t, done: false)
      }
      Spacer(minLength: 0)
      if snap.todosOpen > 3 {
        Text("+\(snap.todosOpen - 3) more").font(.notoMono(10)).foregroundColor(.notoInk3)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(15)
    .notoWidgetBackground(.notoSurface)
  }
}

struct CombinedMediumView: View {
  let snap: NotoSnapshot
  var body: some View {
    HStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 1) {
        NotoKicker(text: "due")
        Spacer(minLength: 0)
        Text("\(snap.reviewsDue)").font(.notoSerif(44)).foregroundColor(.notoInk)
        Text("reviews today").font(.notoSerif(13)).foregroundColor(.notoInk2)
        HStack(spacing: 6) {
          GeometryReader { geo in
            ZStack(alignment: .leading) {
              Capsule().fill(Color.notoSurface2)
              Capsule().fill(Color.notoAmber)
                .frame(width: geo.size.width * progress)
            }
          }.frame(height: 5)
        }.padding(.top, 6)
        Text("\(snap.streak)-day streak").font(.notoMono(10)).foregroundColor(.notoInk3).padding(.top, 4)
      }
      .frame(width: 128)
      .padding(.trailing, 14)

      Rectangle().fill(Color.notoLine).frame(width: 1)

      VStack(alignment: .leading, spacing: 8) {
        NotoKicker(text: "today")
        ForEach(Array(snap.todos.prefix(3).enumerated()), id: \.offset) { i, t in
          TodoRowView(text: t, done: false)
        }
        Spacer(minLength: 0)
      }
      .padding(.leading, 14)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(15)
    .notoWidgetBackground(.notoSurface)
  }
  private var progress: CGFloat {
    let total = max(snap.totalToday, 1)
    return CGFloat(min(snap.doneToday, total)) / CGFloat(total)
  }
}

// MARK: - Lock-screen accessory views

@available(iOS 16.0, *)
struct ReviewsAccessory: View {
  @Environment(\.widgetFamily) var family
  let snap: NotoSnapshot
  var body: some View {
    switch family {
    case .accessoryCircular:
      Gauge(value: Double(min(snap.doneToday, max(snap.totalToday, 1))), in: 0...Double(max(snap.totalToday, 1))) {
        Text("due")
      } currentValueLabel: {
        Text("\(snap.reviewsDue)")
      }
      .gaugeStyle(.accessoryCircular)
      .widgetAccentable()
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Text("◆ Noto").font(.headline).widgetAccentable()
        Text("\(snap.reviewsDue) reviews · \(snap.todosOpen) todos").font(.caption)
      }
    case .accessoryInline:
      Text("◆ \(snap.reviewsDue) due · \(snap.nextLabel)")
    default:
      ReviewsSmallView(snap: snap)
    }
  }
}

// MARK: - Widget definitions

struct ReviewsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NotoReviews", provider: NotoProvider()) { entry in
      if #available(iOS 16.0, *) {
        ReviewsAccessory(snap: entry.snap)
      } else {
        ReviewsSmallView(snap: entry.snap)
      }
    }
    .configurationDisplayName("Reviews due")
    .description("Notes ready to review today, with the memory curve.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

struct TodosWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NotoTodos", provider: NotoProvider()) { entry in
      TodosSmallView(snap: entry.snap)
    }
    .configurationDisplayName("Todos")
    .description("Your open todos for today.")
    .supportedFamilies([.systemSmall])
  }
}

struct CombinedWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NotoCombined", provider: NotoProvider()) { entry in
      CombinedMediumView(snap: entry.snap)
    }
    .configurationDisplayName("Day at a glance")
    .description("Reviews due and todos, side by side.")
    .supportedFamilies([.systemMedium])
  }
}

// MARK: - Bundle

@main
struct NotoWidgetBundle: WidgetBundle {
  var body: some Widget {
    ReviewsWidget()
    TodosWidget()
    CombinedWidget()
    if #available(iOS 16.1, *) {
      NotoReviewLiveActivity()
      NotoTodoLiveActivity()
    }
  }
}
