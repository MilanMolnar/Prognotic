export type MacDictationResult = { ok: boolean; error?: string }

export type MacDictationDependencies = {
  platform: NodeJS.Platform
  isAccessibilityTrusted: () => boolean
  focusInput: () => void
  waitForFocus: () => Promise<void>
  injectShortcut: () => Promise<void>
}

export const macAccessibilityPermissionError =
  'macOS Dictation needs Accessibility permission. Allow Prognotic in System Settings > Privacy & Security > Accessibility, then quit and reopen Prognotic.'

const macAccessibilityRejectedError =
  'macOS rejected the Fn-D shortcut even though Prognotic appears in Accessibility settings. Remove and re-add Prognotic in System Settings > Privacy & Security > Accessibility, then quit and reopen it.'

const macShortcutInjectionError =
  'Accessibility is enabled, but Prognotic could not inject Fn-D. Try Fn-D manually. If Fn-D also does nothing, turn on Dictation and choose Fn-D in System Settings > Keyboard > Dictation; if it works manually, restart Prognotic.'

const errorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return ''
  const stderr = 'stderr' in error ? error.stderr : undefined
  return typeof stderr === 'string' && stderr.trim() ? stderr.trim() : error.message
}

export const macDictationInjectionError = (error: unknown): string => {
  const message = errorMessage(error)
  return /accessibility|assistive access|not authori[sz]ed|not permitted|operation not permitted/i.test(message)
    ? macAccessibilityRejectedError
    : macShortcutInjectionError
}

// CoreGraphics keyboard events require modifier key-down/up events in
// addition to the character event, so send the complete Fn-down, D-down/up,
// Fn-up sequence instead of representing Fn only as a flag on D.
export const macDictationShortcutScript = `
ObjC.import('CoreGraphics')
ObjC.import('CoreFoundation')

const fnKeyCode = 63
const dKeyCode = 2
const secondaryFn = $.kCGEventFlagMaskSecondaryFn
const fnDown = $.CGEventCreateKeyboardEvent(null, fnKeyCode, true)
const dDown = $.CGEventCreateKeyboardEvent(null, dKeyCode, true)
const dUp = $.CGEventCreateKeyboardEvent(null, dKeyCode, false)
const fnUp = $.CGEventCreateKeyboardEvent(null, fnKeyCode, false)

if (!fnDown || !dDown || !dUp || !fnUp) {
    if (fnDown) $.CFRelease(fnDown)
    if (dDown) $.CFRelease(dDown)
    if (dUp) $.CFRelease(dUp)
    if (fnUp) $.CFRelease(fnUp)
    throw new Error('MAC_DICTATION_EVENT_CREATION_FAILED')
}

try {
    $.CGEventSetFlags(fnDown, secondaryFn)
    $.CGEventSetFlags(dDown, secondaryFn)
    $.CGEventSetFlags(dUp, secondaryFn)
    $.CGEventPost($.kCGHIDEventTap, fnDown)
    $.CGEventPost($.kCGHIDEventTap, dDown)
    $.CGEventPost($.kCGHIDEventTap, dUp)
    $.CGEventPost($.kCGHIDEventTap, fnUp)
} finally {
    $.CFRelease(fnDown)
    $.CFRelease(dDown)
    $.CFRelease(dUp)
    $.CFRelease(fnUp)
}
`

export const toggleMacDictationWith = async (
  dependencies: MacDictationDependencies
): Promise<MacDictationResult> => {
  if (dependencies.platform !== 'darwin') {
    return { ok: false, error: 'macOS Dictation is only available on macOS.' }
  }

  if (!dependencies.isAccessibilityTrusted()) {
    return { ok: false, error: macAccessibilityPermissionError }
  }

  try {
    dependencies.focusInput()
    await dependencies.waitForFocus()
    await dependencies.injectShortcut()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: macDictationInjectionError(error) }
  }
}
