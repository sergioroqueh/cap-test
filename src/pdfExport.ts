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

  // Answer sheet: in the study PDF, the correct option is visibly filled.
  // An editorially excluded question NEVER presents a provisional key as correct.
  // Blank PDFs keep four empty boxes so the test can still be printed and answered.
  nextPage()
  function answerSheetHeading() {
    doc.setFont('helvetica','bold')
    doc.setFontSize(14)
    doc.setTextColor(26,39,49)
    doc.text(withSolutions ? 'HOJA DE RESPUESTAS CORRECTAS' : 'HOJA DE RESPUESTAS', LEFT, y)
    y += 8
    doc.setFont('helvetica','normal')
    doc.setFontSize(8)
    doc.setTextColor(81,98,108)
    doc.text(withSolutions
      ? 'Casilla rellena = respuesta correcta. NP = pregunta sin puntuacion.'
      : 'Marca una opcion por pregunta. Las no contestadas quedan en blanco.', LEFT, y)
    y += 11
  }
  answerSheetHeading()
  const ROWS_PER_COLUMN=34
  const ENTRIES_PER_PAGE=ROWS_PER_COLUMN*3
  for (let index=0; index<questions.length; index++) {
    if (index>0 && index%ENTRIES_PER_PAGE===0) {
      nextPage()
      answerSheetHeading()
    }
    const localIndex=index%ENTRIES_PER_PAGE
    const column=Math.floor(localIndex/ROWS_PER_COLUMN)
    const row=localIndex%ROWS_PER_COLUMN
    const x=LEFT+column*59
    const cellY=y+row*6.3
    const question=questions[index]
    const answer=question.scoringEligible===false ? null : question.correctAnswer
    doc.setFont('helvetica','normal')
    doc.setFontSize(8.5)
    doc.setTextColor(26,39,49)
    doc.text(String(index+1).padStart(3,'0'),x,cellY)
    if (withSolutions && !answer) {
      doc.setFont('helvetica','bold')
      doc.setTextColor(105,68,33)
      doc.text('NP - sin puntuar',x+11,cellY)
      continue
    }
    LETTERS.forEach((letter, letterIndex)=>{
      const boxX=x+12+letterIndex*9.6
      const boxY=cellY-3.7
      const chosen=withSolutions && answer===letter
      if (chosen) {
        // Dark fill with white bold letter remains identifiable when printed in B/W.
        doc.setFillColor(16,84,94)
        doc.roundedRect(boxX,boxY,7.8,6,1,1,'F')
        doc.setTextColor(255,255,255)
        doc.setFont('helvetica','bold')
      } else {
        doc.setDrawColor(145,155,159)
        doc.setLineWidth(0.22)
        doc.roundedRect(boxX,boxY,7.8,6,1,1,'S')
        doc.setTextColor(26,39,49)
        doc.setFont('helvetica','normal')
      }
      doc.setFontSize(8.5)
      doc.text(letter,boxX+3.9,cellY+0.3,{align:'center'})
    })
  }

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
