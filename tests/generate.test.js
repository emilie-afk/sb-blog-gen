// generate function suite with a stubbed Anthropic SDK. Run: node tests/generate.test.js
const path = require('path').join(__dirname, '..');
const Module=require('module');
// Stub the Anthropic SDK before generate.js loads it
const sdkPath=require.resolve('@anthropic-ai/sdk',{paths:[path]});
let mode='ok';
class FakeAnthropic {
  constructor(){ this.messages={ create: async (opts)=>{
    // Article 3500 vs metadata 600: anything above 1000 is the article call.
    const isArticle = opts.max_tokens>1000;
    if(mode==='articlefail' && isArticle) { const e=new Error('overloaded'); e.status=529; throw e; }
    if(mode==='metafail' && !isArticle) throw new Error('rate limited');
    if(mode==='metajunk' && !isArticle) return {content:[{text:'sorry, I cannot do that'}]};
    if(isArticle) return {content:[{text:'```html\n<p>Updated September 2026</p><h2 style="color:#34bfa2" id="x">Care — really</h2>'+'<p>Water every 10–14 days. Nice.</p>'.repeat(10)+'\n```'}]};
    return {content:[{text:'{"title":"Plant Gifts for Coworkers 2026","alternative_titles":["Desk Plants Worth Giving","Low Light Plant Gifts for the Office"],"excerpt":"A — test excerpt.","meta_description":"Meta desc","products":[{"t":"Succulent Potting Soil","h":"succulent-potting-soil"},{"t":"NOT REAL","h":"fake-handle"}],"articles":[{"t":"Watering Tips","u":"https://succulentsbox.com/blogs/blog/watering-tips"},{"t":"Made Up","u":"https://evil.example.com/x"}]}'}]};
  } }; }
}
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: FakeAnthropic };
process.env.SITE_PASSWORD='pw'; process.env.ANTHROPIC_API_KEY='k';
const { handler } = require(path+'/netlify/functions/generate.js');

const prods=[1,2].map(i=>({title:'Gift Box '+i,url:'https://succulentsbox.com/products/g'+i,price:'$4'+i+'.00',source:'manual'}));
const call=(body)=>handler({httpMethod:'POST',body:JSON.stringify(body)});

(async()=>{
  let r=await call({token:'wrong',articleType:'care_guide',fields:{plantName:'Haworthia'}});
  console.log('auth →',r.statusCode,JSON.parse(r.body).code);

  r=await call({token:'pw',articleType:'care_guide',fields:{}});
  console.log('validation →',r.statusCode,JSON.parse(r.body).code);

  r=await call({token:'pw',articleType:'care_guide',fields:{plantName:'Haworthia'}});
  let d=JSON.parse(r.body);
  console.log('care →',r.statusCode,'| title:',d.title);
  console.log('  em/en dashes in html:', /[—–]/.test(d.html), '| in excerpt:', /[—–]/.test(d.excerpt), '| excerpt:', d.excerpt);
  console.log('  fake product dropped:', d.products.length===1, JSON.stringify(d.products[0]));
  console.log('  fake article dropped:', d.related_articles.length===1, JSON.stringify(d.related_articles));
  console.log('  fences stripped:', !d.html.includes('```'), '| keys:', Object.keys(d).join(','));

  r=await call({token:'pw',articleType:'general_gift_guide',fields:{numberOfRecommendations:2,selectedProducts:prods}});
  d=JSON.parse(r.body);
  console.log('general →',r.statusCode,'| products are confirmed ones:', d.products.length===2 && d.products[0].title==='Gift Box 1');
  console.log('  title from metadata:', d.title, '| year stripped:', !/2026/.test(d.title));
  console.log('  alternatives:', JSON.stringify(d.alternative_titles));
  console.log('  table warnings present:', d.warnings.length>0, '|', (d.warnings[0]||'').slice(0,60));

  r=await call({token:'pw',articleType:'general_gift_guide',fields:{numberOfRecommendations:9,selectedProducts:prods}});
  console.log('9 recommendations →', r.statusCode, JSON.parse(r.body).error.slice(0,60));

  mode='metafail';
  r=await call({token:'pw',articleType:'care_guide',fields:{plantName:'Haworthia'}});
  d=JSON.parse(r.body);
  console.log('metadata failure → status',r.statusCode,'| html present:',!!d.html,'| warnings:',d.warnings);

  mode='metajunk';
  r=await call({token:'pw',articleType:'care_guide',fields:{plantName:'Haworthia'}});
  d=JSON.parse(r.body);
  console.log('metadata junk → status',r.statusCode,'| html present:',!!d.html,'| warnings:',d.warnings.length);

  mode='articlefail';
  r=await call({token:'pw',articleType:'care_guide',fields:{plantName:'Haworthia'}});
  console.log('article failure →',r.statusCode,JSON.parse(r.body).code);
})();
