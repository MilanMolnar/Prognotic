import { execFile } from 'child_process'
import { promisify } from 'util'
import { BrowserWindow, systemPreferences, WebContents } from 'electron'

const execFileAsync = promisify(execFile)

// Apple documents Fn-D as the standard macOS Dictation shortcut. System
// Events does not expose Fn as an AppleScript modifier, so built-in
// osascript/JXA posts D with CoreGraphics' SecondaryFn event flag instead.
// Quartz keyboard injection requires Accessibility permission for Prognotic.
const sendFnDScript = `
ObjC.import('CoreGraphics')
ObjC.import('CoreFoundation')

const dKeyCode = 2
const keyDown = $.CGEventCreateKeyboardEvent(null, dKeyCode, true)
const keyUp = $.CGEventCreateKeyboardEvent(null, dKeyCode, false)
if (!keyDown || !keyUp) {
    throw new Error('Could not create macOS keyboard events.')
}

$.CGEventSetFlags(keyDown, $.kCGEventFlagMaskSecondaryFn)
$.CGEventSetFlags(keyUp, $.kCGEventFlagMaskSecondaryFn)
$.CGEventPost($.kCGHIDEventTap, keyDown)
$.CGEventPost($.kCGHIDEventTap, keyUp)
$.CFRelease(keyDown)
$.CFRelease(keyUp)
`

const focusDelayMs = 60

export const toggleMacDictation = async (
    sender: WebContents
): Promise<{ ok: boolean; error?: string }> => {
    if (process.platform !== 'darwin') {
        return { ok: false, error: 'macOS dictation is only available on macOS.' }
    }

    if (!systemPreferences.isTrustedAccessibilityClient(true)) {
        return {
            ok: false,
            error: 'macOS dictation needs Accessibility permission. Enable Prognotic in System Settings > Privacy & Security > Accessibility, then try again.'
        }
    }

    const window = BrowserWindow.fromWebContents(sender)
    window?.show()
    window?.focus()
    sender.focus()

    await new Promise((resolve) => setTimeout(resolve, focusDelayMs))

    try {
        await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', sendFnDScript])
        return { ok: true }
    } catch (err) {
        const message =
            err instanceof Error && 'stderr' in err && typeof err.stderr === 'string'
                ? err.stderr.trim()
                : err instanceof Error
                  ? err.message
                  : undefined
        return {
            ok: false,
            error: message
                ? `Could not send the macOS Fn-D dictation shortcut: ${message}`
                : 'Could not send the macOS Fn-D dictation shortcut.'
        }
    }
}
