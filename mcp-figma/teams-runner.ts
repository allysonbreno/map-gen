/**
 * Background runner for Teams integration.
 * Called by server.js as a subprocess when a Teams webhook is received.
 *
 * Usage: npx tsx mcp-figma/teams-runner.ts <fileKey> [--node-id ID] [--jira PROJ] [--parent KEY] --figma-url URL --teams-webhook URL
 */
import { runFigmaWorkflow } from './workflow.js'
import { notifyTeams, notifyTeamsError } from './teams-notify.js'

const args = process.argv.slice(2)
const fileKey = args[0]

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : undefined
}

const nodeId = getFlag('--node-id')
const jiraProject = getFlag('--jira')
const jiraParent = getFlag('--parent')
const figmaUrl = getFlag('--figma-url') ?? ''
const teamsWebhook = getFlag('--teams-webhook') ?? ''

if (!fileKey || !teamsWebhook) {
  console.error('Missing fileKey or --teams-webhook')
  process.exit(1)
}

async function main() {
  try {
    console.log(`Starting workflow: ${fileKey} (node: ${nodeId ?? 'all'})`)

    const result = await runFigmaWorkflow(
      { fileKey, nodeId, jiraProject, jiraParent },
      (msg) => console.log(msg)
    )

    console.log(`Workflow done: ${result.features.length} features`)

    await notifyTeams(teamsWebhook, result, figmaUrl)
    console.log('Teams notification sent')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Workflow error: ${msg}`)

    try {
      await notifyTeamsError(teamsWebhook, figmaUrl, msg)
      console.log('Error notification sent to Teams')
    } catch (notifyErr) {
      console.error('Failed to notify Teams of error:', notifyErr)
    }
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1))
