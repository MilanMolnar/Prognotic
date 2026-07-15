import { describe, expect, it, vi } from 'vitest'
import {
  macAccessibilityPermissionError,
  MacDictationDependencies,
  macDictationShortcutScript,
  toggleMacDictationWith
} from './macosHelpers'

const dependencies = (): MacDictationDependencies => ({
  platform: 'darwin' as NodeJS.Platform,
  isAccessibilityTrusted: vi.fn(() => true),
  focusInput: vi.fn(),
  waitForFocus: vi.fn(async () => undefined),
  injectShortcut: vi.fn(async () => undefined)
})

describe('toggleMacDictationWith', () => {
  it('does not touch native dictation providers off macOS', async () => {
    const deps = dependencies()
    deps.platform = 'win32'

    await expect(toggleMacDictationWith(deps)).resolves.toEqual({
      ok: false,
      error: 'macOS Dictation is only available on macOS.'
    })
    expect(deps.isAccessibilityTrusted).not.toHaveBeenCalled()
    expect(deps.injectShortcut).not.toHaveBeenCalled()
  })

  it('returns success after focusing and injecting the shortcut', async () => {
    const deps = dependencies()

    await expect(toggleMacDictationWith(deps)).resolves.toEqual({ ok: true })
    expect(deps.focusInput).toHaveBeenCalledOnce()
    expect(deps.waitForFocus).toHaveBeenCalledOnce()
    expect(deps.injectShortcut).toHaveBeenCalledOnce()
  })

  it('returns actionable Accessibility recovery without trying injection', async () => {
    const deps = dependencies()
    vi.mocked(deps.isAccessibilityTrusted).mockReturnValue(false)

    await expect(toggleMacDictationWith(deps)).resolves.toEqual({
      ok: false,
      error: macAccessibilityPermissionError
    })
    expect(deps.injectShortcut).not.toHaveBeenCalled()
  })

  it('distinguishes an injection failure from Dictation shortcut setup', async () => {
    const deps = dependencies()
    vi.mocked(deps.injectShortcut).mockRejectedValue(new Error('JXA failed'))

    const result = await toggleMacDictationWith(deps)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('could not inject Fn-D')
    expect(result.error).toContain('If Fn-D also does nothing')
    expect(result.error).toContain('System Settings > Keyboard > Dictation')
  })

  it('reports a stale Accessibility grant when macOS rejects the event', async () => {
    const deps = dependencies()
    const error = Object.assign(new Error('osascript failed'), {
      stderr: 'Operation not permitted for assistive access'
    })
    vi.mocked(deps.injectShortcut).mockRejectedValue(error)

    const result = await toggleMacDictationWith(deps)

    expect(result.error).toContain('appears in Accessibility settings')
    expect(result.error).toContain('Remove and re-add Prognotic')
  })
})

describe('macDictationShortcutScript', () => {
  it('posts explicit Fn key-down and key-up events around D', () => {
    expect(macDictationShortcutScript).toContain(
      'CGEventCreateKeyboardEvent(null, fnKeyCode, true)'
    )
    expect(macDictationShortcutScript).toContain(
      'CGEventCreateKeyboardEvent(null, fnKeyCode, false)'
    )
    expect(macDictationShortcutScript.indexOf('kCGHIDEventTap, fnDown')).toBeLessThan(
      macDictationShortcutScript.indexOf('kCGHIDEventTap, dDown')
    )
    expect(macDictationShortcutScript.indexOf('kCGHIDEventTap, dUp')).toBeLessThan(
      macDictationShortcutScript.indexOf('kCGHIDEventTap, fnUp')
    )
  })
})
