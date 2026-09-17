// Correction pass: titles, tone removal, caps, evidence rules, output checks.
// Run: node tests/corrections.test.js
const R = require('path').join(__dirname, '..');
const { validateRequest } = require(R+'/netlify/functions/lib/validate');
const { resolveTitles, buildFallbackTitle } = require(R+'/netlify/functions/lib/title');
const { validateArticleOutput } = require(R+'/netlify/functions/lib/validate-output');
const { buildOccasionGiftGuidePrompt } = require(R+'/netlify/functions/lib/prompt-occasion-gift-guide');
const { buildGeneralGiftGuidePrompt } = require(R+'/netlify/functions/lib/prompt-general-gift-guide');
const { buildMetadataAndRelatedPrompt } = require(R+'/netlify/functions/lib/prompt-metadata-related');
const out=[]; const ok=(n,c,x)=>out.push((c?'PASS ':'FAIL ')+n+(x!==undefined?' :: '+x:''));
const fail=(n,code,fn)=>{try{fn();out.push('FAIL '+n+' :: expected error')}catch(e){out.push((e.code===code?'PASS ':'FAIL ')+n+' :: '+e.code+' '+e.message)}};

const prods=n=>Array.from({length:n},(_,i)=>({title:'Gift Box '+(i+1),url:'https://succulentsbox.com/products/g'+(i+1),price:'$4'+(i+1)+'.00',source:'live-gift-catalog',handle:'g'+(i+1)}));

// ── tone removed, title no longer required
const og=validateRequest('occasion_gift_guide',{occasion:'Christmas',numberOfRecommendations:2,selectedProducts:prods(2),recipient:'Coworkers',includeYearInTitle:false,occasionYear:'2026'});
ok('occasion valid without title or tone', !!og.fields.occasion && !('tone' in og.fields) && !('title' in og.fields));
ok('tone silently ignored if sent', !('tone' in validateRequest('occasion_gift_guide',{occasion:'X',tone:'Romantic',numberOfRecommendations:1,selectedProducts:prods(1)}).fields));
ok('general valid without title', !!validateRequest('general_gift_guide',{numberOfRecommendations:1,selectedProducts:prods(1)}).fields.selectedProducts);
ok('single-plant valid without title', validateRequest('single_plant_gift',{plantName:'Snake Plant',giftAngle:'Low maintenance'}).fields.plantName==='Snake Plant');
ok('titleDirection accepted', validateRequest('general_gift_guide',{numberOfRecommendations:1,selectedProducts:prods(1),titleDirection:'Focus on affordable gifts'}).fields.titleDirection==='Focus on affordable gifts');
ok('includeYearInTitle defaults false', validateRequest('occasion_gift_guide',{occasion:'X',numberOfRecommendations:1,selectedProducts:prods(1)}).fields.includeYearInTitle===false);

// ── 8 cap
ok('8 recommendations allowed', validateRequest('general_gift_guide',{numberOfRecommendations:8,selectedProducts:prods(8)}).fields.numberOfRecommendations===8);
fail('9 recommendations rejected','invalid_input',()=>validateRequest('general_gift_guide',{numberOfRecommendations:9,selectedProducts:prods(9)}));
ok('cap message mentions 8', (()=>{try{validateRequest('general_gift_guide',{numberOfRecommendations:15,selectedProducts:prods(15)})}catch(e){return /between 1 and 8/.test(e.message)}})());

// ── prompts
const ogp=buildOccasionGiftGuidePrompt(og.fields);
ok('no tone in occasion prompt', !/Tone:/.test(ogp));
ok('voice rules present', /VOICE AND STYLE/.test(ogp) && /gift that keeps on giving/.test(ogp) && /first person as the brand/.test(ogp));
ok('evidence rules present', /EVIDENCE RULES/.test(ogp) && /thrives on neglect/.test(ogp));
ok('table skeleton has separate th', (ogp.match(/<th /g)||[]).length>=4);
// The standalone "Ordering and timing" section is gone; the ban now lives in the
// evidence rules, which cover the same ground more broadly.
ok('no ordering window promises',
  /Never write shipping advice, an ordering window, a lead time, a cutoff, a delivery date/i.test(ogp)
  && /Ordering and timing, shipping advice, or delivery deadlines/.test(ogp));
const gg=validateRequest('general_gift_guide',{numberOfRecommendations:2,selectedProducts:prods(2),recipient:'Coworkers'});
const ggp=buildGeneralGiftGuidePrompt(gg.fields);
ok('general prompt has no-notes warning', /No factual notes supplied/.test(ggp));
ok('register line uses recipient', /Coworkers/.test(ggp));

// ── metadata prompt titles
const mp=buildMetadataAndRelatedPrompt('occasion_gift_guide', og.fields);
ok('metadata asks for title + alternatives', /"title"/.test(mp) && /alternative_titles/.test(mp));
ok('year suppressed when flag false', /Do not put any year in the title/.test(mp));
const ogYear=validateRequest('occasion_gift_guide',{occasion:'Christmas',occasionYear:'2026',includeYearInTitle:true,numberOfRecommendations:2,selectedProducts:prods(2)});
ok('year allowed when flag true', /Include the year 2026/.test(buildMetadataAndRelatedPrompt('occasion_gift_guide', ogYear.fields)));
ok('count rule in title rules', /must be exactly 2/.test(mp));
ok('title direction passed', /Focus on affordable/.test(buildMetadataAndRelatedPrompt('general_gift_guide', validateRequest('general_gift_guide',{numberOfRecommendations:1,selectedProducts:prods(1),titleDirection:'Focus on affordable gifts'}).fields)));

// ── title resolution
let t=resolveTitles('occasion_gift_guide', og.fields, {title:'Plant Gifts for Christmas 2026', alternative_titles:['Christmas Plant Gifts for the Office','Desk Plants to Give at Christmas']});
ok('year stripped from AI title', t.title==='Plant Gifts for Christmas', t.title);
ok('two alternatives returned', t.alternatives.length===2);
t=resolveTitles('occasion_gift_guide', ogYear.fields, {title:'Plant Gifts for Christmas 2026'});
ok('year kept when requested', /2026/.test(t.title), t.title);
t=resolveTitles('occasion_gift_guide', og.fields, null);
ok('fallback title, no Untitled', t.usedFallback && t.title==='2 Plant Gifts for Coworkers for Christmas', t.title);
ok('fallback general', buildFallbackTitle('general_gift_guide',{numberOfRecommendations:4,recipient:'Coworkers'})==='4 Plant Gift Ideas for Coworkers');
ok('fallback single plant', buildFallbackTitle('single_plant_gift',{plantName:'Snake Plant',occasion:'Housewarming'})==='Snake Plant as a Housewarming Gift');
ok('care guide keeps its pattern', resolveTitles('care_guide',{plantName:'Haworthia'},{title:'Haworthia Care Made Simple'}).title==='How to grow and care for Haworthia');
ok('care guide AI title becomes alternative', resolveTitles('care_guide',{plantName:'Haworthia'},{title:'Haworthia Care Made Simple'}).alternatives[0]==='Haworthia Care Made Simple');
const dashTitle = resolveTitles('general_gift_guide',{numberOfRecommendations:2},{title:'Gifts \u2014 for coworkers'}).title;
ok('em dash stripped from title', !/[\u2014\u2013]/.test(dashTitle), dashTitle);

// ── output validation
const f2=validateRequest('general_gift_guide',{numberOfRecommendations:2,selectedProducts:prods(2)}).fields;
const goodTable=`<table><thead><tr><th>Gift</th><th>Best for</th><th>Light</th><th>Care level</th></tr></thead><tbody><tr><td>Gift Box 1</td><td>a</td><td>b</td><td>c</td></tr><tr><td>Gift Box 2</td><td>a</td><td>b</td><td>c</td></tr></tbody></table>`;
const links=`<a href="https://succulentsbox.com/products/g1">Gift Box 1</a><a href="https://succulentsbox.com/products/g2">Gift Box 2</a>`;
ok('clean output has no warnings', validateArticleOutput('general_gift_guide',f2,goodTable+links).length===0, JSON.stringify(validateArticleOutput('general_gift_guide',f2,goodTable+links)));
const merged=`<table><tr><th>GiftBest forLightCare levelPrice</th></tr><tr><td>x</td></tr></table>`;
ok('merged header flagged', validateArticleOutput('general_gift_guide',f2,merged+links).some(w=>/merged/.test(w)));
ok('missing table flagged', validateArticleOutput('general_gift_guide',f2,links).some(w=>/comparison table is missing/.test(w)));
const oneRow=goodTable.replace(/<tr><td>Gift Box 2[\s\S]*?<\/tr>/,'');
ok('row count mismatch flagged', validateArticleOutput('general_gift_guide',f2,oneRow+links).some(w=>/product row/.test(w)));
ok('missing product url flagged', validateArticleOutput('general_gift_guide',f2,goodTable).some(w=>/product link is missing/.test(w)));
ok('unconfirmed product url flagged', validateArticleOutput('general_gift_guide',f2,goodTable+links+'<a href="https://succulentsbox.com/products/mystery-plant">x</a>').some(w=>/not confirmed/.test(w)));
ok('care guide skips table checks', validateArticleOutput('care_guide',{},'<p>no table</p>').length===0);

console.log(out.join('\n'));
const failureCount = out.filter(r=>r.startsWith('FAIL')).length;
console.log('\n'+failureCount+' failures of '+out.length);
process.exitCode = failureCount ? 1 : 0;
