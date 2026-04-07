import { runFigmaWorkflow } from './workflow.js'

// Parse args: <file-key> [--node-id 22-346] [--jira PROJ] [--parent PROJ-42]
const args = process.argv.slice(2)
const fileKey = args[0]

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : undefined
}

if (!fileKey) {
  console.error('Usage: npx tsx test-figma.ts <figma-file-key> [--node-id <id>] [--jira <PROJECT>] [--parent <KEY>]')
  console.error('')
  console.error('O file key e o node-id estao na URL do Figma:')
  console.error('https://www.figma.com/design/ABC123xyz/NomeProjeto?node-id=22-346')
  console.error('                              ^^^^^^^^^^^                  ^^^^^^')
  console.error('')
  console.error('Opcoes:')
  console.error('  --node-id <id>     Analisa apenas os frames dentro daquele node')
  console.error('  --jira <PROJECT>   Cria issues no Jira para cada funcionalidade')
  console.error('  --parent <KEY>     Issue pai no Jira (ex: PROJ-42)')
  process.exit(1)
}

// Figma URLs use "-" but the API expects ":" (e.g. 22-346 → 22:346)
const rawNodeId = getFlag('--node-id')
const nodeId = rawNodeId?.replace('-', ':')
const jiraProject = getFlag('--jira')
const jiraParent = getFlag('--parent')

async function main() {
  const result = await runFigmaWorkflow(
    { fileKey, nodeId, jiraProject, jiraParent },
    (msg) => console.log(msg)
  )

  console.log('\n' + '='.repeat(50))
  console.log('RESUMO')
  console.log('='.repeat(50))
  console.log(`Telas analisadas: ${result.totalFrames}`)
  console.log(`Funcionalidades: ${result.features.length}`)
  result.features.forEach((f) => {
    const jira = f.jiraKey ? ` → ${f.jiraKey}` : ''
    console.log(`  - ${f.name}${jira}`)
  })
  console.log(`\nImagens: ${result.imagesDir}`)
  console.log(`Gherkins: ${result.gherkinsDir}`)
}

main().catch((err) => {
  console.error('Erro fatal:', err.message ?? err)
  process.exit(1)
})
