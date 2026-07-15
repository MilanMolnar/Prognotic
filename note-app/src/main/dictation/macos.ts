import { execFile } from 'child_process'
import { promisify } from 'util'
import { BrowserWindow, systemPreferences, WebContents } from 'electron'
import { macDictationShortcutScript, toggleMacDictationWith } from './macosHelpers'

const execFileAsync = promisify(execFile)

const focusDelayMs = 60

export const toggleMacDictation = async (
    sender: WebContents
): Promise<{ ok: boolean; error?: string }> => {
    return toggleMacDictationWith({
        platform: process.platform,
        isAccessibilityTrusted: () => systemPreferences.isTrustedAccessibilityClient(true),
        focusInput: () => {
            const window = BrowserWindow.fromWebContents(sender)
            window?.show()
            window?.focus()
            sender.focus()
        },
        waitForFocus: () => new Promise((resolve) => setTimeout(resolve, focusDelayMs)),
        injectShortcut: async () => {
            await execFileAsync('/usr/bin/osascript', [
                '-l',
                'JavaScript',
                '-e',
                macDictationShortcutScript
            ])
        }
    })
}
