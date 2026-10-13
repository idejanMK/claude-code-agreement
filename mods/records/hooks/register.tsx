// records — the records v2 pilot mod (~/.claude/rules/records.md).
//   /plan-check            runs ~/.claude/hooks/records-lint.js on the session's project and prints it
//   prompt.compose         appends the PLAN dashboard (At a glance, phase file, inbox count) as a
//                          session-scope section, re-read from the files at every request
//   Pane "Records"         the same four lines, where the surface draws (terminal, desktop)
// The files stay the truth; the mod only reads them. Nothing here is required for the
// records to work: hooks, rule and skills stand alone when the mod is off.
import type { Register } from 'claude-code'

const PANE = 'records'
const CMD = 'plan-check'
const RECORD = /(^|[\\/])(PLAN|ROADMAP|NOTES)\.md$|[\\/]records[\\/]/

type Dash = { lines: string[]; open: string; inbox: string; root: string }
let dash: Dash = { lines: [], open: 'none', inbox: '', root: '' }

async function refresh($: any): Promise<void> {
  let root = ''
  try {
    root = await $.session.cwd()
    const plan: string = await $.fs.read(`${root}/PLAN.md`)
    if (!/^## Open phase/m.test(plan)) {
      dash = { lines: [], open: 'none', inbox: '', root }
      return
    }
    const section = (name: string): string => {
      const m = plan.match(new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))
      return m ? m[1].trim() : ''
    }
    const lines = section('At a glance').split('\n').filter(l => l.startsWith('- **'))
    const open = (section('Open phase').match(/^- \*\*Phase file:\*\*\s*(.+)$/m) || [])[1] || 'none'
    let inbox = 'no NOTES.md'
    try {
      const notes: string = await $.fs.read(`${root}/NOTES.md`)
      const rows = notes.split('\n')
      const n = rows.filter(l => /^- N\d+ \(/.test(l)).length
      const q = rows.filter(l => /^- \? N\d+ \(/.test(l)).length
      inbox = `${n} untriaged${q ? `, ${q} waiting for the user` : ''}`
    } catch {}
    dash = { lines, open, inbox, root }
  } catch {
    dash = { lines: [], open: 'none', inbox: '', root }
  }
}

const plain = (s: string) => s.replace(/\*\*/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: CMD,
      description: 'Lint PLAN.md, ROADMAP.md, NOTES.md and records/phases against the records grammar',
    })
    await refresh($)
    if (e.surface === 'terminal' || e.surface === 'desktop') void $.ui.open({ id: PANE, title: 'Records' })
    return next(e)
  })

  on('command.run', { command: CMD }, async $ => {
    const cwd: string = await $.session.cwd()
    const lint = `${$.plugin.root}/../../hooks/records-lint.js`
    let out = ''
    const stream = $.process.spawn({ argv: ['node', lint, cwd] })
    for await (const chunk of stream) out += chunk.text
    const ended = await stream.result
    await refresh($)
    $.ui.invalidate('ui.render')
    return { text: out.trim() || `records-lint exited with ${ended.code}` }
  })

  // The dashboard rides every request so the model holds the live state after compaction too.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (e.traits.includes('analysis') || e.traits.includes('bare')) return r
    await refresh($)
    if (dash.lines.length === 0) return r
    const text = [
      'Records dashboard (read from PLAN.md and NOTES.md at this request; the files are the truth; grammar: ~/.claude/rules/records.md):',
      ...dash.lines,
      `- **Phase file:** ${dash.open}`,
      `- **Inbox:** ${dash.inbox}`,
    ].join('\n')
    return { sections: [...r.sections, { id: 'records:dashboard', text, scope: 'session' }] }
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const fp = String((e as any).input?.file_path ?? '')
    if (fp && RECORD.test(fp)) {
      await refresh($)
      $.ui.invalidate('ui.render')
    }
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (dash.lines.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No records v2 dashboard here (PLAN.md has no "## Open phase").</Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        {dash.lines.map(l => (
          <Text>{plain(l)}</Text>
        ))}
        <Text>Phase file: {plain(dash.open)}</Text>
        <Text dimColor>Inbox: {dash.inbox} · /plan-check lints the records</Text>
      </Box>
    )
  })
}
