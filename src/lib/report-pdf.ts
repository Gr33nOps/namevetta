import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import type { ReportData } from '@/components/Report'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { CATEGORY_LABELS } from '@/lib/core/scan'
import { GROUP_LABELS } from '@/lib/scoring/weights'
import { verdictFor, VERDICT_LABELS } from '@/lib/scoring/viability'
import { resultPresentation, SCOPE_NOTICE, SCORE_EXPLAINER } from '@/lib/presentation'

const ink = '#172334'
const blue = '#2458ad'
const date = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Not recorded' : parsed.toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC'
}
const link = (url: string): Content => ({ text: url, ...( /^https?:\/\//i.test(url) ? { link: url } : {}), color: blue, fontSize: 8, margin: [0, 2, 0, 5] })
const heading = (text: string): Content => ({ text, style: 'heading', headlineLevel: 1 })
const table = (headers: string[], rows: TableCell[][], widths: (number | '*' | 'auto')[]): Content => ({
  table: { headerRows: 1, widths, body: [headers.map(text => ({ text, bold: true, color: blue, fillColor: '#eef3fb' })), ...rows] },
  layout: 'lightHorizontalLines', margin: [0, 6, 0, 14],
})

export function reportDocument(scan: ReportData, exportedAt = new Date()): TDocumentDefinitions {
  const { context, viability, coverage, results } = scan
  const findings = results.filter(result => result.status !== 'no_conflict')
  const content: Content[] = [
    { text: 'NAMEVETTA  /  NAME RESEARCH', fontSize: 10, bold: true, color: blue, characterSpacing: 1.3 },
    { text: context.name, fontSize: 30, bold: true, margin: [0, 14, 0, 6] },
    { text: `${CATEGORY_LABELS[context.category]}  |  ${context.scanType === 'deep' ? 'Deep research' : 'Quick check'}`, color: '#596579', margin: [0, 0, 0, 18] },
    { table: { widths: ['*', '*', '*'], body: [[
      { stack: [{ text: `${viability.score}/100`, fontSize: 30, bold: true, color: blue }, { text: 'Digital score', margin: [0, 4, 0, 0] }], fillColor: '#eef3fb' },
      { stack: [{ text: `${coverage}%`, fontSize: 30, bold: true }, { text: 'Evidence coverage', margin: [0, 4, 0, 0] }], fillColor: '#eef3fb' },
      { stack: [{ text: VERDICT_LABELS[verdictFor(viability.score)], fontSize: 18, bold: true }, { text: `${results.length} sources in this report`, margin: [0, 9, 0, 0] }], fillColor: '#eef3fb' },
    ]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 14, paddingBottom: () => 14, paddingLeft: () => 12, paddingRight: () => 12 } },
    { text: SCORE_EXPLAINER, margin: [0, 12, 0, 10], color: '#596579' },
  ]
  if (context.description) content.push(heading('Your brief'), { text: context.description })
  if (viability.caps.length) content.push(heading('Why the score is limited'), { ul: viability.caps.map(cap => `${cap.reason}. Maximum score: ${cap.maximum}/100.`) })
  const groups = viability.groups.filter(group => group.weight > 0)
  if (groups.length) content.push(heading('Score breakdown'), table(['Category', 'Weight', 'Score'], groups.map(group => [GROUP_LABELS[group.group], `${group.weight}%`, group.subscore === null ? 'Not verified' : `${group.subscore}/100`]), ['*', 70, 90]))
  content.push(heading('Findings to review'))
  if (!findings.length) content.push({ text: 'No conflicts were reported by the completed checks. Unchecked sources are not evidence of availability.' })
  for (const result of findings) {
    content.push({ text: `${SOURCE_MANIFEST[result.source].label}  /  ${resultPresentation(result).label}`, bold: true, margin: [0, 10, 0, 4], headlineLevel: 1 })
    content.push({ text: resultPresentation(result).detail, color: '#596579' })
    const matches = [...result.exactMatches, ...result.similarMatches]
    for (const match of matches) {
      content.push({ text: `${match.name} (${match.severity} concern, ${match.similarity.overall}% similarity)`, margin: [0, 6, 0, 2], bold: true })
      if (match.url) content.push(link(match.url))
      for (const evidence of match.evidence) {
        content.push({ text: evidence.label, margin: [0, 2, 0, 2] })
        if (evidence.url) content.push(link(evidence.url))
      }
    }
    for (const evidence of result.evidence) {
      content.push({ text: evidence.label, margin: [0, 3, 0, 2] })
      if (evidence.url) content.push(link(evidence.url))
    }
    if (result.error) content.push({ text: result.error.message, margin: [0, 4, 0, 0], color: '#596579' })
  }
  content.push(heading('All source checks'), table(['Source', 'Result', 'Confidence', 'Checked (UTC)'], results.map(result => [SOURCE_MANIFEST[result.source].label, resultPresentation(result).label, `${result.confidence}%`, date(result.checkedAt)]), [100, 90, 55, '*']))
  content.push(heading('Scope and record'), { text: SCOPE_NOTICE }, { text: `Exported ${date(exportedAt.toISOString())}. Scoring version ${viability.scoringVersion}. Availability can change after a check.`, color: '#596579', margin: [0, 6, 0, 0] })
  return {
    pageSize: 'A4', pageMargins: [44, 44, 44, 48],
    info: { title: `${context.name} | Name research report`, author: 'NameVetta', subject: 'Digital name availability research' },
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.25, color: ink },
    styles: { heading: { fontSize: 15, bold: true, color: ink, margin: [0, 18, 0, 7] } },
    content,
    footer: (page, pages) => ({ columns: [{ text: 'NameVetta  /  Digital research report' }, { text: `${page} / ${pages}`, alignment: 'right' }], margin: [44, 16, 44, 0], fontSize: 8, color: '#596579' }),
    pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.length === 0,
  }
}

export async function downloadReport(scan: ReportData): Promise<void> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts'),
  ])
  const vfs = fonts as unknown as Record<string, string>
  const blob = await new Promise<Blob>(resolve => pdfMake.createPdf(reportDocument(scan), undefined, undefined, vfs).getBlob(resolve))
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${scan.context.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 80) || 'name'}-name-report.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
