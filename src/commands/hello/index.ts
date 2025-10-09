import type { Command } from 'commander'

export function helloCommand(program: Command) {
  program
    .command('hello')
    .description('Say hello')
    .argument('[name]', 'name to greet', 'Hono')
    .action((name: string) => {
      console.log(`Hello, ${name}!`)
    })
}
