import * as fs from 'fs'

/**
 * Read a chunk of bytes from a file at a given offset.
 * Uses try/finally to guarantee the file descriptor is always closed.
 */
function readFileBytes(filePath: string, offset: number, length: number): Buffer {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(length)
    let total = 0
    while (total < length) {
      const read = fs.readSync(fd, buffer, total, length - total, offset + total)
      if (read === 0) break
      total += read
    }
    return buffer.subarray(0, total)
  } finally {
    fs.closeSync(fd)
  }
}

export function readFileChunk(filePath: string, offset: number, length: number): string {
  return readFileBytes(filePath, offset, length).toString('utf-8')
}

/**
 * Read new lines appended to a file since `lastSize` bytes.
 * Returns the new lines, updated file size, and any trailing partial line
 * (bytes past the last newline) as `tail` — pass it back on the next call as
 * `lastTail` to reassemble lines split across reads. If callers ignore `tail`,
 * they silently lose any line that wasn't fully flushed by the writer yet.
 * Handles truncation (file shrunk) by resetting to 0.
 */
export function readNewFileLines(
  filePath: string,
  lastSize: number,
  lastTail = '',
): { lines: string[]; newSize: number; tail: string } | null {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch { return null /* expected if file was removed */ }

  if (stat.size < lastSize) {
    // File was truncated — reset both size and tail
    return { lines: [], newSize: 0, tail: '' }
  }
  if (stat.size <= lastSize) {
    return null
  }

  const bytes = readFileBytes(filePath, lastSize, stat.size - lastSize)
  let safeEnd = bytes.length
  // A writer may stop in the middle of a Thai character or emoji. Leave its
  // bytes unread until the next poll, rather than decoding replacement chars.
  let lead = bytes.length - 1
  while (lead >= 0 && (bytes[lead] & 0xc0) === 0x80) lead--
  if (lead >= 0) {
    const byte = bytes[lead]
    const expected = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1
    if (bytes.length - lead < expected) safeEnd = lead
  }
  const newContent = lastTail + bytes.subarray(0, safeEnd).toString('utf-8')
  const parts = newContent.split(/\r?\n/)
  // Last fragment is whatever follows the final newline — empty if the file
  // ended on a newline, otherwise a partial line we need to carry forward.
  const tail = parts.pop() ?? ''
  const lines = parts.filter(Boolean)
  return { lines, newSize: lastSize + safeEnd, tail }
}

/** Case-fold a path string for comparison on Windows, where the filesystem is
 *  case-insensitive and tools disagree on drive-letter case (VS Code reports
 *  `c:\...`, Claude Code and most shells report `C:\...`). Identity elsewhere. */
export function foldPathCase(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p
}
