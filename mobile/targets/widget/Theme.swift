import SwiftUI

// Noto's palette (mirrors mobile/src/theme.ts) as SwiftUI colors. Widgets are
// light-first like the app; iOS tints them for dark mode automatically.
extension Color {
  static let notoPaper   = Color(red: 0.957, green: 0.945, blue: 0.914) // #f4f1e9
  static let notoSurface = Color(red: 0.980, green: 0.973, blue: 0.949) // #faf8f2
  static let notoSurface2 = Color(red: 0.937, green: 0.922, blue: 0.874) // #efebdf
  static let notoInk     = Color(red: 0.094, green: 0.075, blue: 0.039) // #18130a
  static let notoInk2    = Color(red: 0.420, green: 0.388, blue: 0.333) // #6b6355
  static let notoInk3    = Color(red: 0.604, green: 0.576, blue: 0.518) // #9a9384
  static let notoLine    = Color(red: 0.890, green: 0.867, blue: 0.812) // #e3ddcf
  static let notoAmber   = Color(red: 0.722, green: 0.478, blue: 0.149) // #b87a26
  static let notoAccent  = Color(red: 0.208, green: 0.318, blue: 0.557) // #35518e
  static let notoGreen   = Color(red: 0.290, green: 0.451, blue: 0.314) // #4a7350
  static let notoRed     = Color(red: 0.643, green: 0.251, blue: 0.184) // #a4402f
}

extension Font {
  // Noto's voice is a serif (Newsreader on device); .serif gives New York as a
  // faithful system stand-in without bundling the font into the extension.
  static func notoSerif(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
    .system(size: size, weight: weight, design: .serif)
  }
  static func notoMono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .system(size: size, weight: weight, design: .monospaced)
  }
}

// The amber diamond that marks Noto throughout the app.
struct NotoDiamond: View {
  var size: CGFloat = 8
  var color: Color = .notoAmber
  var body: some View {
    RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
      .fill(color)
      .frame(width: size, height: size)
      .rotationEffect(.degrees(45))
  }
}

// The mono, letter-spaced kicker used on every widget ("SPACED REPETITION").
struct NotoKicker: View {
  let text: String
  var body: some View {
    HStack(spacing: 5) {
      NotoDiamond(size: 6)
      Text(text.uppercased())
        .font(.notoMono(9))
        .tracking(1.4)
        .foregroundColor(.notoInk3)
    }
  }
}
