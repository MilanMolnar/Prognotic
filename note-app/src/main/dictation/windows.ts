import { execFile } from 'child_process'
import { promisify } from 'util'
import { BrowserWindow, WebContents } from 'electron'

const execFileAsync = promisify(execFile)

// Sends Win+H via user32 SendInput — toggles Windows voice typing into the
// focused field. No public API exists; this mirrors the system shortcut.
// INPUT must include MOUSEINPUT in the union or cbSize is wrong on x64.
const sendWinHScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class VoiceTypingKeys {
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT {
        public uint type;
        public InputUnion U;
    }
    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }
    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const ushort VK_LWIN = 0x5B;
    const ushort VK_H = 0x48;
    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    static INPUT Key(ushort vk, uint flags = 0) {
        return new INPUT {
            type = INPUT_KEYBOARD,
            U = new InputUnion { ki = new KEYBDINPUT { wVk = vk, dwFlags = flags } }
        };
    }
    public static void SendWinH() {
        INPUT[] inputs = {
            Key(VK_LWIN),
            Key(VK_H),
            Key(VK_H, KEYEVENTF_KEYUP),
            Key(VK_LWIN, KEYEVENTF_KEYUP)
        };
        int size = Marshal.SizeOf(typeof(INPUT));
        uint sent = SendInput((uint)inputs.Length, inputs, size);
        if (sent != inputs.Length) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
    }
}
"@
[VoiceTypingKeys]::SendWinH()
`

const focusDelayMs = 60

export const toggleWindowsDictation = async (
    sender: WebContents
): Promise<{ ok: boolean; error?: string }> => {
    if (process.platform !== 'win32') {
        return { ok: false, error: 'Windows dictation is only available on Windows.' }
    }

    const window = BrowserWindow.fromWebContents(sender)
    window?.show()
    window?.focus()
    sender.focus()

    await new Promise((resolve) => setTimeout(resolve, focusDelayMs))

    try {
        await execFileAsync('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-EncodedCommand',
            Buffer.from(sendWinHScript, 'utf16le').toString('base64')
        ])
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
                ? `Could not send Win+H: ${message}`
                : 'Could not send the Win+H voice typing shortcut.'
        }
    }
}
