// server/src/services/promptTemplate.ts
//
// Shared prompt-template helpers used by the generation routes. Templates live
// in server/src/prompts/<name>.md and use {{var}} placeholders.

import * as fs from 'fs'
import * as path from 'path'

const PROMPTS_DIR = path.join(__dirname, '../prompts')

export function loadPrompt(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, `${name}.md`), 'utf-8')
}

export function substituteTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value ?? '')
  }
  return result
}
