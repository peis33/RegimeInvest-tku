// Exact translations only. Never invent a rationale from an allocation delta.
export function judgeReasonText(value) {
  const text = String(value || '').trim()
    .replace(/選舉[_-]score|選股[_-]score|selection[_-]score/gi, '選股評分');
  const translations = {
    'maintain due to insufficient evidence to justify a change': '目前證據不足以支持調整，因此維持原配置',
    'lowest risk and poor performance': '風險最低，但表現不佳',
    'high risk and concentration despite strong expected return': '雖然預估報酬較高，但風險與持股集中程度也高',
    'low risk and high selection score': '風險較低，選股評分較高',
    'low risk and strong selection score, reducing weight': '風險較低、選股評分較高，仍建議減少配置',
    'low risk and selection score, maintaining current weight': '風險與選股評分較低，建議維持配置',
    'high risk and low selection score, maintaining currentweight': '風險較高、選股評分較低，建議維持配置',
    'moderate risk and expected return': '風險與預估報酬均屬中等',
    'high risk and concentration': '風險與持股集中程度較高',
    'high risk and poor performance despite high expected return': '雖然預估報酬較高，但風險高且表現不佳',
    'high risk and concentration despite high expected return': '雖然預估報酬較高，但風險與持股集中程度也高',
    'high risk and concentration despite strong selection score': '雖然選股評分較高，但風險與持股集中程度也高',
    'low risk and low concentration despite lower expected return': '雖然預估報酬較低，但風險與持股集中程度也低',
    'low expected return and high risk': '預估報酬較低，風險較高',
    'high expected return and low risk': '預估報酬較高，風險較低',
    'low risk and high expected return': '風險較低，預估報酬較高',
    'neutral expected return and risk': '預估報酬與風險均屬中性',
    'high risk and low expected return, despite recent news about': 'Agent 提到風險較高、預估報酬較低',
    'increase due to lower risk and higher expected return': '考量風險較低且預估報酬較高，建議增加配置',
    'increase due to lower risk and selection score': 'Agent 提到較低的風險與選股評分，並建議增加配置',
    'maintain due to insufficient evidence for a change': '支持調整的證據不足，因此維持配置',
    'increase due to high risk and concentration, despite lower-t': 'Agent 提到高風險與持股集中，仍建議增加配置',
    'decrease due to high risk and concentration, despite higher-': 'Agent 考量高風險與持股集中，建議減少配置',
  };
  const key = text.toLowerCase().replace(/\s*\(R\d+\)?$/i, '').replace(/[\s,.!。(]+$/, '');
  if (translations[key]) return translations[key];
  if (/^high risk and poor performance\s*,\s*(?:risk\s*=\s*[\d.]+\s*,\s*)?expected_rank\s*$/i.test(text)) {
    return '風險較高，表現不佳';
  }
  if (!text) return '';
  // An untranslated fragment is not a user-facing explanation.  Returning an
  // empty value lets the caller use the verified evidence or omit the line,
  // instead of showing a vague "reason pending" sentence.
  if (/despite mediocre\s*[.!。]?$/i.test(text)) return '';
  // Allow proper names/acronyms in Chinese prose, but do not silently expose
  // untranslated English sentences as a finished localized explanation.
  if (/[A-Za-z]{2,}(?:[ ,;:-]+[A-Za-z]{2,}){3,}/.test(text)) {
    return ''; // Untranslated prose is retained in source data, not replaced by a fabricated speech.
  }
  return text;
}
