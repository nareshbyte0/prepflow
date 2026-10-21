const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 44;
const RIGHT = 568;

const cleanText = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, ' ')
  .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function createPageContent(entries, solved, questionCount, topicSummary, pageNumber, totalPages) {
  const commands = [];
  let y = 48;
  const text = (value, x, top, size = 9, color = '0.20 0.27 0.37', font = 'F1') => {
    commands.push(`${color} rg BT /${font} ${size} Tf ${x} ${PAGE_HEIGHT - top} Td (${cleanText(value)}) Tj ET`);
  };
  const line = (x1, top1, x2, top2, color = '0.88 0.91 0.94', width = 0.7) => {
    commands.push(`${color} RG ${width} w ${x1} ${PAGE_HEIGHT - top1} m ${x2} ${PAGE_HEIGHT - top2} l S`);
  };
  const rect = (x, top, width, height, fill, stroke = null) => {
    commands.push(`${fill ? `${fill} rg` : ''} ${stroke ? `${stroke} RG 0.8 w` : ''} ${x} ${PAGE_HEIGHT - top - height} ${width} ${height} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  };
  text('PREPFLOW', LEFT, y, 9, '0.16 0.34 0.58', 'F2');
  text('DSA QUESTION CHECKLIST', LEFT, y + 24, 20, '0.10 0.16 0.25', 'F2');
  text('Numbered questions  |  Tick boxes  |  Topic completion totals', LEFT, y + 41, 9, '0.40 0.47 0.56');
  y += 59;

  rect(LEFT, y, RIGHT - LEFT, 55, '0.95 0.97 0.99', '0.88 0.91 0.94');
  text('YOUR PROGRESS', LEFT + 14, y + 18, 7, '0.40 0.47 0.56', 'F2');
  text(`${solved.size} of ${questionCount} solved`, LEFT + 14, y + 39, 15, '0.10 0.16 0.25', 'F2');
  const barX = LEFT + 205, barY = y + 26, barW = 252;
  rect(barX, barY, barW, 7, '0.86 0.89 0.93');
  rect(barX, barY, barW * (questionCount ? solved.size / questionCount : 0), 7, '0.18 0.44 0.78');
  text(`${questionCount ? Math.round(solved.size / questionCount * 100) : 0}% complete`, barX, y + 45, 8, '0.40 0.47 0.56');
  y += 72;

  const groups = new Map();
  entries.forEach(({ question, index }) => {
    const topic = question.topic || 'Other';
    if (!groups.has(topic)) groups.set(topic, []);
    groups.get(topic).push({ question, index });
  });
  const startTopic = (name, items) => {
    rect(LEFT, y, RIGHT - LEFT, 25, '0.94 0.96 0.98');
    text(name, LEFT + 10, y + 16, 10, '0.15 0.23 0.34', 'F2');
    const summary = topicSummary.get(name) || { done: 0, total: items.length };
    const label = `${summary.done}/${summary.total} solved`;
    text(label, RIGHT - label.length * 5.2 - 10, y + 16, 8, '0.39 0.47 0.57');
    y += 25;
  };
  const ensureRoom = height => {
    if (y + height > 738) return false;
    return true;
  };
  for (const [name, items] of groups) {
    if (!ensureRoom(55)) return { overflow: true };
    startTopic(name, items);
    for (const { question, index } of items) {
      if (!ensureRoom(23)) return { overflow: true };
      const checked = solved.has(index);
      text(`${index + 1}.`, LEFT + 9, y + 14, 8, '0.50 0.56 0.64');
      rect(LEFT + 31, y + 5, 11, 11, checked ? '0.18 0.44 0.78' : null, checked ? '0.18 0.44 0.78' : '0.68 0.73 0.80');
      if (checked) {
        commands.push(`1 1 1 RG 1.3 w ${LEFT + 33} ${PAGE_HEIGHT - y - 1} m ${LEFT + 36} ${PAGE_HEIGHT - y - 4} l ${LEFT + 41} ${PAGE_HEIGHT - y + 2} l S`);
      }
      const title = question.name || 'Untitled question';
      const maxChars = 65;
      text(title.length > maxChars ? `${title.slice(0, maxChars - 1)}...` : title, LEFT + 50, y + 14, 8.5, checked ? '0.43 0.49 0.57' : '0.17 0.24 0.34');
      const difficulty = question.diff || '';
      text(difficulty, RIGHT - difficulty.length * 5.1 - 12, y + 14, 8, difficulty === 'Easy' ? '0.18 0.49 0.30' : difficulty === 'Hard' ? '0.70 0.28 0.25' : '0.61 0.43 0.12');
      line(LEFT + 50, y + 22, RIGHT, y + 22);
      y += 23;
    }
    y += 7;
  }
  line(LEFT, 756, RIGHT, 756);
  text('Prepflow  |  Checklist generated from your current LeetCode progress', LEFT, 772, 7, '0.50 0.56 0.64');
  text(`Page ${pageNumber} of ${totalPages}`, RIGHT - 52, 772, 7, '0.50 0.56 0.64');
  return { content: commands.join('\n') };
}

function buildPdf(pages) {
  const objects = [];
  const add = value => { objects.push(value); return objects.length; };
  const catalogId = add('');
  const pagesId = add('');
  const regularFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const boldFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  pages.forEach(content => {
    const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    const streamId = add(stream);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${streamId} 0 R >>`));
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { output += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return output;
}

export function downloadQuestionChecklistPdf(questions, solvedIndexes) {
  if (!Array.isArray(questions) || !questions.length) throw new Error('The question list is empty, so there is nothing to export.');
  const solved = new Set(questions.map((_, index) => index).filter(index => solvedIndexes.includes(index)));
  const topicSummary = new Map();
  questions.forEach((question, index) => {
    const name = question.topic || 'Other';
    const summary = topicSummary.get(name) || { done: 0, total: 0 };
    summary.total++;
    if (solved.has(index)) summary.done++;
    topicSummary.set(name, summary);
  });
  const pages = [];
  let pending = questions.map((question, index) => ({ question, index }));
  for (let pageNumber = 1; pending.length; pageNumber++) {
    const page = createPageContent(pending, solved, questions.length, topicSummary, pageNumber, 1);
    if (!page.overflow) {
      pages.push(page.content);
      break;
    }
    // Re-render by selecting the largest prefix that fits; keep topic labels with their rows.
    let low = 1, high = pending.length, best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = createPageContent(pending.slice(0, mid), solved, questions.length, topicSummary, pageNumber, 1);
      if (candidate.overflow) high = mid - 1;
      else { best = mid; low = mid + 1; }
    }
    if (!best) throw new Error('Could not lay out the question list for PDF export.');
    pages.push(createPageContent(pending.slice(0, best), solved, questions.length, topicSummary, pageNumber, 1).content);
    pending = pending.slice(best);
  }
  // Rebuild page content to show the final page count in the footer.
  const totalPages = pages.length;
  const finalized = [];
  pending = questions.map((question, index) => ({ question, index }));
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    let low = 1, high = pending.length, best = pending.length;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (createPageContent(pending.slice(0, mid), solved, questions.length, topicSummary, pageNumber, totalPages).overflow) high = mid - 1;
      else { best = mid; low = mid + 1; }
    }
    finalized.push(createPageContent(pending.slice(0, best), solved, questions.length, topicSummary, pageNumber, totalPages).content);
    pending = pending.slice(best);
  }
  const blob = new Blob([buildPdf(finalized)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prepflow-question-checklist.pdf';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
