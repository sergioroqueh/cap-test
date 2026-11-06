import { jsPDF } from 'jspdf'
import type { AnswerKey, Question } from './types'

export interface ExamPdfOptions {
  label: string
  questions: Question[]
  withSolutions?: boolean
}

const LETTERS: AnswerKey[] = ['A', 'B', 'C', 'D']
const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const LEFT = 17
const RIGHT = 17
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT
const BOTTOM = 276

/**
 * Standard PDF fonts use Windows-1252; retain Spanish punctuation and
 * transliterate unsupported math/typographic symbols rather than producing
 * empty boxes. This function affects only the exported copy.
 */
function pdfText(value: string): string {
  const conversions: Record<string, string> = {
    '−': '-', '–': '-', '—': '-', '‐': '-',
    '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'",
    '…': '...', '→': '->', '←': '<-', '↔': '<->',
    '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~',
    'Ω': 'Ohm', 'ω': 'omega', 'μ': 'micro', 'µ': 'micro',
    'Δ': 'Delta', 'δ': 'delta', 'π': 'pi',
    '∞': 'infinito', '√': 'raiz', '∑': 'suma',
    '€': 'EUR', '•': '-', '·': '-', '✓': 'OK',
    '⁄': '/', '⁰':'0', '¹':'1', '²':'²', '³':'³',
    '⁴':'4', '⁵':'5', '⁶':'6', '⁷':'7', '⁸':'8', '⁹':'9',
    '₀':'0', '₁':'1', '₂':'2', '₃':'3'
  }
  return String(value ?? '').replace(/\r\n?/g, '\n')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[^\x20-\x7e\u00a1-\u00ff\n]/gu, c => conversions[c] ?? '?')
}

function fileName(label: string, withSolutions: boolean): string {
  const slug = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 78)
  return 'cap-test-' + (slug || 'examen') + (withSolutions ? '-soluciones' : '') + '.pdf'
}

/** Download the exact questions and letter order stored in the active/completed session. */
export function exportExamPdf({ label, questions, withSolutions = false }: ExamPdfOptions): void {
  if (!questions.length) throw new Error('No hay preguntas para exportar.')
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4', compress:true })
  let y = 30
  let currentPage = 1

  function pageHeader() {
    doc.setFillColor(12, 27, 34)
    doc.rect(0, 0, PAGE_WIDTH, 18, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('CAP TEST', LEFT, 11.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('DOCUMENTO DE ESTUDIO - NO OFICIAL', PAGE_WIDTH-RIGHT, 11.5, { align:'right' })
    doc.setTextColor(26, 39, 49)
  }
  function nextPage() {
    doc.addPage()
    currentPage++
    y = 29
    pageHeader()
  }
  function ensure(space: number) {
    if (y + space > BOTTOM) nextPage()
  }
  function writeLines(lines: string[], fontSize: number, lineHeight: number, x=LEFT, font:'normal'|'bold'='normal', width?:number) {
    doc.setFont('helvetica', font)
    doc.setFontSize(fontSize)
    for (const line of lines) {
      ensure(lineHeight)
      doc.text(line, x, y, width ? { maxWidth: width } : undefined)
      y += lineHeight
    }
  }
  function split(text:string, width:number, fontSize=9.2, font:'normal'|'bold'='normal'):string[] {
    doc.setFont('helvetica',font)
    doc.setFontSize(fontSize)
    return doc.splitTextToSize(pdfText(text), width) as string[]
  }

  pageHeader()
  doc.setFont('helvetica','bold')
  doc.setFontSize(17)
  const title = split(label, CONTENT_WIDTH, 17, 'bold')
  writeLines(title, 17, 8, LEFT, 'bold')
  y += 2
  doc.setTextColor(81, 98, 108)
  writeLines([questions.length + ' preguntas  |  A4  |  ' + (withSolutions ? 'Incluye solucionario' : 'Sin respuestas')], 9, 5)
  writeLines(['Generado: ' + new Date().toLocaleDateString('es-ES')], 8, 5)
  doc.setTextColor(26, 39, 49)
  y += 6

  questions.forEach((q, index) => {
    const heading = 'PREGUNTA ' + (index + 1)
    const questionLines = split(q.question, CONTENT_WIDTH, 10, 'bold')
    const optionLines = LETTERS.map(letter => split(letter + ')  ' + q.options[letter], CONTENT_WIDTH-5, 9.2))
    const estimated = 6 + questionLines.length*5 + optionLines.reduce((s,lines)=>s+lines.length*4.65+2, 0) + 7
    // Avoid orphan question headings when a question fits a new page.
    if (estimated < BOTTOM-30 && y+estimated > BOTTOM) nextPage()
    ensure(13)
    doc.setTextColor(14, 108, 116)
    writeLines([heading], 8.5, 5.5, LEFT, 'bold')
    doc.setTextColor(26, 39, 49)
    writeLines(questionLines, 10, 5.2, LEFT, 'bold')
    y += 2
    LETTERS.forEach((letter, i) => {
      writeLines(optionLines[i], 9.2, 4.65, LEFT+4)
      y += 1.6
    })
    y += 5
  })

  // A printable answer grid. Solutions are never exposed in the PDF of an active test.
  nextPage()
  doc.setFont('helvetica','bold')
  doc.setFontSize(14)
  doc.text('HOJA DE RESPUESTAS', LEFT, y)
  y += 8
  doc.setFont('helvetica','normal')
  doc.setFontSize(8)
  doc.setTextColor(81, 98, 108)
  doc.text('Marca una opcion por pregunta. Las no contestadas quedan en blanco.', LEFT, y)
  doc.setTextColor(26, 39, 49)
  y += 11
  for (let index=0; index<questions.length; index++) {
    const column = Math.floor(index/34)
    const row = index%34
    if (column>2) { // More than 102 questions: start another answer sheet.
      if (row===0) nextPage()
    }
    const x = LEFT + (column%3)*59
    const cellY = y + row*6.3
    doc.setFont('helvetica','normal')
    doc.setFontSize(8.5)
    doc.text(String(index+1).padStart(3,'0')+'   A  B  C  D', x, cellY)
  }
  // The grid is at most 100 questions for CAP tests; larger bank sessions
  // are also supported by starting additional answer sheets when necessary.

  if (withSolutions) {
    nextPage()
    doc.setFont('helvetica','bold')
    doc.setFontSize(15)
    doc.text('SOLUCIONARIO', LEFT, y)
    y += 10
    doc.setFont('helvetica','normal')
    doc.setFontSize(9)
    doc.setTextColor(81, 98, 108)
    doc.text('Las preguntas excluidas de puntuacion figuran como NP.', LEFT, y)
    doc.setTextColor(26, 39, 49)
    y += 10
    questions.forEach((q,i)=>{
      const col = i % 4
      const row = Math.floor(i / 4)
      if (row>0 && row%45===0 && col===0) nextPage()
      const onPageRow = row%45
      const letter = q.scoringEligible===false ? 'NP' : q.correctAnswer
      const x=LEFT+col*43.5
      const cellY=y+onPageRow*5.1
      doc.setFontSize(9)
      doc.text(String(i+1).padStart(3,'0')+'. '+letter, x, cellY)
    })
  }
  const totalPages = doc.getNumberOfPages()
  for (let p=1;p<=totalPages;p++) {
    doc.setPage(p)
    doc.setDrawColor(220, 228, 229)
    doc.line(LEFT, 282, PAGE_WIDTH-RIGHT, 282)
    doc.setTextColor(102, 113, 122)
    doc.setFont('helvetica','normal')
    doc.setFontSize(8)
    doc.text('CAP Test | Material de preparacion. No sustituye las fuentes oficiales.', LEFT, 287.5)
    doc.text(p + ' / ' + totalPages, PAGE_WIDTH-RIGHT, 287.5, {align:'right'})
  }
  doc.save(fileName(label, withSolutions))
}
