import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BookOpen, Calculator, Check, ChevronRight, CircleHelp, Dices, Lightbulb, Moon, Play, RotateCcw, Sparkles, Sun } from 'lucide-react';
import './style.css';

// Text inside braces becomes a JavaScript Set. Numbers stay numeric; other values stay text.
function readSet(text) {
  let source = text.trim();
  if (source.startsWith('{') !== source.endsWith('}')) throw new Error('Use matching braces, for example {1, 2, 3}.');
  if (source.startsWith('{') && source.endsWith('}')) source = source.slice(1, -1);
  if (!source.trim()) return new Set();
  const values = source.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,]+/g);
  if (!values) throw new Error('Separate elements with commas.');
  return new Set(values.map(item => {
    let value = item.trim();
    if (!value) throw new Error('There is an empty element. Check the commas.');
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
    return value;
  }));
}
const showSet = set => `{${[...set].map(x => typeof x === 'string' ? x : String(x)).join(', ')}}`;
const union = (a,b) => new Set([...a,...b]);
const intersect = (a,b) => new Set([...a].filter(x => b.has(x)));
const diff = (a,b) => new Set([...a].filter(x => !b.has(x)));
const same = (a,b) => a.size === b.size && [...a].every(x => b.has(x));

// A small expression parser supports parentheses, complement, intersection, difference and union.
function calculate(expression, sets, universe, work = []) {
  let source = expression.replaceAll('∪','+').replaceAll('∩','&').replaceAll('Δ','%').replaceAll('−','-').replaceAll('ᶜ',"'").replace(/\^c/gi,"'").replace(/\s+/g,'');
  // Also accept common typed shorthand: U for union and N for intersection.
  source = source.replace(/([ABC)'!~)])U(?=[ABC(])/gi,'$1+').replace(/N/gi,'&');
  const tokens = source.match(/[ABCU]|[()+&%\-'!~]/gi);
  if (!tokens || tokens.join('') !== source) throw new Error('Use A, B, C, parentheses, ∪, ∩, −, Δ and complement (A′).');
  let position = 0;
  function primary() {
    let token = tokens[position++];
    if (!token) throw new Error('The expression is incomplete.');
    let result;
    if (token === '(') { result = unionExpr(); if (tokens[position++] !== ')') throw new Error('Add a closing parenthesis.'); }
    else if (/[ABCU]/i.test(token)) {
      const key = token.toUpperCase();
      result = key === 'U' ? universe : sets[key];
      if (!result) throw new Error(`Set ${key} is not available. Turn on three-set mode for C.`);
    } else throw new Error(`Unexpected symbol “${token}”.`);
    while (tokens[position] === "'" || tokens[position] === '!' || tokens[position] === '~') { position++; const old = result; result = diff(universe, result); work.push(`U − ${showSet(old)} = ${showSet(result)}`); }
    return result;
  }
  function andExpr() {
    let left = primary();
    while (tokens[position] === '&' || tokens[position] === '-') {
      const op = tokens[position++], right = primary();
      const old = left; left = op === '&' ? intersect(left,right) : diff(left,right);
      work.push(`${showSet(old)} ${op === '&' ? '∩' : '−'} ${showSet(right)} = ${showSet(left)}`);
    }
    return left;
  }
  function unionExpr() {
    let left = andExpr();
    while (tokens[position] === '+' || tokens[position] === '%') {
      const op = tokens[position++], right = andExpr();
      const old = left; left = op === '+' ? union(left,right) : union(diff(left,right),diff(right,left));
      work.push(`${showSet(old)} ${op === '+' ? '∪' : 'Δ'} ${showSet(right)} = ${showSet(left)}`);
    }
    return left;
  }
  const answer = unionExpr();
  if (position < tokens.length) throw new Error(`Unexpected symbol “${tokens[position]}”.`);
  return answer;
}

const ops2 = [
  ['A ∪ B','Union','Elements in A or B.'], ['A ∩ B','Intersection','Elements common to A and B.'], ['A − B','A minus B','Elements in A but not in B.'], ['B − A','B minus A','Elements in B but not in A.'],
  ["A′",'Complement of A','Elements in the universal set U that are not in A.'], ['A Δ B','Symmetric difference','Elements that belong to exactly one of A and B.']
];
const ops3 = ['A ∪ B ∪ C','A ∩ B ∩ C','(A ∪ B) ∩ C','A ∩ (B ∪ C)','(A − B) ∪ C','A − (B ∪ C)','(A ∩ B) − C'];
const details = {
  'A ∪ B':'Elements in A or B (or both).', 'A ∩ B':'Elements common to A and B.', 'A − B':'Elements in A but not in B.', 'B − A':'Elements in B but not in A.', "A′":'Elements in U that are not in A.', 'A Δ B':'Elements belonging to exactly one of A and B.',
  'A ∪ B ∪ C':'Elements in at least one of the three sets.', 'A ∩ B ∩ C':'Elements common to A, B and C.', '(A ∪ B) ∩ C':'Elements in C and also in A or B.', 'A ∩ (B ∪ C)':'Elements in A and also in B or C.', '(A − B) ∪ C':'Elements in C or in A but not B.', 'A − (B ∪ C)':'Elements in A but neither B nor C.', '(A ∩ B) − C':'Elements in both A and B, but not C.'
};

function App() {
  const [uText,setU] = useState('1, 2, 3, 4, 5, 6, 7, 8, 9, 10');
  const [aText,setA] = useState('1, 2, 3, 4, 5');
  const [bText,setB] = useState('4, 5, 6, 7');
  const [cText,setC] = useState('5, 6, 7, 8');
  const [three,setThree] = useState(false);
  const [mode,setMode] = useState('operations');
  const [selected,setSelected] = useState('A ∩ B');
  const [expression,setExpression] = useState('(A ∪ B) − C');
  const expressionInput = useRef(null);
  const [custom,setCustom] = useState(false);
  const [dark,setDark] = useState(false);
  const [error,setError] = useState('');
  const [practice,setPractice] = useState(null);
  const [practiceChoice,setPracticeChoice] = useState(null);
  const [practiceChecked,setPracticeChecked] = useState(false);
  const [level,setLevel] = useState('Easy');

  const calcUText=useDeferredValue(uText), calcAText=useDeferredValue(aText), calcBText=useDeferredValue(bText), calcCText=useDeferredValue(cText);
  const calcThree=useDeferredValue(three), calcExpression=useDeferredValue(expression);

  const data = useMemo(() => {
    try { return { U:readSet(calcUText), A:readSet(calcAText), B:readSet(calcBText), C:calcThree ? readSet(calcCText) : null }; }
    catch(e) { return { error:e.message }; }
  },[calcUText,calcAText,calcBText,calcCText,calcThree]);
  const sets = useMemo(()=>data.error ? {} : {A:data.A,B:data.B,...(calcThree?{C:data.C}:{})},[data,calcThree]);
  const activeExpression = custom ? calcExpression : selected;
  const inputError = data.error || (!data.error&&data.C===null&&/C/i.test(activeExpression)?'Set C is not enabled. Turn on three-set mode or choose a two-set operation.':'');
  const calculation = useMemo(()=>{
    const work=[];
    if(inputError)return {result:new Set(),work,error:inputError};
    try{return {result:calculate(activeExpression,sets,data.U,work),work,error:''};}
    catch(e){return {result:new Set(),work,error:e.message};}
  },[activeExpression,sets,data,inputError]);
  const calcError=calculation.error;
  const result=calculation.result, calculationWork=calculation.work;
  const toggle = () => setThree(!three);
  const loadExample = () => {setU('1, 2, 3, 4, 5, 6, 7, 8, 9, 10');setA('1, 2, 3, 4, 5');setB('4, 5, 6, 7');setC('5, 6, 7, 8');setError('');};
  const clearAll = () => {setU('');setA('');setB('');setC('');setError('');setExpression('');setSelected('A ∩ B');setCustom(false);};
  const randomExample = () => { const n=9, values=Array.from({length:n},(_,i)=>i+1); const picks=()=>values.filter(()=>Math.random()>.5); setU(values.join(', '));setA(picks().join(', '));setB(picks().join(', '));setC(picks().join(', '));setError('');};
  const choose = op => {setSelected(op);setCustom(false);};
  const doCalculate = () => {if(/C/i.test(expression))setThree(true);setCustom(true);setError('');};
  const addKey = key => {
    const input=expressionInput.current;
    const start=input?.selectionStart ?? expression.length;
    const end=input?.selectionEnd ?? expression.length;
    const from=key==='Backspace'&&start===end?Math.max(0,start-1):start;
    const insert=key==='Backspace'?'':key;
    const next=expression.slice(0,from)+insert+expression.slice(end);
    setExpression(next);
    if (/C/i.test(next)) setThree(true);
    requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(from+insert.length,from+insert.length);});
  };
  const openCustom = () => { if(/C/i.test(expression))setThree(true);setCustom(true); };
  const makePractice = () => {
    const size=level==='Expert'?10:level==='Hard'?9:8, values=Array.from({length:size},(_,i)=>i+1);
    const pick=()=>values.filter(()=>Math.random()>.5);
    let U=new Set(values), A=new Set(pick()), B=new Set(pick()), C=new Set(pick());
    const pool=level==='Easy'?['A ∪ B','A ∩ B']:level==='Medium'?['A − B','A′','A Δ B']:['(A ∪ B) − C','A ∩ (B ∪ C)',"(A ∪ B)′"];
    const ex=pool[Math.floor(Math.random()*pool.length)], work=[], answer=calculate(ex,{A,B,C},U,work);
    const options=[answer], keys=new Set([showSet(answer)]);
    for(let tries=0;options.length<4&&tries<100;tries++){
      const candidate=new Set(values.filter(()=>Math.random()>.5)), key=showSet(candidate);
      if(!keys.has(key)){keys.add(key);options.push(candidate);}
    }
    options.sort(()=>Math.random()-.5);
    setPractice({U,A,B,C,ex,answer,work,options,difficulty:level});setPracticeChoice(null);setPracticeChecked(false);
  };
  const clickNav = key => {setMode(key);document.getElementById(key)?.scrollIntoView({behavior:'smooth',block:'start'});};

  let steps=[];
  if (!calcError && !custom) {
    steps=[{title:'Start with the given sets',text:`A = ${showSet(data.A)}${data.B?` · B = ${showSet(data.B)}`:''}${three&&data.C?` · C = ${showSet(data.C)}`:''}`},
      {title:'Apply the operation',text:`${activeExpression} — ${details[activeExpression] || 'Evaluate the sets in parentheses first, then apply the remaining operation.'}`},
      {title:'Select the matching elements',text:`${showSet(result)}${activeExpression.includes('∩')?' are present in every required set.':activeExpression.includes('−')?' remain after removing the elements in the second set.':' satisfy the expression.'}`}];
  } else if (!calcError) {
    steps=[{title:'Read the expression',text:activeExpression}, ...calculationWork.map((text,index)=>({title:`Calculation ${index+1}`,text})), {title:'Final answer',text:showSet(result)}];
  }

  const onDiagram = (a,b,c) => { try { return result.has(elForMembership(a,b,c)); } catch { return false; } };
  // The diagram uses region labels as well as element membership to show selected areas.
  const allElements=useMemo(()=>data.error?[]:[...new Set([...data.U,...data.A,...data.B,...(calcThree?data.C:[])])],[data,calcThree]);
  const inRegion = (region) => {
    const known = allElements.find(x => regionOf(x)==region);
    if (known !== undefined) return diagramResult.has(known);
    const masks = { 'A only':[true,false,false],'B only':[false,true,false],'C only':[false,false,true],'A ∩ B':[true,true,false],'A ∩ C':[true,false,true],'B ∩ C':[false,true,true],'A ∩ B ∩ C':[true,true,true],'Outside':[false,false,false] };
    const [a,b,c]=masks[region]||[false,false,false];
    const sentinel=elForMembership(a,b,c); return diagramResult.has(sentinel);
  };
  function elForMembership(a,b,c) { return `__region_${+a}${+b}${+c}__`; }
  function regionOf(x) { const a=data.A?.has(x), b=data.B?.has(x), c=data.C?.has(x); if(three){if(a&&b&&c)return'A ∩ B ∩ C';if(a&&b)return'A ∩ B';if(a&&c)return'A ∩ C';if(b&&c)return'B ∩ C';if(a)return'A only';if(b)return'B only';if(c)return'C only';return'Outside';} if(a&&b)return'A ∩ B';if(a)return'A only';if(b)return'B only';return'Outside'; }
  // Add representative items to evaluate which geometric regions the expression selects, including empty regions.
  const diagramResult=useMemo(()=>{
    if (calcError) return result;
    const representatives={A:elForMembership(true,false,false),B:elForMembership(false,true,false),C:elForMembership(false,false,true)};
    const repSets={A:new Set([...data.A,representatives.A,elForMembership(true,true,false),elForMembership(true,false,true),elForMembership(true,true,true)]),B:new Set([...data.B,representatives.B,elForMembership(true,true,false),elForMembership(false,true,true),elForMembership(true,true,true)]),C:new Set([...(data.C||[]),representatives.C,elForMembership(true,false,true),elForMembership(false,true,true),elForMembership(true,true,true)])};
    try { return calculate(activeExpression,repSets,new Set([...data.U,...Object.values(representatives),elForMembership(false,false,false),elForMembership(true,true,false),elForMembership(true,false,true),elForMembership(false,true,true),elForMembership(true,true,true)])); } catch { return result; }
  },[calcError,result,activeExpression,data]);
  const isSelected = (a,b,c=false) => diagramResult.has(elForMembership(a,b,c));
  const drawTokens = region => {
    if(calcError)return [];
    return allElements.filter(x=>regionOf(x)===region);
  };
  return <div className={dark?'app dark':'app'}>
    <header className="topbar"><a className="brand" href="#home"><span className="brand-mark"><Activity size={20}/></span><span>VennTech</span></a><nav><button className={mode==='operations'?'nav-active':''} onClick={()=>clickNav('operations')}>Workspace</button><button className={mode==='practice'?'nav-active':''} onClick={()=>clickNav('practice')}>Practice</button><button className={mode==='concepts'?'nav-active':''} onClick={()=>clickNav('concepts')}>Concepts</button></nav><button className="theme" onClick={()=>setDark(!dark)} aria-label="Toggle color theme">{dark?<Sun size={17}/>:<Moon size={17}/>}</button></header>
    <main id="home" className="page">
      <section className="hero"><div><div className="eyebrow"><span className="live-dot"/> INTERACTIVE LEARNING TOOL</div><h1>Set operations,<br/><em>made visible.</em></h1><p>Explore the logic behind every set. Enter your own elements, choose an operation, and watch the Venn diagram respond.</p><div className="hero-actions"><button className="primary" onClick={()=>clickNav('operations')}><Play size={15} fill="currentColor"/> Open workspace</button></div></div><div className="hero-art"><div className="art-grid"/><div className="art-circle art-a">A</div><div className="art-circle art-b">B</div><div className="art-circle art-c">C</div><span className="art-label">A ∩ B ∩ C</span><span className="art-coordinate">01 — 03</span></div></section>
      <div className="section-heading" id="operations"><div><span className="eyebrow">01 / WORKSPACE</span><h2>Set operations</h2></div><div className="heading-actions"><button className="soft-button" onClick={loadExample}><Sparkles size={15}/> Load example</button><button className="icon-button" onClick={randomExample} title="Random example"><Dices size={16}/></button></div></div>
      <section className="workspace-grid">
        <div className="card input-card"><div className="card-head"><div><span className="eyebrow">YOUR INPUT</span><h3>Define the sets</h3></div><div className="switch-wrap"><span>3-set mode</span><button className={'switch '+(three?'on':'')} onClick={toggle} aria-label="Toggle three-set mode"><span/></button></div></div>
          <label className="field"><span><b className="u-letter">U</b> Universal set</span><div className="input-wrap"><span className="brace">{`{`}</span><input value={uText} onChange={e=>setU(e.target.value)} placeholder="1, 2, 3, 4, 5, 6"/><span className="brace">{`}`}</span></div></label>
          <div className="set-fields"><label className="field"><span><b className="a-letter">A</b> Set A</span><div className="input-wrap"><span className="brace">{`{`}</span><input value={aText} onChange={e=>setA(e.target.value)} placeholder="1, 2, 3"/><span className="brace">{`}`}</span></div></label><label className="field"><span><b className="b-letter">B</b> Set B</span><div className="input-wrap"><span className="brace">{`{`}</span><input value={bText} onChange={e=>setB(e.target.value)} placeholder="2, 3, 4"/><span className="brace">{`}`}</span></div></label></div>
          {three&&<label className="field"><span><b className="c-letter">C</b> Set C</span><div className="input-wrap"><span className="brace">{`{`}</span><input value={cText} onChange={e=>setC(e.target.value)} placeholder="3, 4, 5"/><span className="brace">{`}`}</span></div></label>}
          <div className="input-hint"><CircleHelp size={13}/> Separate elements with commas. Numbers and simple text are supported.</div>
        </div>
        <div className="card diagram-card"><div className="card-head"><div><span className="eyebrow">LIVE PREVIEW</span><h3>Venn diagram</h3></div><span className="live-badge"><span/> LIVE</span></div>
          <div className="diagram-answer"><span>ANSWER FOR <b>{custom?expression:selected}</b></span><strong>{calcError?'Enter a valid expression':showSet(result)}</strong></div>
          <div className="diagram-wrap">
          {!calcError ? <svg className="venn" viewBox="0 0 540 340" role="img" aria-label="Dynamic Venn diagram for the selected set operation">
            <rect x="12" y="12" width="516" height="310" rx="24" className="universe-box"/><text x="30" y="40" className="universe-label">U</text>
            {three ? <>
              <defs><pattern id="answerHatch" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#808a99" opacity=".15"/><path d="M-2 2L2-2M0 9L9 0M7 11L11 7" stroke="#606a78" strokeWidth="1.8" opacity=".82"/></pattern><clipPath id="clipB"><circle cx="320" cy="145" r="106"/></clipPath><clipPath id="clipC"><circle cx="270" cy="204" r="106"/></clipPath><mask id="noA"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="220" cy="145" r="106" fill="black"/></mask><mask id="noB"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="320" cy="145" r="106" fill="black"/></mask><mask id="noC"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="270" cy="204" r="106" fill="black"/></mask><mask id="notBnotC"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="320" cy="145" r="106" fill="black"/><circle cx="270" cy="204" r="106" fill="black"/></mask><mask id="notAnotC"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="220" cy="145" r="106" fill="black"/><circle cx="270" cy="204" r="106" fill="black"/></mask><mask id="notAnotB"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="220" cy="145" r="106" fill="black"/><circle cx="320" cy="145" r="106" fill="black"/></mask><mask id="outsideABC"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="220" cy="145" r="106" fill="black"/><circle cx="320" cy="145" r="106" fill="black"/><circle cx="270" cy="204" r="106" fill="black"/></mask></defs>
              <circle cx="220" cy="145" r="106" className={'set-circle circle-a '+(isSelected(true,false,false)?'active':'')}/><circle cx="320" cy="145" r="106" className={'set-circle circle-b '+(isSelected(false,true,false)?'active':'')}/><circle cx="270" cy="204" r="106" className={'set-circle circle-c '+(isSelected(false,false,true)?'active':'')}/>
              {isSelected(true,false,false)&&<circle cx="220" cy="145" r="106" fill="url(#answerHatch)" mask="url(#notBnotC)"/>}{isSelected(false,true,false)&&<circle cx="320" cy="145" r="106" fill="url(#answerHatch)" mask="url(#notAnotC)"/>}{isSelected(false,false,true)&&<circle cx="270" cy="204" r="106" fill="url(#answerHatch)" mask="url(#notAnotB)"/>}{isSelected(true,true,false)&&<g clipPath="url(#clipB)"><circle cx="220" cy="145" r="106" fill="url(#answerHatch)" mask="url(#noC)"/></g>}{isSelected(true,false,true)&&<g clipPath="url(#clipC)"><circle cx="220" cy="145" r="106" fill="url(#answerHatch)" mask="url(#noB)"/></g>}{isSelected(false,true,true)&&<g clipPath="url(#clipC)"><circle cx="320" cy="145" r="106" fill="url(#answerHatch)" mask="url(#noA)"/></g>}{isSelected(true,true,true)&&<g clipPath="url(#clipB)"><circle cx="220" cy="145" r="106" fill="url(#answerHatch)" clipPath="url(#clipC)"/></g>}{isSelected(false,false,false)&&<rect x="12" y="12" width="516" height="310" fill="url(#answerHatch)" mask="url(#outsideABC)"/>}
              <text x="171" y="74" className="set-label label-a">A</text><text x="371" y="74" className="set-label label-b">B</text><text x="268" y="296" className="set-label label-c">C</text>
              {[
                ['A only',145,146],['B only',394,146],['C only',270,256],['A ∩ B',270,90],['A ∩ C',222,198],['B ∩ C',319,198],['A ∩ B ∩ C',270,158],['Outside',456,288]
              ].map(([name,x,y])=><g key={name} className={'region '+(inRegion(name)?'region-on':'')}><rect x={x-42} y={y-15} width="84" height="35" rx="10"/><text x={x} y={y-2} className="region-name">{name}</text><text x={x} y={y+11} className="region-items">{drawTokens(name).slice(0,4).map(String).join(', ')||'—'}</text></g>)}
            </> : <>
              <defs><pattern id="answerHatch" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#808a99" opacity=".15"/><path d="M-2 2L2-2M0 9L9 0M7 11L11 7" stroke="#606a78" strokeWidth="1.8" opacity=".82"/></pattern><clipPath id="clipB"><circle cx="322" cy="166" r="112"/></clipPath><mask id="notA"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="218" cy="166" r="112" fill="black"/></mask><mask id="notB"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="322" cy="166" r="112" fill="black"/></mask><mask id="outsideAB"><rect x="12" y="12" width="516" height="310" fill="white"/><circle cx="218" cy="166" r="112" fill="black"/><circle cx="322" cy="166" r="112" fill="black"/></mask></defs>
              <circle cx="218" cy="166" r="112" className={'set-circle circle-a '+(isSelected(true,false)?'active':'')}/><circle cx="322" cy="166" r="112" className={'set-circle circle-b '+(isSelected(false,true)?'active':'')}/><text x="157" y="79" className="set-label label-a">A</text><text x="379" y="79" className="set-label label-b">B</text>
              {isSelected(true,false)&&<circle cx="218" cy="166" r="112" fill="url(#answerHatch)" mask="url(#notB)"/>}{isSelected(true,true)&&<circle cx="218" cy="166" r="112" fill="url(#answerHatch)" clipPath="url(#clipB)"/>}{isSelected(false,true)&&<circle cx="322" cy="166" r="112" fill="url(#answerHatch)" mask="url(#notA)"/>}{isSelected(false,false)&&<rect x="12" y="12" width="516" height="310" fill="url(#answerHatch)" mask="url(#outsideAB)"/>}
              {[
                ['A only',159,166,true,false],['A ∩ B',270,166,true,true],['B only',381,166,false,true],['Outside',461,277,false,false]
              ].map(([name,x,y,a,b])=><g key={name} className={'region '+(isSelected(a,b)?'region-on':'')}><rect x={x-44} y={y-17} width="88" height="38" rx="10"/><text x={x} y={y-3} className="region-name">{name}</text><text x={x} y={y+12} className="region-items">{drawTokens(name).slice(0,5).map(String).join(', ')||'—'}</text></g>)}
            </>}
          </svg> : <div className="diagram-error"><CircleHelp size={23}/><span>Fix the input to see your diagram.</span></div>}
          </div><div className="diagram-legend"><span><i className="legend-dot a"/> Set A</span><span><i className="legend-dot b"/> Set B</span>{three&&<span><i className="legend-dot c"/> Set C</span>}<span className="legend-note">Bright regions match your expression</span></div>
        </div>
      </section>
      {(data.error||calcError)&&<div className="error-banner"><CircleHelp size={16}/>{calcError}</div>}
      <section className="card operation-card"><div className="card-head"><div><span className="eyebrow">02 / CHOOSE AN OPERATION</span><h3>What would you like to find?</h3></div><div className="segmented"><button className={!custom?'selected':''} onClick={()=>setCustom(false)}>Operations</button><button className={custom?'selected':''} onClick={openCustom}>Custom expression</button></div></div>
        {!custom?<><div className="operation-list">{(three?ops3:ops2.map(x=>x[0])).map(op=><button key={op} className={'operation-chip '+(selected===op&&!custom?'chosen':'')} onClick={()=>choose(op)}><span>{op}</span>{selected===op&&!custom&&<Check size={15}/>}</button>)}</div>{three&&<p className="microcopy">Turn three-set mode off to see complement and symmetric difference shortcuts.</p>}</>:<div className="expression-tools"><div className="expression-row"><div className="expression-input"><span>f(x)</span><input ref={expressionInput} value={expression} onChange={e=>{setExpression(e.target.value);if(/C/i.test(e.target.value))setThree(true);}} placeholder="(A ∪ B) − C" onKeyDown={e=>e.key==='Enter'&&doCalculate()}/></div><button className="primary" onClick={doCalculate}><Calculator size={15}/> Calculate</button></div><div className="expression-keyboard">{['A','B','C','∪','∩','−','Δ','′','(',')'].map(key=><button key={key} onClick={()=>addKey(key)}>{key}</button>)}<button className="key-delete" onClick={()=>addKey('Backspace')}>⌫</button></div><span className="expression-help">Tap the keys or type an expression. U also means union; N also means intersection.</span></div>}
      </section>
      <section className="answer-grid"><div className="card steps-card"><div className="card-head"><div><span className="eyebrow">03 / WORKED SOLUTION</span><h3>Step by step</h3></div><BookOpen size={19} className="muted-icon"/></div>{!calcError? <div className="steps">{steps.map((step,i)=><div className="step" key={step.title}><div className="step-number">0{i+1}</div><div><h4>{step.title}</h4><p>{step.text}</p></div></div>)}</div>:<p className="muted">Correct the inputs or expression to see the working.</p>}</div>
        <div className="result-card"><div className="result-top"><span className="eyebrow">FINAL ANSWER</span><span className="result-spark"><Sparkles size={16}/></span></div><div className="formula">{custom?expression:selected}</div><div className="result-set">{calcError?'—':showSet(result)}</div><div className="result-bottom"><span className="answer-count">{calcError?'':`${result.size} element${result.size===1?'':'s'}`}</span><button className="reset-diagram" onClick={()=>{setSelected('A ∩ B');setCustom(false);setExpression('(A ∪ B) − C');}}><RotateCcw size={13}/> Reset diagram</button></div></div></section>
      <section className="card practice-card" id="practice">
        <div className="practice-intro">
          <span className="eyebrow">04 / YOUR TURN</span><h3>Practice mode</h3>
          <p>Choose an answer for a fresh set problem. Check it to see whether you are right and reveal the solution.</p>
          <label className="level-select">Difficulty<select value={level} onChange={e=>setLevel(e.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option><option>Expert</option></select></label>
          <button className="primary practice-generate" onClick={makePractice}><Dices size={16}/> {practice?'Try another question':'Generate a question'}</button>
        </div>
        <div className="practice-problem">{practice?<>
          <span className="practice-tag">{practice.difficulty.toUpperCase()} · SETS GIVEN</span>
          <div className="practice-sets"><p><b>U</b> = {showSet(practice.U)}</p><p><b>A</b> = {showSet(practice.A)}</p><p><b>B</b> = {showSet(practice.B)}</p>{practice.difficulty==='Hard'||practice.difficulty==='Expert'?<p><b>C</b> = {showSet(practice.C)}</p>:null}</div>
          <div className="question-line"><span>Find</span><strong>{practice.ex}</strong></div>
          <div className="practice-options">{practice.options.map((option,index)=><button key={index} className={'practice-option '+(practiceChoice===index?'picked ':'')+(practiceChecked&&same(option,practice.answer)?'correct ':'')+(practiceChecked&&practiceChoice===index&&!same(option,practice.answer)?'incorrect':'')} onClick={()=>!practiceChecked&&setPracticeChoice(index)}><span>{String.fromCharCode(65+index)}</span>{showSet(option)}</button>)}</div>
          <div className="practice-actions"><button className="primary" disabled={practiceChoice===null||practiceChecked} onClick={()=>setPracticeChecked(true)}>Check answer</button><button className="answer-toggle" onClick={makePractice}>New question <ChevronRight size={15}/></button></div>
          {practiceChecked&&<><div className={'practice-feedback '+(same(practice.options[practiceChoice],practice.answer)?'is-correct':'is-incorrect')}><b>{same(practice.options[practiceChoice],practice.answer)?'That’s right!':'Not quite.'}</b><span>Correct answer: {showSet(practice.answer)}</span></div><div className="practice-solution"><h4>How it is solved</h4><div className="practice-solution-step"><b>1</b><p>Start with A = {showSet(practice.A)} and B = {showSet(practice.B)}{practice.ex.includes('C')?` and C = ${showSet(practice.C)}`:''}.</p></div>{practice.work.map((step,index)=><div className="practice-solution-step" key={index}><b>{index+2}</b><p>{step}</p></div>)}<div className="practice-solution-final"><strong>Final answer</strong><span>{showSet(practice.answer)}</span></div></div></>}
        </>:<div className="practice-empty"><span className="practice-icon"><Lightbulb size={21}/></span><h4>Ready when you are</h4><p>Pick a difficulty and generate a question. The sets and choices change every time.</p></div>}</div>
      </section>
      <section className="concepts-section" id="concepts"><div className="section-heading"><div><span className="eyebrow">05 / QUICK REFERENCE</span><h2>Set theory, at a glance</h2></div></div><div className="concept-grid">{[['∪','Union','In A or B, including elements in both.'],['∩','Intersection','Only the elements that are common to the sets.'],['−','Difference','In the first set, with the second set removed.'],['′','Complement','In the universal set U, outside the chosen set.'],['Δ','Symmetric difference','In one set or the other, but not in both.'],['U','Universal set','The complete collection of elements being considered.']].map(([symbol,title,desc])=><article className="concept" key={title}><span>{symbol}</span><div><b>{title}</b><p>{desc}</p></div></article>)}</div></section>
      <footer><a className="brand footer-brand" href="#home"><span className="brand-mark"><Activity size={16}/></span><span>VennTech<small>LEARN BY SEEING</small></span></a><span>Discrete Mathematics ISE–2 · Built for curious minds</span><span className="footer-mark">∪ ∩ ∅</span></footer>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
