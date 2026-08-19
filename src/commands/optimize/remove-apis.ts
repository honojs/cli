import { parse } from '@babel/parser'
import type {
  ClassMethod,
  ClassProperty,
  ClassPrivateProperty,
  Identifier,
  PrivateName,
} from '@babel/types'
import MagicString from 'magic-string'

type NodeWithRange = { start: number | null | undefined; end: number | null | undefined }
type ClassElementNode = (ClassMethod | ClassProperty | ClassPrivateProperty) & NodeWithRange

export const removeApis = (contents: string, className: string, methods: string[]): string => {
  const ast = parse(contents, {
    sourceType: 'module',
    plugins: [
      'classPrivateProperties',
      'classPrivateMethods',
      'privateIn',
      'importMeta',
      'topLevelAwait',
    ],
  })

  const magic = new MagicString(contents)
  let modified = false

  for (const statement of ast.program.body as ((typeof ast.program.body)[number] &
    NodeWithRange)[]) {
    if (statement.type !== 'VariableDeclaration') {
      continue
    }

    for (const declaration of statement.declarations) {
      if (
        declaration.id.type !== 'Identifier' ||
        declaration.id.name !== className ||
        !declaration.init ||
        declaration.init.type !== 'ClassExpression'
      ) {
        continue
      }

      for (const member of declaration.init.body.body as ClassElementNode[]) {
        if (!shouldRemoveClassMember(member, methods)) {
          continue
        }
        const start = member.start ?? 0
        const end = member.end ?? start
        magic.remove(start, end)
        modified = true
      }
    }
  }

  if (!modified) {
    return contents
  }

  const result = magic.toString()

  // A remaining member may still reference a removed private member,
  // e.g. a method added in a newer hono version. Removing it would
  // generate broken code, so skip the removal.
  for (const method of methods) {
    if (method.startsWith('#') && new RegExp(`${method}\\b`).test(result)) {
      console.warn(`Skipped API removal for ${className}: ${method} is still referenced`)
      return contents
    }
  }

  return result
}

const shouldRemoveClassMember = (member: ClassElementNode, methods: string[]): boolean => {
  if (
    (member.type === 'ClassMethod' || member.type === 'ClassProperty') &&
    isIdentifier(member.key) &&
    methods.includes(member.key.name)
  ) {
    return true
  }

  if (
    member.type === 'ClassPrivateProperty' &&
    isPrivateIdentifier(member.key) &&
    methods.includes(`#${member.key.id.name}`)
  ) {
    return true
  }

  return false
}

const isIdentifier = (key: ClassMethod['key']): key is Identifier => key.type === 'Identifier'

const isPrivateIdentifier = (key: ClassPrivateProperty['key']): key is PrivateName =>
  key.type === 'PrivateName'
