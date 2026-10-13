function renderMonths(el, cls){
  el.innerHTML = CAL.months.map(m=>{
    const cells=m.cells.map(c=>!c?'<span></span>':`<span class="${[c.sun?'sun':'',(c.ht||c.us)?'h':'',c.ht?'ht':'',c.us?'us':''].join(' ')}">${c.d}</span>`).join('');
    const hol=m.hol.map(h=>`<b class="${h.ht?'h':'u'}">${h.d}</b> ${h.name}`).join(' · ');
    return `<div class="${cls}"><h3>${m.name}<span>${String(m.index+1).padStart(2,'0')}</span></h3><div class="wk"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div><div class="days">${cells}</div><div class="hol">${hol||'&nbsp;'}</div></div>`;
  }).join('');
}
