import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as react from "react";
import { createContact, emptyContact } from "../app/lib/contacts.ts";
const require = createRequire(import.meta.url);
function searchHarness(fetch) {
  const slots=[], cleanups=[];let cursor=0,selected=[];
  const hooks={...react,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return [slots[i],v=>{slots[i]=typeof v==="function"?v(slots[i]):v;}];},useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect(fn){const i=cursor++;if(!(i in slots)){slots[i]=true;cleanups.push(fn());}}};
  const mod={exports:{}};
  const source=readFileSync(new URL('../app/components/kvk-contact-search.tsx',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require:name=>name==='react'?hooks:require(name),fetch,AbortController,setTimeout,clearTimeout});
  const render=()=>{cursor=0;return mod.exports.KvkContactSearch({initialQuery:'Getypte naam',onSelect:r=>selected.push(r)});};
  function elements(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(elements);return [node,...elements(node.props?.children)];}
  const all=()=>elements(render());
  return {render,selected,all,query:value=>all().find(n=>n.type==='input').props.onChange({target:{value}}),search:()=>all().find(n=>n.type==='button'&&n.props.children==='Zoek bij KvK').props.onClick(),unmount:()=>cleanups.forEach(fn=>fn?.())};
}
const response=results=>({ok:true,json:async()=>({results})});
test('search preserves the draft until the user chooses a result and never submits the enclosing form',async()=>{
  const calls=[],result={name:'Voorbeeld Bouw B.V.',kvk:'12345678',address:'Teststraat 10, Teststad'};
  const h=searchHarness(async(url,options)=>{calls.push({url,options});return response([result]);});
  h.query('Voorbeeld & Bouw');await h.search();
  assert.match(calls[0].url,/q=Voorbeeld%20%26%20Bouw/);assert.equal(h.selected.length,0);
  assert.ok(h.all().filter(n=>n.type==='button').every(b=>b.props.type==='button'));
  const resultButton=h.all().find(n=>n.type==='button'&&n.props.children?.type==='span');resultButton.props.onClick();
  assert.deepEqual(h.selected,[result]);assert.equal(h.all().some(n=>n.type==='ul'),false);
});
test('failed and empty lookups leave manual entry available; short queries make no API call',async()=>{
  let calls=0;const h=searchHarness(async()=>{calls++;return {ok:false,json:async()=>({error:'KvK-sleutel ontbreekt'})};});
  h.query('a');await h.search();assert.equal(calls,0);
  h.query('Test');await h.search();assert.equal(calls,1);assert.equal(h.selected.length,0);assert.ok(h.all().some(n=>n.props?.role==='status'&&n.props.children==='KvK-sleutel ontbreekt'));
  const empty=searchHarness(async()=>response([]));await empty.search();assert.ok(empty.all().some(n=>typeof n.props?.children==='string'&&n.props.children.startsWith('Geen onderneming')));
});
test('changing the query aborts an old lookup and ignores its late response',async()=>{
  let resolve,signal;const h=searchHarness((url,options)=>{signal=options.signal;return new Promise(r=>resolve=r);});
  const pending=h.search();h.query('Nieuwe zoekopdracht');assert.equal(signal.aborted,true);
  resolve(response([{name:'Verouderd resultaat',kvk:'12345678',address:'Oud adres'}]));await pending;
  assert.equal(h.selected.length,0);assert.equal(h.all().some(n=>n.type==='ul'),false);
  h.unmount();
});

test('selecting KvK details in the actual quick dialog retains debtor/creditor role and email; private contacts stay untouched',()=>{
  const source=ts.createSourceFile('quick-contact-dialog.tsx',readFileSync(new URL('../app/components/quick-contact-dialog.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let handler;function visit(node){if(ts.isJsxAttribute(node)&&node.name.getText(source)==='onSelect'&&node.initializer&&ts.isJsxExpression(node.initializer))handler=node.initializer.expression.getText(source);ts.forEachChild(node,visit);}visit(source);
  assert.ok(handler);
  for(const type of ['customer','supplier']){
    let draft={...emptyContact,name:'Getypte naam',type,email:'contact@example.invalid',address:'Handmatig adres'},error='vorige melding';
    const context={setForm:fn=>{draft=fn(draft);},setError:value=>{error=value;}};
    const code=ts.transpileModule(`globalThis.selectResult = ${handler};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,context);
    context.selectResult({name:'Voorbeeld B.V.',kvk:'12345678',address:''});
    assert.equal(draft.type,type);assert.equal(draft.email,'contact@example.invalid');assert.equal(draft.address,'Handmatig adres');assert.equal(error,'');
    assert.equal(createContact(draft,'contact').kvk,'12345678');
    draft={...draft,kind:'private'};const previous=draft;context.selectResult({name:'Laat resultaat',kvk:'87654321',address:'Ander adres'});assert.equal(draft,previous);
  }
});
