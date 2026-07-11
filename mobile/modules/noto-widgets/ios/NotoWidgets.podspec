Pod::Spec.new do |s|
  s.name           = 'NotoWidgets'
  s.version        = '1.0.0'
  s.summary        = 'Bridges Noto data and review Live Activities to the widget extension.'
  s.description    = 'Writes the shared App Group snapshot, reloads widget timelines, and controls the review Live Activity via ActivityKit.'
  s.author         = ''
  s.homepage       = 'https://github.com/tankbusterM1/noto'
  s.platforms      = { :ios => '16.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
