// Presentation-only summaries derived from saved, validated decisions.
import { judgeReasonText } from './judgeReasonText';
const number = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export const shortNumber = (v) => Number(Number(v).toFixed(2)).toString();
const cash = (id) => String(id).toUpperCase() === 'CASH';
function localizeMeetingText(value) {
  return String(value || '')
    .replace(/引用(?:證據)?\s*ID\s*[:：]?\s*(?:[A-Z][A-Z0-9]*_\d+(?:_\d+)*)(?:\s*[,，、]\s*[A-Z][A-Z0-9]*_\d+(?:_\d+)*)*\s*[,，]?\s*/gi, '')
    .replace(/\b(?:REGIME|RISK|ER|SCORE)_\d+\s*[:：]\s*\d{4,6}\s*/g, '')
    .replace(/REGIME_\d+\s*[:：]\s*(?=市場狀態)/g, '')
    .replace(/新聞\s*(?:NEWS_\d+_\d+(?:\s*[-–~～]\s*\d+)?)(?:\s*[、,，]\s*NEWS_\d+_\d+(?:\s*[-–~～]\s*\d+)?)*\s*/gi, '新聞')
    .replace(/\bE\d+\s*[:：]\s*\d{4,6}\s*[^，,。；;]*\b(?:risk|expected_return|selection_score)\s*=\s*[\d.]+/g, '')
    .replace(/NEWS_\d+_\d+\s*[-–~～]\s*\d+/gi, '')
    .replace(/引用(?:證據)?\s*ID\s*[:：]?\s*(?:NEWS_\d+_\d+[\s,，、]*)+/gi, '')
    // Raw model scales are not user-facing percentages. Preserve surrounding
    // qualitative reasons and actual allocation numbers instead.
    .replace(/\b(?:risk|expected_return|selection_score|fitness_score|final_weight|HHI)\s*[=＝]\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?%?/gi, '')
    .replace(/[，,]\s*[，,]/g, '，')
    .replace(/引用(?:證據)?\s*(?:[A-Z][A-Z0-9]*_\d+(?:_\d+)*|E\d+)(?:\s*(?:與|和|、|至|到|,|，)\s*(?:[A-Z][A-Z0-9]*_\d+(?:_\d+)*|E\d+))*[，,：:]?\s*/gi, '')
    .replace(/NEWS_\d+_\d+\s*(?:至|到|[-–~～])\s*NEWS_\d+_\d+/gi, '')
    .replace(/NEWS_\d+_\d+/gi, '')
    .replace(/MTA_\d+/gi, '市場轉換時間模型')
    .replace(/REGIME_\d+/gi, '市場狀態模型')
    .replace(/DURATION_\d+/gi, '市場狀態持續時間估計')
    .replace(/RISK_\d+(?:_\d+)*/g, '波動風險')
    .replace(/ER_\d+(?:_\d+)*/g, '模型預估報酬')
    .replace(/SCORE_\d+(?:_\d+)*/g, '選股評分')
    .replace(/WEIGHT_\d+(?:_\d+)*/g, '原配置')
    .replace(/CONC_\d+(?:_\d+)*/g, '持股集中程度')
    .replace(/\bE\d+\b/g, '參考資料')
    .replace(/Yahoo(?:\s+Finance)?/gi, '')
    .replace(/台股個股新聞頁\s*[：:]\s*/gi, '')
    .replace(/來源摘要（非全文）：/g, '')
    .replace(/來源=[^，,。；;]+/g, '')
    .replace(/波動風險\s*[,，:：]\s*風險最([高低])/g, '股價波動風險在這組股票中最$1')
    .replace(/波動風險\s*[,，:：]\s*風險第\s*(\d+)\s*高/g, '股價波動風險在這組股票中由高到低排第 $1')
    .replace(/模型預估報酬\s*[,，:：]\s*(?:預期回報|預期報酬|預估報酬)最([高低])/g, '模型預估報酬在這組股票中最$1')
    .replace(/Sideways/gi, '盤整')
    .replace(/\bBull\b/gi, '偏多')
    .replace(/\bBear\b/gi, '偏空');
}
function paragraphPunctuation(text) {
  return text.split('\n\n').map(part => {
    const body = part.trim().replace(/[。！？!?，,；;：:]+$/u, '')
      .replace(/[。！？!?；;：:]+/gu, '，').replace(/[,，](?:\s*[,，])+/g, '，').replace(/^[，,]\s*|[，,]\s*$/g, '');
    return body ? `${body}。` : '';
  }).filter(Boolean).join('\n\n');
}
const stance = {
  return_priority: '我比較重視報酬機會。', score_priority: '我優先考慮整體評估較好的股票。',
  risk_control: '我比較重視控制風險。', concentration_control: '我希望避免資金過度集中。',
  cash_buffer: '我希望保留現金，增加調整空間。', balanced: '我希望兼顧報酬與風險。',
};
function stockName(data, id) {
  if (cash(id)) return '現金';
  const row = data?.portfolio?.find((r) => String(r.stock_id) === String(id));
  return row?.name || row?.stock_name || String(id);
}

function newsContent(value) {
  const text = String(value || '');
  const title = text.match(/(?:Yahoo\s+台股個股新聞頁|Yahoo(?:\s+Finance)?\s+新聞|新聞|news)\s*[：:]\s*(.*?)(?:；來源摘要（非全文）：|；來源=|；日期=|；連結=|$)/i)?.[1];
  const summary = text.match(/來源摘要（非全文）：(.*?)(?:；來源=|；日期=|；連結=|$)/)?.[1];
  const content = String(title || summary || '')
    .replace(/^Yahoo(?:\s+Finance)?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!content) return '';
  return content.length > 88 ? `${content.slice(0, 88)}…` : content;
}

function selectedEvidenceIds(decision, asset) {
  const ids = decision?.stock_evidence_ids?.[asset];
  if (Array.isArray(ids)) return ids;
  return [];
}

function selectedNewsNote(data, decision, asset) {
  const catalog = data?.discussion?.evidence_catalog || {};
  for (const id of selectedEvidenceIds(decision, asset)) {
    const evidence = catalog[id];
    if (evidence?.kind !== 'yahoo_news' || String(evidence.asset) !== String(asset)) continue;
    const content = newsContent(evidence.text);
    if (content) return `消息面提到「${content}」`;
  }
  return '';
}

function referencedNewsNote(data, decision, asset, rawReason = '') {
  const catalog = data?.discussion?.evidence_catalog || {};
  const ids = selectedEvidenceIds(decision, asset);
  const referencedIds = String(rawReason).match(/NEWS_\d+_\d+/gi) || [];
  for (const id of [...ids, ...referencedIds]) {
    const evidence = catalog[id];
    if (evidence?.kind !== 'yahoo_news' || String(evidence.asset) !== String(asset)) continue;
    const content = newsContent(evidence.text);
    if (content) return `消息面提到「${content}」`;
  }
  return '';
}
export function suggestionRows(data, decision, includeCash = false) {
  return Object.entries(decision?.weight_changes_pp || {}).filter(([id, v]) => (includeCash || !cash(id)) && number(v) !== null).map(([id, value]) => {
    const delta = Number(value);
    const row = data?.portfolio?.find((r) => String(r.stock_id) === id);
    const base = number(decision?.stock_facts?.[id]?.base_weight_percent) ?? number(row?.final_weight_percent);
    const target = number(decision?.advisory_weights?.[id]) ?? (base === null ? null : base + delta);
    return { id, code: cash(id) ? '' : id, name: stockName(data, id), delta, base, target,
      label: Math.abs(delta) < 0.005 ? '→ 維持' : `${delta > 0 ? '↑' : '↓'} ${shortNumber(Math.abs(delta))}` };
  });
}
function actionText(row) {
  if (Math.abs(row.delta) < 0.005) return `維持${row.name}${row.base === null ? '的原配置' : ` ${shortNumber(row.base)}% 的配置`}`;
  return `${row.name}${row.base === null ? '' : `原本占 ${shortNumber(row.base)}%，我建議`}${row.delta > 0 ? '增加' : '減少'} ${shortNumber(Math.abs(row.delta))} 個百分點${row.target === null ? '' : `，調整為 ${shortNumber(row.target)}%`}`;
}
function deltaText(delta) {
  return Math.abs(delta) < 0.005 ? '維持原配置' : `${delta > 0 ? '增加' : '減少'} ${shortNumber(Math.abs(delta))} 個百分點`;
}
function finalAgentDecision(discussion, role) {
  const round = Number(discussion?.round_count);
  if (!Number.isFinite(round) || round < 1) return null;
  return discussion?.structured_decisions?.[`${role}_round${round}`] || null;
}
function sameAgentDelta(discussion, asset) {
  const qwen = finalAgentDecision(discussion, 'risk_seeking');
  const mistral = finalAgentDecision(discussion, 'risk_averse');
  const qwenDelta = number(qwen?.weight_changes_pp?.[asset]);
  const mistralDelta = number(mistral?.weight_changes_pp?.[asset]);
  return qwenDelta !== null && mistralDelta !== null && Math.abs(qwenDelta - mistralDelta) <= 1e-9;
}
function deltaDirection(value) {
  const delta = number(value);
  if (delta === null) return null;
  return Math.abs(delta) < 0.005 ? 'maintain' : delta > 0 ? 'increase' : 'decrease';
}
function sameAgentDirection(discussion, asset) {
  const qwen = finalAgentDecision(discussion, 'risk_seeking');
  const mistral = finalAgentDecision(discussion, 'risk_averse');
  const qwenDirection = deltaDirection(qwen?.weight_changes_pp?.[asset]);
  const mistralDirection = deltaDirection(mistral?.weight_changes_pp?.[asset]);
  return qwenDirection !== null && qwenDirection === mistralDirection;
}
function sameFinalAgentProposal(discussion) {
  const qwen = finalAgentDecision(discussion, 'risk_seeking');
  const mistral = finalAgentDecision(discussion, 'risk_averse');
  if (!qwen || !mistral) return false;
  const ids = new Set([
    ...Object.keys(qwen.weight_changes_pp || {}),
    ...Object.keys(mistral.weight_changes_pp || {}),
  ].filter(id => !cash(id)));
  return ids.size > 0 && [...ids].every(id => sameAgentDelta(discussion, id));
}
function normalizedAgreementLabel(lastRound, agentsAgree) {
  const label = lastRound?.agreement_label;
  if (!label) return '';
  if (agentsAgree) {
    return label
      .replace(/^建議比例接近/u, '建議比例一致')
      .replace('但理由尚未取得一致', '但部分對手主張尚未完整回應');
  }
  return label;
}
// Presentation-only wording: never derive a reason from the selected action.
function plainJudgeText(value) {
  return judgeReasonText(localizeMeetingText(value))
    .replace(/引用\s*(?:E\d+|[A-Z]+_[A-Za-z0-9_]+)(?:\s*[與和、,]\s*(?:E\d+|[A-Z]+_[A-Za-z0-9_]+))*[，,：:]?\s*/g, '')
    .replace(/Lowest risk and poor performance/gi, '風險最低，但表現不佳')
    .replace(/選股分數/g, '選股評分')
    .replace(/強化收益/g, '提升報酬')
    .replace(/小幅減碼/g, '小幅減少配置')
    .replace(/幅度屬判斷，資料無法證明哪個幅度較佳/g, '調整多少是這次討論的判斷，目前資料無法證明這個幅度最好')
    .replace(/無法證明哪個幅度較佳/g, '目前資料無法證明哪個調整幅度最好')
    .trim();
}
function agentReason(data, decision, id) {
  // Backend structured decisions now contain an evidence-grounded display
  // bridge: news fact -> possible impact -> allocation direction.  Keep that
  // complete explanation instead of replacing it with only the headline.
  const generatedReason = decision?.display_reason?.[id];
  if (generatedReason) {
    const rendered = conciseReason(generatedReason);
    if (rendered) return `${rendered}${/[。！？]$/.test(rendered) ? '' : '。'}`;
  }
  const rawReason =
    decision?.weight_change_reasons?.[id]
      ?? decision?.llm_weight_change_reasons?.[id]
      ?? '';
  const newsNote = referencedNewsNote(data, decision, id, rawReason);

  const reason = conciseReason(rawReason);
  if (reason) return `${reason}${/[。！？]$/.test(reason) ? '' : '。'}`;

  if (newsNote && /NEWS_|新聞|消息面/i.test(String(rawReason))) {
    return `${newsNote}。`;
  }

  const evidence = conciseEvidence(data, decision, id);
  if (evidence) return `${evidence}。`;

  // Do not show an internal "reason pending" placeholder.  The action is
  // already stated in the same stock line, while this wording remains honest
  // when a legacy record contains no usable explanation at all.
  return '依本輪整理的資料調整配置。';
}
function conciseReason(value) {
  // Remove only introductory wording, not qualifications or causal clauses.
  return plainJudgeText(value)
    .replace(/^(?:我認為|我建議|主要考量是|主要原因是|原因是|根據上述資料|根據這些資料|根據消息面|綜合雙方討論後)[，：:]?\s*/, '')
    .replace(/[，,]?\s*(?:作為本次配置判斷參考|本次建議(?:增加|減少|維持)配置)[。.]?\s*$/u, '')
    .trim();
}
function conciseEvidence(data, decision, id) {
  return evidenceNote(data, decision, id)
    .replace(/^我(?:參考的資料顯示|引用的資料中|引用的選股評估中)，/, '')
    .replace('，這也是討論配置時需要留意的地方', '')
    .replace('，但這不代表未來一定會有同樣的表現', '，不代表保證報酬');
}
function claimText(data, id) {
  const c = data?.discussion?.claims?.[id];
  if (!c || !c.asset) return null;
  const action = {increase:'增加',decrease:'減少',maintain:'維持'}[c.direction];
  return action ? `${action}${stockName(data,c.asset)}的配置` : null;
}
function evidenceNote(data, decision, asset) {
  // Only show referenced rank facts; do not infer a reason from the sign alone.
  const ids = asset ? decision?.stock_evidence_ids?.[asset] || [] : Object.values(decision?.stock_evidence_ids || {}).flat();
  for (const id of ids) {
    const e = data?.discussion?.evidence_catalog?.[id];
    if (!e?.asset) continue;
    const t = String(e.text || '');
    const name = stockName(data, e.asset);
    if (e.kind === 'yahoo_news') {
      const content = newsContent(t);
      if (content) return `消息面提到「${content}」`;
    }
    if (t.includes('expected_return=') && t.includes('排名第1')) return `我參考的資料顯示，${name}的模型預估報酬在這組股票中最高，但這不代表未來一定會有同樣的表現。`;
    if (t.includes('risk=') && t.includes('風險最高')) return `我參考的資料顯示，${name}的波動風險在這組股票中最高，這也是討論配置時需要留意的地方。`;
    if (t.includes('risk=') && t.includes('風險最低')) return `我參考的資料顯示，${name}的波動風險在這組股票中最低。`;
    const rank = t.match(/(?:排名第|風險第)(\d+)/)?.[1];
    if (rank && t.includes('risk=')) return `我引用的資料中，${name}的波動風險在這組股票中由高到低排第 ${rank}。`;
    if (rank && t.includes('expected_return=')) return `我引用的資料中，${name}的模型預估報酬在這組股票中排第 ${rank}。`;
    if (rank && t.includes('selection_score=')) return `我引用的選股評估中，${name}的綜合評分在這組股票中排第 ${rank}。`;
  }
  return '';
}
function contradictoryAcceptance(data, decision, id) {
  const claim = data?.discussion?.claims?.[id];
  const delta = decision.weight_changes_pp?.[claim?.asset];
  if (typeof delta !== 'number' || !Number.isFinite(delta) || !claim?.direction) return false;
  return (delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'maintain') !== claim.direction;
}
function plainClaimResponse(data, decision, opponent, precedingText = '') {
  const response = decision.claim_response;
  if (response.response === 'agree' && contradictoryAcceptance(data, decision, response.claim_id)) return '';
  const claim = data?.discussion?.claims?.[response.claim_id];
  const subject = claimText(data, response.claim_id);
  const label = {agree:'同意這個方向',disagree:'持不同看法',insufficient_evidence:'暫不採用這個方向'}[response.response] || '暫不採用這個方向';
  const opening = `對於 ${opponent}${subject ? `提出「${subject}」` : '的主張'}，我${label}。`;
  if (response.response === 'insufficient_evidence') return opening;
  // Reuse only catalog evidence actually cited in the reply and attributed to
  // this asset. Never display raw model jargon or turn an unscaled risk into %.
  const asset = claim?.asset;
  const cited = String(response.reason || '').match(/\b[A-Z][A-Z0-9]*_[A-Za-z0-9_]+\b/g) || [];
  const allowed = decision.stock_evidence_ids?.[asset] || [];
  const ids = cited.filter(id => allowed.includes(id) && data.discussion.evidence_catalog?.[id]?.asset === asset);
  const note = asset ? evidenceNote(data, {stock_evidence_ids:{[asset]:ids}}, asset) : '';
  return opening + (note && !precedingText.includes(note) ? note : '');
}
export function meetingMessages(data) {
  const discussion = data?.discussion;
  if (!discussion) return [];
  const messages = [];
  const market = data.market || {};
  const regime = {Bull:'偏多',Bear:'偏空',Sideways:'盤整'}[market.predicted_regime];
  const probability = number(market[`prob_${market.predicted_regime}`]);
  messages.push({id:'summary_intro',role:'moderator',type:'moderator',round:0,speaker:'主持人',text:
    `我們先看看這次的投資配置。${regime ? `目前模型判斷市場較可能${regime}${probability === null ? '' : `，機率約為 ${Math.round(probability * 100)}%`}。` : ''}接下來請 Qwen 從報酬機會出發，Mistral 從風險控制出發，一起討論哪些股票值得調整、哪些適合保留。`});
  for (const [key, d] of Object.entries(discussion.structured_decisions || {})) {
    const match = /^(risk_seeking|risk_averse)_round(\d+)$/.exec(key);
    if (!match) continue;
    const rows = suggestionRows(data,d);
    const changed = rows.filter((r)=>Math.abs(r.delta)>=0.005).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    const previous = discussion.structured_decisions[`${match[1]}_round${Number(match[2]) - 1}`];
    const previousRows = suggestionRows(data, previous);
    // Compare only complete matching stock sets; missing values are not zero.
    const canCompare = rows.length > 0 && rows.length === previousRows.length &&
      rows.every(row => previousRows.some(old => old.id === row.id));
    const lines = [];
    const inlineAgreements = new Set();
    const agreementFor = (asset) => {
      const ids = d.claim_response ? (d.claim_response.response === 'agree' ? [d.claim_response.claim_id] : []) : d.accepted_opponent_claim_ids || [];
      const matches = ids.filter(id => String(discussion.claims?.[id]?.asset) === asset && !contradictoryAcceptance(data,d,id));
      if (!matches.length) return '';
      matches.forEach(id => inlineAgreements.add(id));
      return `我認同 ${match[1] === 'risk_seeking' ? 'Mistral' : 'Qwen'} 提出${claimText(data,matches[0])}的方向。`;
    };
    if (canCompare) {
      const revised = rows.filter(row => Math.abs(row.delta - previousRows.find(old => old.id === row.id).delta) >= 0.005)
        .sort((a,b) => Math.abs(b.delta - previousRows.find(old => old.id === b.id).delta) - Math.abs(a.delta - previousRows.find(old => old.id === a.id).delta));
      if (revised.length) {
        lines.push(`相較上一輪，我調整了 ${revised.length} 檔股票的建議。`);
        for (const row of revised) {
          const old = previousRows.find(old => old.id === row.id);
          lines.push(`${row.name}從上一輪建議「${deltaText(old.delta)}」，改為「${deltaText(row.delta)}」。${agreementFor(row.id)}${agentReason(data,d,row.id)}`);
        }
        if (revised.length < rows.length) lines.push('其餘股票維持上一輪的建議。');
      } else lines.push(changed.length ? '這一輪的股票增減建議與上一輪相同，並非全部維持原始配置。' : '和上一輪一樣，這一輪仍建議維持所有股票的原始配置。');
    } else if (changed.length) {
      lines.push(stance[d.stance_code] || '這是我對本輪配置的看法。');
      for (const row of changed) {
        lines.push(`我建議${row.name}${deltaText(row.delta)}。${agentReason(data,d,row.id)}`);
      }
      if (changed.length < rows.length) lines.push('其餘股票維持原配置。');
    } else {
      lines.push(stance[d.stance_code] || '這是我對本輪配置的看法。');
      // Do not collapse an all-maintain first round into the first news item.
      // The backend still has one validated reason per stock, and the user
      // needs to see that every stock was actually considered.
      for (const row of rows) {
        const reason = agentReason(data, d, row.id);
        lines.push(`${row.name}：${reason || '本輪維持原配置。'}`);
      }
    }
    const opponent = match[1] === 'risk_seeking' ? 'Mistral' : 'Qwen';
    const alreadySharedDirection = (id) => {
      const claim = discussion.claims?.[id];
      const old = previousRows.find(row => row.id === String(claim?.asset));
      if (!old || contradictoryAcceptance(data,d,id)) return false;
      const direction = Math.abs(old.delta) < 0.005 ? 'maintain' : old.delta > 0 ? 'increase' : 'decrease';
      return direction === claim?.direction;
    };
    if(d.claim_response) {
      if (!inlineAgreements.has(d.claim_response.claim_id) && !(d.claim_response.response === 'agree' && alreadySharedDirection(d.claim_response.claim_id)))
        lines.push(plainClaimResponse(data,d,opponent,lines.join('')));
    }
    for (const [field,label] of [['accepted_opponent_claim_ids','我認同這個方向'],['rebutted_opponent_claim_ids','我仍持不同看法']]) {
      if(d.claim_response) continue;
      const ids = d[field] || [];
      const conflicts = field === 'accepted_opponent_claim_ids' ? ids.filter(id => contradictoryAcceptance(data,d,id)) : [];
      const visibleIds = ids.filter(id => !inlineAgreements.has(id) && !conflicts.includes(id) &&
        !(field === 'accepted_opponent_claim_ids' && alreadySharedDirection(id)));
      const parts = [...new Set(visibleIds.map((id)=>claimText(data,id)).filter(Boolean))];
      if (parts.length) {
        const sameDirection = field === 'rebutted_opponent_claim_ids' && visibleIds.every((id) => {
          const claim = discussion.claims?.[id];
          return claim?.asset && deltaDirection(d.weight_changes_pp?.[claim.asset]) === claim.direction;
        });
        const effectiveLabel = sameDirection
          ? '理由仍有不同看法，但配置方向相同'
          : label;
        lines.push(`至於 ${opponent} 提到${parts.slice(0,2).join('、')}，${effectiveLabel}。`);
      }
    }
    messages.push({id:key,role:match[1],type:'agent',round:Number(match[2]),speaker:match[1]==='risk_seeking'?'報酬觀點 · Qwen':'風險觀點 · Mistral',text:lines.join('\n\n')});
  }
  messages.sort((a,b)=>a.round-b.round || (a.role==='risk_seeking'?-1:1));
  const judge=discussion.structured_decisions?.judge;
  if(judge) {
    const lastRound=discussion.rounds?.[discussion.rounds.length-1];
    const finalAgentsAgree = sameFinalAgentProposal(discussion);
    const agreementLabel = normalizedAgreementLabel(lastRound, finalAgentsAgree);
    const claimResponseIncomplete = agreementLabel.includes('部分對手主張')
      || lastRound?.reasoning_agreed === false;
    const hasAgreementLabel = agreementLabel && agreementLabel !== '建議比例仍有差異';
    const lines=[discussion.consensus_status==='consensus'
      ? '聽完雙方的討論，我們已經達成共識。'
      : finalAgentsAgree
        ? hasAgreementLabel
          ? `經過 ${discussion.round_count || ''} 輪討論，我已整合兩邊的意見，提出這次的配置建議。`
          : `經過 ${discussion.round_count || ''} 輪討論，雙方最後的配置建議一致，${claimResponseIncomplete ? '但部分對手主張尚未完整回應' : '理由方向也一致'}。我已整合兩邊的意見，提出這次的配置建議。`
        : hasAgreementLabel
          ? `經過 ${discussion.round_count || ''} 輪討論，我已整合兩邊的意見，提出這次的配置建議。`
          : `經過 ${discussion.round_count || ''} 輪討論，雙方仍有一些不同看法。我已整合兩邊的意見，提出這次的配置建議。`];
    if(hasAgreementLabel) lines.unshift(`${agreementLabel}。`);
    const changed=suggestionRows(data,judge).filter(r=>Math.abs(r.delta)>=0.005).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    const rationaleRows=Object.entries(judge.judge_rationales||{}).filter(([,r])=>(r?.source==='judge_model' || r?.source==='selected_evidence_and_judge_delta') && (r?.comparison || r?.reason))
      .sort(([a],[b]) => Math.abs(number(judge.weight_changes_pp?.[b]) ?? 0) - Math.abs(number(judge.weight_changes_pp?.[a]) ?? 0));
    if(judge.explanation_mode === 'decision_facts_comparison') {
      lines.length=0;
      lines.push('以下列出最後決定與參考資料。');
      for(const row of suggestionRows(data,judge).filter(r=>r.id !== 'CASH')) {
        const card=judge.decision_disclosure?.[row.id] || {};
        const facts=(card.facts||[]).map(f=>plainJudgeText(f.text)).filter(Boolean);
        const comparison=plainJudgeText(card.comparison);
        lines.push([
          `最後決定：${row.name}${deltaText(row.delta)}${row.target === null ? '' : `，配置為 ${shortNumber(row.target)}%`}`,
          `參考資料：${facts.length ? facts.join('，') : '本項沒有可顯示的補充資料'}`,
          comparison ? `雙方建議比較：${comparison}` : '',
        ].join('\n'));
      }
    } else if(rationaleRows.length) {
      const displayRows = changed.length ? changed.map(row => [row.id, judge.judge_rationales?.[row.id] || {}]) : rationaleRows.slice(0,1);
      for(const [id,rationale] of displayRows) {
        const row=suggestionRows(data,judge).find(r=>r.id===id);
        const paragraph = [];
        const choice = judge.choice_decisions?.[id]?.choice;
        if(row) paragraph.push(`${row.name}${deltaText(row.delta)}${row.target === null ? '' : `，配置為 ${shortNumber(row.target)}%`}。`);
        else paragraph.push(`關於${stockName(data,id)}，`);
        if (sameAgentDelta(discussion, id)) {
          const judgeDelta = number(judge.weight_changes_pp?.[id]);
          const qwenDelta = number(finalAgentDecision(discussion, 'risk_seeking')?.weight_changes_pp?.[id]);
          if (judgeDelta !== null && qwenDelta !== null && Math.abs(judgeDelta - qwenDelta) <= 1e-9) {
            paragraph.push('雙方最終建議一致。');
          } else {
            paragraph.push('雙方對此股建議一致，Judge 另行取捨。');
          }
        } else if (sameAgentDirection(discussion, id)) {
          const selectedAdvisor = choice === 'risk_seeking' ? '報酬顧問' : choice === 'risk_averse' ? '風險顧問' : '';
          paragraph.push(`雙方建議方向一致，但調整幅度不同${selectedAdvisor ? `，這次採納${selectedAdvisor}的幅度` : ''}。`);
        } else if(choice === 'risk_seeking') paragraph.push('這次採納了報酬顧問的建議。');
        else if(choice === 'risk_averse') paragraph.push('這次採納了風險顧問的建議。');
        const reason = conciseReason(rationale.reason || judge.display_reason?.[id] || judge.weight_change_reasons?.[id]);
        if (reason) paragraph.push(`${reason}${/[。！？]$/.test(reason) ? '' : '。'}`);
        const note=rationale.source === 'judge_model'
          ? conciseEvidence(data,{stock_evidence_ids:{[id]:rationale.evidence_ids||[]}},id)
          : '';
        if(!note) {
          const news=(rationale.evidence_ids||[]).map(eid=>discussion.evidence_catalog?.[eid]?.text||'').find(t=>t.includes('新聞：'));
          // The evidence catalog may contain a full provider summary.  The
          // meeting view only needs the concrete news event, not the whole
          // article body.
          const title=news?.match(/新聞：(.*?)(?:；來源摘要（非全文）：|；來源=|$)/)?.[1];
          // The backend structured display reason already includes the
          // selected news event (for example, "新聞指出…").  Do not append
          // the same title a second time in the meeting transcript.
          if(title && !/新聞(?:提到|指出)|消息面/.test(reason)) {
            paragraph.push(`參考新聞：「${title}」。`);
          }
        }
        const tradeoff = plainJudgeText(rationale.tradeoff);
        if(tradeoff && tradeoff.replace(/[\s，,。]/g,'') !== reason.replace(/[\s，,。]/g,'')) {
          paragraph.push(`取捨考量是，${tradeoff}`);
        }
        lines.push(paragraph.join(''));
      }
    } else if (changed.length) {
      for (const row of changed) {
        const choice=judge.choice_decisions?.[row.id];
        if(choice) lines.push(`${row.name}：${choice.choice==='risk_seeking'?'採納 Qwen 的建議':choice.choice==='risk_averse'?'採納 Mistral 的建議':'維持原配置'}。`);
        const note=evidenceNote(data,judge,row.id);if(note)lines.push(note);
        lines.push(`${actionText(row)}。`);
      }
    } else lines.push('這次建議維持原本的配置。');
    const unchanged = suggestionRows(data, judge)
      .filter(row => row.id !== 'CASH' && Math.abs(row.delta) < 0.005);
    if (changed.length && unchanged.length && judge.explanation_mode !== 'decision_facts_comparison') {
      const unchangedText = unchanged.map(row =>
        `${row.name}${row.target === null ? '' : ` ${shortNumber(row.target)}%`}`
      ).join('、');
      lines.push(`其餘股票維持原配置：${unchangedText}。`);
    }
    if(judge.judge_numeric_legalization?.applied)lines.unshift('本次未產生有效裁決。以下是舊版系統修正後的歷史紀錄，不可視為有效建議。');
    lines.push('以上是會議提出的參考建議，原始配置尚未被直接改寫。');
    messages.push({id:'judge',role:'judge',type:'judge',round:(discussion.round_count||0)+1,speaker:'主持人 · 最終裁決',text:lines.join('\n\n')});
  }
  return messages.map(message => ({...message, text: paragraphPunctuation(localizeMeetingText(message.text))}));
}
