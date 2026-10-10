import { spawn } from 'node:child_process'

/**
 * Run `<packageManager> install` in the directory. Its output goes to
 * stderr: stdout is for the JSON result.
 */
export const install = (packageManager: string, dir: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(packageManager, ['install'], {
      cwd: dir,
      stdio: ['ignore', process.stderr, process.stderr],
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${packageManager} install exited with ${code}`))
    )
  })
