import { spawn } from 'node:child_process'

/**
 * Run the package manager in the directory. Its output goes to
 * stderr: stdout is for the JSON result.
 */
export const runPackageManager = (
  packageManager: string,
  args: string[],
  dir: string
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(packageManager, args, {
      cwd: dir,
      stdio: ['ignore', process.stderr, process.stderr],
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${packageManager} ${args.join(' ')} exited with ${code}`))
    )
  })

export const install = (packageManager: string, dir: string): Promise<void> =>
  runPackageManager(packageManager, ['install'], dir)
