import { query } from '@anthropic-ai/claude-agent-sdk'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

// ── CLI Arguments ────────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  return idx !== -1 && idx + 1 < process.argv.length
    ? process.argv[idx + 1]
    : undefined
}

const figmaFileKey = process.argv[2]

if (!figmaFileKey || figmaFileKey.startsWith('--')) {
  console.error(
    'Usage: tsx orchestrator.ts <figma-file-key> [--jira-project KEY] [--jira-parent KEY]'
  )
  console.error('')
  console.error('Examples:')
  console.error('  tsx orchestrator.ts abc123XYZ')
  console.error('  tsx orchestrator.ts abc123XYZ --jira-project PROJ')
  console.error('  tsx orchestrator.ts abc123XYZ --jira-project PROJ --jira-parent PROJ-42')
  process.exit(1)
}

const jiraProject = getArg('--jira-project')
const jiraParent = getArg('--jira-parent')

// ── Prompt Construction ──────────────────────────────────────────────

const jiraInstructions = jiraProject
  ? `
6. For each generated Gherkin scenario, call jira_create_issue with:
   - summary: the scenario title (from "Cenario:" line)
   - gherkinContent: the full Gherkin text
   - projectKey: "${jiraProject}"
   ${jiraParent ? `- parentIssueKey: "${jiraParent}"` : '- issueType: "Story"'}
7. Report all created Jira issues with their keys.`
  : `
6. Skip Jira upload (no --jira-project provided).`

const prompt = `Analyze a Figma design file and generate Gherkin BDD test scenarios for each screen.

Figma file key: ${figmaFileKey}

Follow these steps in order:

1. Call figma_get_file with fileKey "${figmaFileKey}" to get the file structure and list of frames.

2. Review the frames returned. Select all top-level frames (these represent screens/pages of the application).

3. Call figma_render_frames with the fileKey and the array of node IDs from step 1 to get image URLs.

4. Call figma_download_images with the rendered images (include nodeId, nodeName, and imageUrl for each). This saves the images to disk.

5. For EACH downloaded image, call analyze_design_gherkin with the nodeId, nodeName, and imagePath. This will analyze the design with Claude vision and generate Gherkin scenarios in Portuguese. Do this for every frame.
${jiraInstructions}

At the end, provide a complete summary:
- Total frames analyzed
- List of generated Gherkin files with paths
- List of generated image files with paths
${jiraProject ? '- List of Jira issues created with keys' : ''}`

// ── Run Agent ────────────────────────────────────────────────────────

console.log('='.repeat(60))
console.log('FlowSpec — Figma Design Analyzer')
console.log('='.repeat(60))
console.log(`File key: ${figmaFileKey}`)
if (jiraProject) console.log(`Jira project: ${jiraProject}`)
if (jiraParent) console.log(`Jira parent: ${jiraParent}`)
console.log(`Output: ../temp-figma-output/`)
console.log('='.repeat(60))
console.log('')

async function main() {
  try {
    for await (const message of query({
      prompt,
      options: {
        systemPrompt:
          'You are a QA automation agent that analyzes Figma UI designs and generates comprehensive BDD/Gherkin test scenarios. Use the MCP tools provided to complete the workflow step by step. Always process ALL frames, not just some.',
        mcpServers: {
          'flowspec-figma': {
            command: 'npx',
            args: ['tsx', path.resolve(__dirname, 'server.ts')],
            env: {
              ...process.env as Record<string, string>,
            },
          },
        },
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: 30,
      },
    })) {
      if ('result' in message) {
        console.log('\n' + '='.repeat(60))
        console.log('RESULT:')
        console.log('='.repeat(60))
        console.log(message.result)
      }
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main()
