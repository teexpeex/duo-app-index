'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=s=>/^https:\/\//.test(s)?esc(s):'#';
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-–—]/g,' ');
const date=s=>s?new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Not established';
let data,records=[],detailRecords=[],researchRecords=[],filtered=[],shown=30,status='documented',toastTimer,currentApp=null,returnFocus;
const statusKey=r=>r.status==='Documented support'?'documented':r.status.startsWith('Announced')?'upcoming':'research';
const statusLabel=r=>r.status==='Documented support'?'Documented':r.status.startsWith('Announced')?'Upcoming / unverified':'Needs verification';
const icon=r=>`<span class="app-icon" aria-hidden="true">${r.icon_url?`<img src="${url(r.icon_url)}" alt="" width="47" height="47" loading="lazy" onerror="this.remove()">`:esc(r.name.replace(/^\W+/,'').slice(0,2).toUpperCase())}</span>`;
const evidenceLabel=r=>({'App Store release notes':'Release notes','Apple optimized-app collection':'Apple collection','Developer App Store description':'Developer description','Developer App Store event':'App Store event','Apple announcement':'Apple announcement','App Store preorder':'Preorder','No qualifying evidence found':'Evidence not established'}[r.evidence_type]||r.evidence_type);
function summary(r){if(r.app_id==='6737783441')return 'Outer-display camera preview; camera layouts fill supported screen sizes.';if(r.documented_features.length||r.status!=='Documented support')return r.duo_notes;if(r.evidence_type==='App Store release notes')return 'Duo support documented. Specific capabilities unspecified.';if(r.evidence_type==='Apple optimized-app collection')return 'Specific Duo capabilities unspecified.';return r.duo_notes.startsWith('The developer')?'Specific Duo capabilities and first supporting version unspecified.':r.duo_notes;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600)}

// Browsing controls use these two statuses; research candidates appear only through search or a direct app link.
const publicStatuses=['documented','upcoming'];
const sortValues=['name','support','latest','recent'];
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:'';
const changeDate=r=>[validDate(r.first_added),validDate(r.last_changed)].sort().pop()||'';

function pricingState(r){
  const p=r.pricing||{};
  const established=p.availability==='available'&&typeof p.amount==='number'&&Number.isFinite(p.amount)&&p.amount>=0;
  const label=p.access_type==='apple-arcade'?'Apple Arcade':established?(p.amount===0?'Free download':p.display_price||'$'+p.amount.toFixed(2)):'Price unverified';
  const iap=p.in_app_purchases===true?'In-app purchases':p.in_app_purchases===false?'No IAP listed':'IAP unverified';
  return {p,label,iap,established};
}
function pricingBadges(r){
  const {label,iap,p}=pricingState(r);
  return '<div class="pricing-badges"><span class="price-badge">'+esc(label)+'</span><span class="iap-badge'+(p.in_app_purchases===true?' has-iap':'')+'">'+esc(iap)+'</span></div>';
}
function pricingDetails(r){
  const {p,label,iap}=pricingState(r);
  const source=typeof p.source_url==='string'&&/^https:\/\//.test(p.source_url)?'<a href="'+url(p.source_url)+'" target="_blank" rel="noopener noreferrer">App Store pricing source ↗</a>':'';
  return '<h3>App Store pricing</h3><p class="pricing-detail"><strong>'+esc(label)+'</strong> · '+esc(p.in_app_purchases===false?'No in-app purchases listed':iap)+'</p>'+(p.access_type==='apple-arcade'?'<p class="detail-fineprint arcade-note">Requires Apple Arcade membership.</p>':'')+'<p class="detail-fineprint">'+esc(p.storefront||'US')+' storefront'+(p.currency?' · '+esc(p.currency):'')+' · Checked '+date(validDate(p.checked_at))+(source?'<br>'+source:'')+'</p><p class="detail-fineprint">Free means free to download. Features, subscriptions and in-app purchases can cost extra. Prices and offers can change; confirm in the App Store.</p>';
}
function displayDetails(r){
  const assessment=r.display_assessment||{};
  const canvasLabels={
    not_established:'Full app canvas: not established',
    developer_claim_full:'Full app canvas: developer claim',
    observed_full:'Full app canvas: observed in a sourced report',
    observed_partial:'Partial adaptation: observed in a sourced report',
    observed_legacy:'Compatibility window: observed in a sourced report'
  };
  const sources=Array.isArray(assessment.source_urls)?assessment.source_urls.filter(link=>typeof link==='string'&&/^https:\/\//.test(link)):[];
  return '<h3>Display layout evidence</h3><p class="display-evidence">'+esc(assessment.summary||'Full app-canvas behavior has not been established for this entry.')+'</p><p class="detail-fineprint">'+esc(canvasLabels[assessment.app_canvas]||canvasLabels.not_established)+(assessment.layout==='documented_adaptive'?'<br>Adaptive layout: documented':'')+(validDate(assessment.checked_at)?'<br>Checked '+date(assessment.checked_at):'')+'</p>'+(assessment.media_note?'<p class="detail-fineprint">'+esc(assessment.media_note)+'</p>':'')+(sources.length?'<div class="display-sources">'+sources.map((link,index)=>'<a href="'+url(link)+'" target="_blank" rel="noopener noreferrer">Display evidence '+(index+1)+' ↗</a>').join('')+'</div>':'');
}

function changeMarkup(r){
  const added=validDate(r.first_added),changed=validDate(r.last_changed),when=changeDate(r);
  if(!when)return '<p class="change-summary">Record date not established.</p>';
  const label=changed&&changed>=added?'Changed ':'Added ';
  return '<p class="change-summary">'+label+esc(date(when))+(r.change_note?' · '+esc(r.change_note):'')+'</p>';
}
function viewUrl(appId=null){
  const p=new URLSearchParams();
  if($('search').value)p.set('q',$('search').value);
  if(status==='upcoming')p.set('status',status);
  for(const id of ['category','feature'])if($(id).value)p.set(id,$(id).value);
  if($('detailed').checked)p.set('detailed','1');
  if($('sort').value!=='name')p.set('sort',$('sort').value);
  if(appId)p.set('app',appId);
  return location.pathname+(p.size?'?'+p.toString():'')+'#directory';
}
function saveView(){
  history.replaceState(currentApp?history.state:{duoDetail:false},'',viewUrl(currentApp));
}
function matches(r,terms){
  return (!$('category').value||r.category===$('category').value)
    &&(!$('feature').value||r.documented_features.includes($('feature').value))
    &&(!$('detailed').checked||r.documented_features.length>0)
    &&terms.every(term=>r.searchText.includes(term));
}
function applyFilters(save=true){
  const terms=normalize($('search').value).trim().split(/\s+/).filter(Boolean);
  filtered=records.filter(r=>statusKey(r)===status&&matches(r,terms));
  const sort=$('sort').value;
  filtered.sort((a,b)=>{
    if(sort==='name')return a.name.localeCompare(b.name);
    const key=r=>sort==='support'?r.earliest_visible_support_note_date||'':sort==='recent'?changeDate(r):r.latest_inspected_version_date||'';
    return String(key(b)).localeCompare(String(key(a)))||a.name.localeCompare(b.name);
  });
  shown=30;
  render();
  const otherStatus=status==='documented'?'upcoming':'documented';
  const otherCount=terms.length?records.filter(r=>statusKey(r)===otherStatus&&matches(r,terms)).length:0;
  const otherPanel=$('otherStatusMatches');
  if(otherPanel){
    otherPanel.hidden=!otherCount;
    otherPanel.innerHTML=otherCount?'<button type="button" class="textbutton" data-other-status="'+otherStatus+'">'+otherCount+' '+(otherCount===1?'match':'matches')+' in '+(otherStatus==='upcoming'?'Upcoming':'Documented')+' →</button><span>Uses your current search and filters.</span>':'';
  }
  renderResearchMatches(terms);
  if(save)saveView();
}

function researchDetailNotice(r){
  return statusKey(r)==='research'?'<div class="research-notice"><strong>Research match — Duo support not established</strong><p>This entry is not counted as Documented or Upcoming. Missing qualifying support evidence does not mean the app fails or is incompatible.</p></div>':'';
}
function exactResearchMatch(r,query){
  const fullName=normalize(r.name).trim();
  const leadingName=normalize(r.name.split(/:|\s+[–—]\s+/)[0]).trim();
  return fullName===query||leadingName===query||r.app_id===query;
}
function renderResearchMatches(terms){
  const query=normalize($('search').value).trim();
  const hasPublicMatch=terms.length>0&&records.some(r=>matches(r,terms));
  const candidates=terms.length?researchRecords.filter(r=>{
    const exact=exactResearchMatch(r,query);
    const nameMatch=terms.every(term=>r.nameSearch.includes(term));
    return nameMatch&&(!hasPublicMatch||exact);
  }).sort((a,b)=>{
    const exact=r=>exactResearchMatch(r,query);
    return Number(exact(b))-Number(exact(a))||a.name.localeCompare(b.name);
  }).slice(0,5):[];
  const panel=$('researchMatches');
  if(!panel)return;
  panel.hidden=!candidates.length;
  panel.innerHTML=candidates.length?'<h3>Research match — Duo support not established</h3><p>These app-name matches are outside the Documented and Upcoming counts. Missing support evidence does not mean failure or incompatibility.</p>'+candidates.map(r=>'<article class="research-result"><div><h4><a href="'+esc(viewUrl(r.app_id))+'" data-detail="'+esc(r.app_id)+'">'+esc(r.name)+'</a></h4><p>'+esc(r.category)+'</p>'+pricingBadges(r)+'</div><div class="research-actions"><a href="'+esc(viewUrl(r.app_id))+'" data-detail="'+esc(r.app_id)+'">Details &amp; sources</a><button type="button" data-report-app="'+esc(r.app_id)+'">Report experience</button></div></article>').join('')+($('category').value||$('feature').value||$('detailed').checked?'<p class="research-filter-note">Category and capability filters do not apply to these app-name research matches.</p>':''):'';
  $('empty').hidden=filtered.length>0||candidates.length>0;
}

function activeFilterItems(){
  const items=[];
  for(const id of ['category','feature'])if($(id).value)items.push([id,$(id).value]);
  if($('detailed').checked)items.push(['detailed','Described Duo features']);
  if($('sort').value!=='name')items.push(['sort',$('sort').selectedOptions[0].textContent]);
  return items;
}
function renderControls(){
  const items=activeFilterItems();
  const activePanel=$('activeFilters'),count=$('filterCount');
  if(activePanel){
    activePanel.hidden=!items.length;
    activePanel.innerHTML=items.map(([key,label])=>'<button type="button" data-remove-filter="'+key+'" aria-label="Remove '+esc(label)+' filter">'+esc(label)+' <span aria-hidden="true">×</span></button>').join('');
  }
  if(count){count.hidden=!items.length;count.textContent=String(items.length)}
  $('filtersToggle')?.setAttribute('aria-label','Filters'+(items.length?', '+items.length+' active':''));
  document.querySelectorAll('[data-feature-shortcut]').forEach(button=>button.setAttribute('aria-pressed',String($('feature').value===button.dataset.featureShortcut)));
  $('describedShortcut')?.setAttribute('aria-pressed',String($('detailed').checked));
  $('recentShortcut')?.setAttribute('aria-pressed',String($('sort').value==='recent'));
  if($('recentNote'))$('recentNote').hidden=$('sort').value!=='recent';
}

function card(r){const support=r.earliest_visible_support_note_version;const version=support?'Support note v'+support:r.latest_inspected_version?'Inspected v'+r.latest_inspected_version:'Version unspecified';const when=support?r.earliest_visible_support_note_date:r.latest_inspected_version_date;return `<article class="app-row"><div class="row-app">${icon(r)}<div><h3><a href="${esc(viewUrl(r.app_id))}" data-detail="${esc(r.app_id)}">${esc(r.name)}</a></h3><p>${esc(r.category)}</p>${pricingBadges(r)}</div></div><div class="row-support">${statusKey(r)==='upcoming'?'<strong class="future-label">Announced / rollout unverified</strong>':''}<p>${esc(summary(r))}</p>${$("sort").value==="recent"?changeMarkup(r):""}</div><div class="row-evidence"><strong>${esc(evidenceLabel(r))}</strong><p>${esc(version)}${when?'<br>'+date(when):''}</p></div><div class="row-actions"><a class="evidence-link" href="${esc(viewUrl(r.app_id))}" data-detail="${esc(r.app_id)}" aria-label="Details and sources for ${esc(r.name)}">Details & sources</a><a class="store-link" href="${url(r.app_store_url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(r.name)} on the App Store">App Store ↗</a></div></article>`;}

function render(){
  const n=filtered.length;
  $('apps').innerHTML=filtered.slice(0,shown).map(card).join('');
  $('empty').hidden=n!==0;
  document.querySelector('.column-head').hidden=n===0;
  const hasSearch=Boolean($('search').value.trim()),hasFilters=activeFilterItems().length>0||status!=='documented';
  const recovery=hasSearch&&hasFilters?'Clear search & filters':hasSearch?'Clear search':hasFilters?'Clear filters':'Show documented apps';
  $('emptyReset').textContent=recovery;
  $('reset').textContent=recovery;
  $('reset').hidden=!hasSearch&&!hasFilters;
  $('loadMore').hidden=shown>=n;
  $('shownCount').textContent=n?'Showing '+Math.min(shown,n)+' of '+n+' apps':'';
  $('resultsCount').innerHTML='<strong>'+n+' '+(n===1?'app':'apps')+'</strong> '+(status==='upcoming'?'in the upcoming / rollout queue':'with documented support');
  document.querySelectorAll('[data-status]').forEach(button=>{
    const active=button.dataset.status===status;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
    button.tabIndex=active?0:-1;
  });
  renderControls();
}
function reset(){
  status='documented';
  $('search').value='';
  $('category').value='';
  $('feature').value='';
  $('detailed').checked=false;
  $('sort').value='name';
  applyFilters();
}

function renderDetail(id){const r=detailRecords.find(r=>r.app_id===id);if(!r)return;if(!$('detailDialog').open)returnFocus=document.activeElement;currentApp=id;const passages=r.sources.filter(s=>typeof s.excerpt==='string'&&s.excerpt.trim());const excerpt=passages.length?passages.map(s=>`<blockquote><p>“${esc(s.excerpt)}”</p><cite><a href="${url(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.excerpt_attribution||s.label)} · ${esc(s.label)} ↗</a><span>${s.excerpt_version?'v'+esc(s.excerpt_version):'Version not established'}${s.excerpt_date?' · '+date(s.excerpt_date):''} · Captured ${date(s.excerpt_checked)}</span></cite></blockquote>`).join(''):'<p class="excerpt-missing">Source passage not captured in this edition. Check the linked documentation for the original wording.</p>';$('detailContent').innerHTML=`<div class="dialog-head">${icon(r)}<div><h2 id="detailTitle">${esc(r.name)}</h2><p>${esc(r.category)}</p></div></div><div class="detail-body">${researchDetailNotice(r)}<h3>Support and capabilities</h3>${statusKey(r)==='upcoming'?'<p class="future-label">Announced / rollout unverified</p>':''}<p class="detail-notes">${esc(r.duo_notes)}</p>${pricingDetails(r)}${displayDetails(r)}<h3>Supporting documentation</h3>${excerpt}<div class="sources-list">${r.sources.map(s=>`<a class="source-link" href="${url(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} <span>↗</span></a>`).join('')}</div><h3>Version record</h3><dl class="version-record"><div><dt>Support note</dt><dd>${r.earliest_visible_support_note_version?'v'+esc(r.earliest_visible_support_note_version)+' · '+date(r.earliest_visible_support_note_date):'Not established'}</dd></div><div><dt>Latest inspected</dt><dd>${r.latest_inspected_version?'v'+esc(r.latest_inspected_version)+' · '+date(r.latest_inspected_version_date):'Not established'}</dd></div><div><dt>Documentation checked</dt><dd>${date(r.last_checked)}</dd></div></dl><div class="limit-box"><h3>Untested aspects and limitations</h3><p>${esc(r.known_limitations)}</p><p>The earliest visible support note may be later than the first supporting version. Features may have arrived in later updates.</p></div></div><div class="detail-footer"><a class="primary" href="${url(r.app_store_url)}" target="_blank" rel="noopener noreferrer">App Store ↗</a><button class="textbutton" data-copy-app="${esc(r.app_id)}">Copy app link</button><button class="textbutton" data-report-app="${esc(r.app_id)}">Report experience</button></div>`;document.title=r.name+' · Duo App Index';if(!$('detailDialog').open)$('detailDialog').showModal();}
function openDetail(id){
  if(!detailRecords.some(r=>r.app_id===id)||currentApp===id)return;
  history.pushState({duoDetail:true},'',viewUrl(id));
  renderDetail(id);
}
function closeRenderedDetail(){
  const previous=currentApp;
  currentApp=null;
  if($('detailDialog').open)$('detailDialog').close();
  document.title='Duo App Index';
  if(returnFocus?.isConnected&&!['BODY','HTML'].includes(returnFocus.tagName))returnFocus.focus();
  else if(previous)($('apps').querySelector('[data-detail="'+previous+'"]')||$('researchMatches')?.querySelector('[data-detail="'+previous+'"]')||$('search')).focus();
}
function requestCloseDetail(){
  if(!currentApp)return;
  if(history.state?.duoDetail&&new URLSearchParams(location.search).get('app')===currentApp)history.back();
  else{
    history.replaceState({duoDetail:false},'',viewUrl());
    closeRenderedDetail();
  }
}
function selectValue(id,value){
  $(id).value=value||'';
  if(id==='sort'&&!sortValues.includes($(id).value))$(id).value='name';
}
function readRoute(){
  const p=new URLSearchParams(location.search);
  status=publicStatuses.includes(p.get('status'))?p.get('status'):'documented';
  $('search').value=p.get('q')||'';
  for(const id of ['category','feature','sort'])selectValue(id,p.get(id));
  $('detailed').checked=p.get('detailed')==='1';
  applyFilters(false);
  const appId=p.get('app');
  if(appId&&detailRecords.some(r=>r.app_id===appId))renderDetail(appId);
  else{
    closeRenderedDetail();
    if(appId)history.replaceState({duoDetail:false},'',viewUrl());
  }
}
function showAbout(historyOnly=false){
  $('aboutDialog').showModal();
  if(historyOnly)setTimeout(()=>$('changeHeading').scrollIntoView({block:'start'}),0);
}
async function copy(text){
  try{await navigator.clipboard.writeText(text);toast('Link copied. Ready to share.')}
  catch{toast('Copy the address from your browser to share this view.')}
}
function updateReportFields(){
  const reporting=$('suggestType').value==='Hands-on test report';
  if($('reportFields'))$('reportFields').hidden=!reporting;
  for(const id of ['reportAppVersion','reportIosVersion','reportScreen']){
    if($(id)){$(id).required=reporting;$(id).disabled=!reporting}
  }
  if($('reportDate'))$('reportDate').disabled=!reporting;
  $('suggestNotes').maxLength=reporting?2500:3000;
  if($('suggestNotesLabel'))$('suggestNotesLabel').textContent=reporting?'What worked or failed?':'What should we know?';
  $('suggestNotes').placeholder=reporting?($('reportFields')?'Describe what you observed on that screen and position. Distinguish unused app canvas from bars inside a video.':'Include app and iOS versions, screen, orientation, folded position and what you observed. Leave out personal information.'):'Describe the Duo feature or correction.';
}
function openSuggestion(record=null){
  $('suggestResult').textContent='';
  if(record){
    if($('suggestName').value!==record.name){
      $('suggestNotes').value='';
      for(const id of ['reportAppVersion','reportIosVersion','reportScreen','reportDate'])if($(id))$(id).value='';
    }
    $('suggestType').value='Hands-on test report';
    $('suggestName').value=record.name;
    $('suggestUrl').value=record.app_store_url;
  }
  updateReportFields();
  $('suggestDialog').showModal();
}
function suggestionNotes(){
  const notes=$('suggestNotes').value.trim();
  if($('suggestType').value!=='Hands-on test report')return notes;
  const lines=[];
  for(const [id,label] of [['reportAppVersion','App version'],['reportIosVersion','iOS version'],['reportScreen','Screen / orientation / folded position']]){
    if($(id)?.value.trim())lines.push(label+': '+$(id).value.trim());
  }
  if($('reportDate')?.value)lines.push('Test date: '+$('reportDate').value);
  if(!lines.length)return notes;
  lines.push('Observed behavior:\n'+notes);
  return lines.join('\n');
}
async function init(){
  try{
    const response=await fetch('data.json?v=4264185a31d47a27');
    if(!response.ok)throw Error('Index unavailable');
    data=await response.json();
    detailRecords=data.records.map(r=>({...r,nameSearch:normalize([r.name,r.app_id].join(' ')),searchText:normalize([r.name,r.app_id,r.category,r.app_store_category,r.duo_notes,...r.documented_features].join(' '))}));
    records=detailRecords.filter(r=>publicStatuses.includes(statusKey(r)));
    researchRecords=detailRecords.filter(r=>statusKey(r)==='research');
    $('updated').textContent='Documentation checked '+date(data.checked);
    $('tabDoc').textContent=records.filter(r=>statusKey(r)==='documented').length;
    $('tabUpcoming').textContent=records.filter(r=>statusKey(r)==='upcoming').length;
    $('featureCount').textContent=records.filter(r=>r.documented_features.length).length;
    for(const c of [...new Set(records.map(r=>r.category))].sort())$('category').add(new Option(c,c));
    for(const f of [...new Set(records.flatMap(r=>r.documented_features))].sort())$('feature').add(new Option(f,f));
    for(const button of document.querySelectorAll('[data-feature-shortcut]'))button.hidden=!records.some(r=>r.documented_features.includes(button.dataset.featureShortcut));
    $('methodList').innerHTML=data.methodology.map(t=>'<li>'+esc(t)+'</li>').join('');
    $('changeList').innerHTML=data.changelog.map(c=>'<li><strong>'+esc(date(c.date))+' · Edition '+esc(c.version)+'</strong><br>'+esc(c.change)+'</li>').reverse().join('');
    updateReportFields();
    readRoute();
  }catch(error){
    $('resultsCount').textContent='The index couldn’t load. Please refresh to try again.';
    $('apps').innerHTML='<div class="empty"><h3>The index is temporarily unavailable.</h3><p>Please refresh this page in a moment.</p></div>';
    console.error(error);
  }
}
$('search').addEventListener('input',()=>applyFilters());
for(const id of ['category','feature','sort','detailed'])$(id).addEventListener('change',()=>applyFilters());
document.querySelectorAll('[data-status]').forEach(button=>button.addEventListener('click',()=>{
  status=button.dataset.status;
  applyFilters();
}));
$('filtersToggle')?.addEventListener('click',()=>{
  const open=$('filtersToggle').getAttribute('aria-expanded')!=='true';
  $('filtersToggle').setAttribute('aria-expanded',String(open));
  $('filterPanel')?.classList.toggle('filters-open',open);
});
$('describedShortcut')?.addEventListener('click',()=>{
  status='documented';
  $('detailed').checked=!$('detailed').checked;
  applyFilters();
});
$('recentShortcut')?.addEventListener('click',()=>{
  $('sort').value=$('sort').value==='recent'?'name':'recent';
  applyFilters();
});
$('reset').onclick=reset;
$('emptyReset').onclick=reset;
$('loadMore').onclick=()=>{
  const firstNew=shown;
  shown+=30;
  render();
  $('apps').children[firstNew]?.querySelector('[data-detail]')?.focus();
};
document.addEventListener('click',event=>{
  const link=event.target.closest('[data-detail]');
  if(link){
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button>0)return;
    event.preventDefault();
    openDetail(link.dataset.detail);
  }
  const copyButton=event.target.closest('[data-copy-app]');
  if(copyButton)copy(new URL(viewUrl(copyButton.dataset.copyApp),location.origin).href);
  const report=event.target.closest('[data-report-app]');
  if(report)openSuggestion(detailRecords.find(r=>r.app_id===report.dataset.reportApp));
  const other=event.target.closest('[data-other-status]');
  if(other&&publicStatuses.includes(other.dataset.otherStatus)){
    status=other.dataset.otherStatus;
    applyFilters();
  }
  const shortcut=event.target.closest('[data-feature-shortcut]');
  if(shortcut){
    status='documented';
    $('feature').value=$('feature').value===shortcut.dataset.featureShortcut?'':shortcut.dataset.featureShortcut;
    applyFilters();
  }
  const remove=event.target.closest('[data-remove-filter]');
  if(remove){
    const id=remove.dataset.removeFilter;
    if(id==='detailed')$('detailed').checked=false;
    else if(['category','feature','sort'].includes(id))$(id).value=id==='sort'?'name':'';
    applyFilters();
    const next=$('activeFilters')?.querySelector('button');
    (next||$('search')).focus();
  }
});
$('shareBtn').onclick=()=>{saveView();copy(location.href)};
for(const id of ['aboutBtn','standardsBtn'])$(id).onclick=()=>showAbout();
$('changelogBtn').onclick=()=>showAbout(true);
$('closeDetail').onclick=requestCloseDetail;
$('detailDialog').addEventListener('cancel',event=>{event.preventDefault();requestCloseDetail()});
$('detailDialog').addEventListener('close',()=>{
  // Handles a native close as well as explicit buttons without adding history.
  if(currentApp)requestCloseDetail();
});
$('closeAbout').onclick=()=>$('aboutDialog').close();
for(const id of ['detailDialog','aboutDialog'])$(id).addEventListener('click',event=>{
  if(event.target!==$(id))return;
  const bounds=$(id).getBoundingClientRect();
  if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom){
    if(id==='detailDialog')requestCloseDetail();
    else $(id).close();
  }
});
document.addEventListener('keydown',event=>{
  if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('detailDialog').open&&!$('aboutDialog').open&&!$('suggestDialog').open){
    event.preventDefault();
    $('search').focus();
  }
});
$('suggestBtn').onclick=()=>openSuggestion();
$('closeSuggest').onclick=()=>$('suggestDialog').close();
$('suggestType').addEventListener('change',updateReportFields);
$('suggestForm').onsubmit=async event=>{
  event.preventDefault();
  const button=$('sendSuggestion');
  button.disabled=true;
  $('suggestResult').textContent='Submitting…';
  try{
    const notes=suggestionNotes();
    if(notes.length>3000)throw Error('Please shorten your report to 3,000 characters.');
    const response=await fetch('https://duo-app-index-tk.thomaskrohn13.chatgpt.site/api/suggestions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:$('suggestType').value,name:$('suggestName').value,url:$('suggestUrl').value,notes,website:$('suggestWebsite').value})});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Could not save. Please try again.');
    $('suggestResult').textContent='Saved for review. Reference: '+result.id;
    $('suggestForm').reset();
    updateReportFields();
  }catch(error){$('suggestResult').textContent=error.message}
  finally{button.disabled=false}
};
document.querySelector('[role="tablist"]').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...document.querySelectorAll('[role="tab"]')];
  let index=tabs.indexOf(document.activeElement);
  if(index<0)return;
  event.preventDefault();
  index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[index].click();
  tabs[index].focus();
});
window.addEventListener('popstate',readRoute);
init();
