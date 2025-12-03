import React, { useState, useEffect, useRef } from 'react';

import { 
  BookOpen, 
  MessageCircle, 
  CheckCircle, 
  XCircle, 
  BarChart2, 
  ChevronRight, 
  Brain, 
  Sparkles,
  ArrowLeft,
  RefreshCw,
  Trophy,
  Menu,
  X,
  Calendar,
  FileText,
  Zap,
  Beaker,
  Thermometer,
  Activity,
  Globe,
  PenTool,
  CheckSquare,
  Upload,
  Download,
  Image as ImageIcon,
  Trash2,
  Save,
  Plus,
  Loader2,
  Wand2,
  Layers,
  Award,
  Home,
  File,
  Target,
  Filter,
  AlignJustify,
  Map,
  Table,
  FileSpreadsheet
} from 'lucide-react';

/**
 * --- API & HELPERS ---
 */

const stripBase64Header = (base64Str) => {
  return base64Str.split(',')[1] || base64Str;
};

const getMimeType = (base64Str) => {
  if (base64Str.startsWith('data:application/pdf')) return 'application/pdf';
  return 'image/png';
};

// HELPER: Extract Data (Handles Object vs String image formats)
const getImageData = (img) => {
    return (typeof img === 'object' && img !== null) ? img.data : img;
};

// GEMINI API: Detect Topic (Context Aware with Schema)
const detectTopicFromImage = async (questionImg, board, subject, paper, topicSchema) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  // NORMALIZE KEY: Uppercase everything to match CSV parser
  const schemaKey = `${board.toUpperCase()}-${subject.toUpperCase()}-${paper.toUpperCase()}`;
  const validTopics = topicSchema?.[schemaKey] || [];

  let promptContext = "";
  if (validTopics.length > 0) {
      promptContext = `
      CRITICAL INSTRUCTION: You are strictly bound to a specific curriculum list.
      You MUST classify the image into exactly ONE of the topics from the list below.
      If the question covers multiple, choose the most dominant one.
      
      VALID TOPICS LIST:
      ${validTopics.map(t => `- "${t}"`).join('\n')}
      
      Do not output any topic that is not in this list.
      `;
  } else {
      promptContext = `
      Classify it into ONE single academic topic string strictly based on the official ${board} ${subject} syllabus.
      `;
  }

  const prompt = `
    Analyze this exam question image. 
    ${promptContext}
    
    Return ONLY the topic name. No explanations.
  `;

  const parts = [{ text: prompt }];
  const images = Array.isArray(questionImg) ? questionImg : [questionImg];
  images.forEach(img => { 
      const b64 = getImageData(img);
      if(b64) parts.push({ inlineData: { mimeType: "image/png", data: stripBase64Header(b64) } }); 
  });

  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
    if (!response.ok) throw new Error(`API Error`);
    const data = await response.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return result ? result.replace(/['"]/g, '') : "General";
  } catch (error) { return "Uncategorized"; }
};

const detectMarksFromImage = async (questionImg) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const prompt = `Find the max marks (e.g. [3 marks]). Return ONLY the integer.`;
  const parts = [{ text: prompt }];
  const images = Array.isArray(questionImg) ? questionImg : [questionImg];
  images.forEach(img => { 
      const b64 = getImageData(img);
      if(b64) parts.push({ inlineData: { mimeType: "image/png", data: stripBase64Header(b64) } }); 
  });

  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
    if (!response.ok) throw new Error(`API Error`);
    const data = await response.json();
    return parseInt(data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()) || 0;
  } catch (error) { return 0; }
};

const detectLinesFromImage = async (questionImg) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const prompt = `Count the number of horizontal ruled lines for the answer. Return ONLY the integer. If none, return 0.`;
  const parts = [{ text: prompt }];
  const images = Array.isArray(questionImg) ? questionImg : [questionImg];
  images.forEach(img => { 
      const b64 = getImageData(img);
      if(b64) parts.push({ inlineData: { mimeType: "image/png", data: stripBase64Header(b64) } }); 
  });

  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
    if (!response.ok) throw new Error(`API Error`);
    const data = await response.json();
    const txt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return parseInt(txt) || 4;
  } catch (error) { return 4; }
};

const evaluateAnswerWithGemini = async (questionImg, schemeImg, globalSchemePdf, userAnswer, marks) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  let prompt = `You are an examiner. Mark the student answer.\nMax Marks: ${marks}\nStudent Answer: "${userAnswer}"`;
  if (globalSchemePdf) prompt += `\nUse Global Guidance PDF.`;
  if (schemeImg) prompt += `\nUse Mark Scheme Image.`;
  prompt += `\nProvide score (e.g. 2/${marks}) and brief feedback.`;

  const parts = [{ text: prompt }];
  const qImages = Array.isArray(questionImg) ? questionImg : [questionImg];
  qImages.forEach(img => { 
      const b64 = getImageData(img);
      if(b64) parts.push({ inlineData: { mimeType: "image/png", data: stripBase64Header(b64) } }); 
  });
  if (schemeImg) {
      const sData = getImageData(schemeImg);
      if(sData) parts.push({ inlineData: { mimeType: "image/png", data: stripBase64Header(sData) } });
  }
  if (globalSchemePdf) parts.push({ inlineData: { mimeType: "application/pdf", data: stripBase64Header(globalSchemePdf) } });

  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
      if (!response.ok) throw new Error(`API Error`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "Error marking.";
    } catch (error) { if (i === 4) return "Marking failed."; await new Promise(r => setTimeout(r, delays[i])); }
  }
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
});

// CSV PARSER (Robust)
const parseCSV = (text) => {
    const lines = text.split(/\r\n|\n/).filter(l => l.trim());
    const startIdx = lines[0].toLowerCase().startsWith('board') ? 1 : 0;
    const result = {};
    for(let i=startIdx; i<lines.length; i++) {
        const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (row.length < 4) continue;
        const clean = (s) => s ? s.replace(/^"|"$/g, '').trim().toUpperCase() : '';
        const board = clean(row[0]);
        const subject = clean(row[1]);
        const paperRaw = clean(row[2]); 
        const topicsRaw = row.slice(3).join(',');
        const topics = topicsRaw.split(/[;,]/).map(t => t.replace(/^"|"$/g, '').trim()).filter(t => t);
        let pCode = paperRaw;
        if (paperRaw.includes('1')) pCode = 'P1';
        if (paperRaw.includes('2')) pCode = 'P2';
        const key = `${board}-${subject}-${pCode}`;
        result[key] = topics;
    }
    return result;
};

/**
 * --- DATA ---
 */
const MARK_SCHEME_STYLES = {
  formal: (method, answer, extra) => `**Mark Scheme:**\n• M1: ${method}\n• A1: ${answer}\n\n**Examiner Note:** ${extra}`
};

const STATIC_TOPICS_DB = {
  PHYSICS: {
    P1: [
      {
        id: "p1-static-1",
        type: "text",
        topic: "Energy",
        marks: 3,
        lines: 4,
        text: (year) => `[${year} Q1] A student heats water...`,
        keywords: ["joules"],
        explanation: "Use E=mcT"
      }
    ],
    P2: []
  },
  CHEMISTRY: { P1: [], P2: [] }
};

const SUBJECTS_DB = {
  "AQA-PHYSICS": { name: "AQA Physics", years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], icon: Zap, color: "indigo" },
  "EDEXCEL-CHEM": { name: "Edexcel Chemistry", years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], icon: Beaker, color: "teal" }
};

/**
 * --- COMPONENTS ---
 */

const AskMedly = ({ context, isOpen, onClose }) => {
  const [messages, setMessages] = useState([{ role: 'system', text: "Hi! I'm Medly." }]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'user', text: input }]);
    setInput("");
    setTimeout(() => { setMessages(prev => [...prev, { role: 'system', text: "I'm analyzing..." }]); }, 1000);
  };
  if (!isOpen) return null;
  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white rounded-2xl shadow-2xl border border-indigo-100 flex flex-col z-50 h-96 overflow-hidden">
      <div className="bg-indigo-600 p-3 text-white flex justify-between"><div className="flex gap-2"><Sparkles className="w-4 h-4"/> <span className="font-bold text-sm">ExamAtlas Tutor</span></div><button onClick={onClose}><X className="w-4 h-4"/></button></div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">{messages.map((m,i)=><div key={i} className={`p-2 rounded-lg text-xs ${m.role==='user'?'bg-indigo-600 text-white ml-auto':'bg-gray-100 text-gray-700'}`}>{m.text}</div>)}</div>
      <div className="p-2 border-t flex gap-2"><input value={input} onChange={e=>setInput(e.target.value)} onKeyPress={e=>e.key==='Enter'&&handleSend()} placeholder="Ask..." className="flex-1 bg-gray-100 rounded-full px-3 text-xs"/><button onClick={handleSend}><ChevronRight className="w-4 h-4 text-indigo-600"/></button></div>
    </div>
  );
};

const TeacherStudio = ({ customQuestions, setCustomQuestions, paperResources, setPaperResources, topicSchema, setTopicSchema, onClose }) => {
  const [activeTab, setActiveTab] = useState('questions');
  const [newQ, setNewQ] = useState({ board: "AQA", subject: "PHYSICS", year: "2018", paper: "P1", topic: "General", questionImg: [], schemeImg: null, marks: 4, lines: 4 });
  const [newRes, setNewRes] = useState({ board: "AQA", subject: "PHYSICS", year: "2018", paper: "P1", type: "scheme", file: null, fileName: "" });
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState("");
  const [libFilter, setLibFilter] = useState({ subject: 'ALL', year: 'ALL', paper: 'ALL' });
  const [reclassifying, setReclassifying] = useState(null); 
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const handleImgs = async (e) => {
    const files = Array.from(e.target.files);
    if(files.length){ 
        setLoading(true); 
        try{ 
            const newImages = await Promise.all(files.map(async f => ({ data: await fileToBase64(f), name: f.name }))); 
            const updatedImages = [...newQ.questionImg, ...newImages];
            setNewQ(p=>({...p, questionImg: updatedImages})); 
            setDetecting("auto");
            const [m, l, t] = await Promise.all([
                detectMarksFromImage(updatedImages),
                detectLinesFromImage(updatedImages),
                detectTopicFromImage(updatedImages, newQ.board, newQ.subject, newQ.paper, topicSchema)
            ]);
            setNewQ(p => ({ ...p, marks: m > 0 ? m : p.marks, lines: l > 0 ? l : p.lines, topic: t !== "Uncategorized" ? t : p.topic }));
            setDetecting("");
        }catch(e){ console.error(e); } 
        setLoading(false); e.target.value = null; 
    }
  };

  const removeImg = (index) => setNewQ(p => ({...p, questionImg: p.questionImg.filter((_, i) => i !== index)}));
  const handleScheme = async (e) => { const f=e.target.files[0]; if(f){ setLoading(true); try{const b=await fileToBase64(f); setNewQ(p=>({...p, schemeImg: { data: b, name: f.name }}));}catch(e){} setLoading(false); e.target.value = null; } };
  const removeScheme = () => setNewQ(p=>({...p, schemeImg: null}));
  
  const autoDetect = async (type) => {
    if(!newQ.questionImg.length) return alert("Upload question first.");
    setDetecting(type);
    if(type === 'marks') { const m = await detectMarksFromImage(newQ.questionImg); if(m>0) setNewQ(p=>({...p, marks: m})); }
    else if (type === 'lines') { const l = await detectLinesFromImage(newQ.questionImg); if(l>0) setNewQ(p=>({...p, lines: l})); }
    else { const t = await detectTopicFromImage(newQ.questionImg, newQ.board, newQ.subject, newQ.paper, topicSchema); setNewQ(p=>({...p, topic: t})); }
    setDetecting("");
  };

  const addQ = () => {
    if(!newQ.questionImg.length || !newQ.schemeImg) return alert("Missing images.");
    setCustomQuestions(p => [...p, { ...newQ, id: `c-${Date.now()}`, type: 'image', year: parseInt(newQ.year) }]);
    setNewQ(p=>({...p, questionImg:[], schemeImg:null, lines: 4}));
  };

  const handleResUpload = async (e) => { 
      const f=e.target.files[0]; 
      if(f){ 
          setLoading(true); 
          try{
              if (newRes.type === 'schema') {
                  const text = await f.text();
                  const schemaData = parseCSV(text);
                  setTopicSchema(prev => ({...prev, ...schemaData}));
                  const key = `SCHEMA-FILE-${f.name}`;
                  setPaperResources(prev => ({...prev, [key]: { fileName: f.name, type: 'schema', board: 'ALL' }}));
                  alert(`Schema Loaded: ${Object.keys(schemaData).length} paper configurations found.`);
                  setLoading(false);
                  return; 
              }
              const b=await fileToBase64(f); 
              setNewRes(p=>({...p, file:b, fileName:f.name}));
          }catch(e){ console.error(e); } 
          setLoading(false); 
      } 
  };
  
  const addRes = () => { 
      if(!newRes.file) return alert("No file."); 
      setPaperResources(p=>({...p, [`${newRes.board}-${newRes.subject}-${newRes.year}-${newRes.paper}-${newRes.type}`]: {
          file:newRes.file, fileName:newRes.fileName, board: newRes.board, type: newRes.type
      }})); 
      setNewRes(p=>({...p, file:null, fileName:""})); 
      alert("Resource Saved!"); 
  };

  const exportDB = () => {
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({questions:customQuestions, resources:paperResources, schema: topicSchema}));
    a.download = "examatlas_db.json"; a.click();
  };
  const importDB = (e) => {
    const r = new FileReader(); r.onload = ev => { 
        try { const j=JSON.parse(ev.target.result); 
        if(j.questions) setCustomQuestions(p=>[...p,...j.questions]); 
        if(j.resources) setPaperResources(p=>({...p,...j.resources})); 
        if(j.schema) setTopicSchema(p=>({...p,...j.schema}));
        alert("Imported!"); } catch(e){ alert("Error"); } 
    }; r.readAsText(e.target.files[0]);
  };

  const reclassifyQuestion = async (qId) => {
      const idx = customQuestions.findIndex(q => q.id === qId);
      if (idx === -1) return;
      setReclassifying(qId);
      try {
          const q = customQuestions[idx];
          const newTopic = await detectTopicFromImage(q.questionImg, q.board, q.subject, q.paper, topicSchema);
          setCustomQuestions(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], topic: newTopic }; return copy; });
      } catch (e) {}
      setReclassifying(null);
  };

  const classifyAllQuestions = async () => {
      setBulkProcessing(true);
      const targets = filteredQuestions;
      let processedCount = 0;
      for (const item of targets) {
          try {
              const newTopic = await detectTopicFromImage(item.questionImg, item.board, item.subject, item.paper, topicSchema);
              setCustomQuestions(prev => {
                  const copy = [...prev];
                  const currentIdx = copy.findIndex(q => q.id === item.id);
                  if (currentIdx !== -1) copy[currentIdx] = { ...copy[currentIdx], topic: newTopic };
                  return copy;
              });
              processedCount++;
          } catch(e) {}
          await new Promise(r => setTimeout(r, 500));
      }
      setBulkProcessing(false);
      if(processedCount > 0) alert(`Refined ${processedCount} topics using your new schema!`);
  };

  const filteredQuestions = customQuestions.filter(q => {
      if (libFilter.subject !== 'ALL' && q.subject !== libFilter.subject) return false;
      if (libFilter.year !== 'ALL' && q.year !== parseInt(libFilter.year)) return false;
      if (libFilter.paper !== 'ALL' && q.paper !== libFilter.paper) return false;
      return true;
  });

  const untaggedCount = customQuestions.filter(q => !q.topic || q.topic === 'General' || q.topic === 'Uncategorized').length;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold flex gap-2"><PenTool className="w-5 h-5"/> Teacher Studio</h2>
          <button onClick={onClose}><X className="w-6 h-6 hover:text-red-400"/></button>
        </div>
        <div className="flex border-b">
            {['questions', 'resources'].map(t => (
                <button key={t} onClick={()=>setActiveTab(t)} className={`flex-1 py-3 text-sm font-bold capitalize ${activeTab===t?'text-indigo-600 border-b-2 border-indigo-600':'text-slate-500'}`}>{t}</button>
            ))}
        </div>
        <div className="flex-1 flex overflow-hidden">
            <div className="w-1/3 bg-slate-50 p-4 border-r overflow-y-auto space-y-4">
                {activeTab === 'questions' ? (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Board</label>
                                <select value={newQ.board} onChange={e=>setNewQ({...newQ,board:e.target.value})} className="w-full p-2 rounded border text-xs"><option value="AQA">AQA</option><option value="Edexcel">Edexcel</option><option value="OCR">OCR</option><option value="CIE">CIE</option></select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Subject</label>
                                <select value={newQ.subject} onChange={e=>setNewQ({...newQ,subject:e.target.value})} className="w-full p-2 rounded border text-xs"><option value="PHYSICS">Physics</option><option value="CHEMISTRY">Chemistry</option></select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Year</label>
                                <select value={newQ.year} onChange={e=>setNewQ({...newQ,year:e.target.value})} className="w-full p-2 rounded border text-xs">{[2018,2019,2020,2021,2022,2023,2024,2025].map(y=><option key={y} value={y}>{y}</option>)}</select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Paper</label>
                                <select value={newQ.paper} onChange={e=>setNewQ({...newQ,paper:e.target.value})} className="w-full p-2 rounded border text-xs"><option value="P1">Paper 1</option><option value="P2">Paper 2</option></select>
                            </div>
                        </div>
                        <div className="flex gap-2"><div className="flex-1 flex gap-1"><input value={newQ.topic} onChange={e=>setNewQ({...newQ,topic:e.target.value})} className="flex-1 p-2 rounded border text-xs" placeholder="Topic"/><button onClick={()=>autoDetect('topic')} disabled={detecting} className="bg-indigo-100 text-indigo-600 p-2 rounded hover:bg-indigo-200">{detecting==='topic'?<Loader2 className="w-4 h-4 animate-spin"/>:<Brain className="w-4 h-4"/>}</button></div></div>
                        <div className="flex gap-2 items-center"><div className="flex-1 flex gap-2 items-center"><input type="number" value={newQ.marks} onChange={e=>setNewQ({...newQ,marks:parseInt(e.target.value)||0})} className="w-16 p-2 rounded border text-xs" placeholder="Marks"/><button onClick={()=>autoDetect('marks')} disabled={detecting||detecting==='auto'} className="bg-purple-100 text-purple-600 p-2 rounded hover:bg-purple-200">{detecting==='marks'||detecting==='auto'?<Loader2 className="w-4 h-4 animate-spin"/>:<Award className="w-4 h-4"/>}</button></div><div className="flex-1 flex gap-2 items-center"><input type="number" value={newQ.lines} onChange={e=>setNewQ({...newQ,lines:parseInt(e.target.value)||0})} className="w-16 p-2 rounded border text-xs" placeholder="Lines"/><button onClick={()=>autoDetect('lines')} disabled={detecting||detecting==='auto'} className="bg-blue-100 text-blue-600 p-2 rounded hover:bg-blue-200">{detecting==='lines'||detecting==='auto'?<Loader2 className="w-4 h-4 animate-spin"/>:<AlignJustify className="w-4 h-4"/>}</button></div></div>
                        <div className="space-y-1"><label className="block text-xs font-bold text-slate-500 uppercase">Question Images</label><div className="grid grid-cols-3 gap-2">{newQ.questionImg.map((img, idx) => (<div key={idx} className="relative group border rounded-lg overflow-hidden bg-white shadow-sm h-20"><img src={getImageData(img)} className="w-full h-full object-cover" /><button onClick={() => removeImg(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition hover:bg-red-600"><X className="w-3 h-3"/></button></div>))}<div className="relative border-2 border-dashed border-indigo-200 rounded-lg flex flex-col items-center justify-center h-20 hover:bg-indigo-50 transition cursor-pointer text-indigo-400"><input type="file" multiple onChange={handleImgs} className="absolute inset-0 opacity-0 cursor-pointer" />{loading ? <Loader2 className="w-6 h-6 animate-spin"/> : <Plus className="w-6 h-6 mb-1"/>}<span className="text-[9px] font-bold uppercase">{loading ? '...' : 'Add'}</span></div></div></div>
                        <div className="space-y-1"><label className="block text-xs font-bold text-slate-500 uppercase">Mark Scheme</label>{newQ.schemeImg ? (<div className="relative group border rounded-lg overflow-hidden bg-white shadow-sm h-20 w-24"><img src={getImageData(newQ.schemeImg)} className="w-full h-full object-cover" /><button onClick={() => removeScheme()} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition hover:bg-red-600"><X className="w-3 h-3"/></button></div>) : (<div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-white transition cursor-pointer relative h-20 flex flex-col items-center justify-center text-slate-400"><input type="file" onChange={handleScheme} className="absolute inset-0 opacity-0 cursor-pointer" /><CheckSquare className="w-6 h-6 mb-1" /><span className="text-xs">Upload Answer</span></div>)}</div>
                        <button onClick={addQ} className="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700">Add Question</button>
                    </>
                ) : (
                    <>
                        <div className="text-xs text-slate-500 mb-2">Upload Resources</div>
                        <div className="space-y-4">
                             <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label><select value={newRes.type} onChange={e=>setNewRes({...newRes,type:e.target.value})} className="w-full p-2 rounded border text-xs"><option value="scheme">Global Mark Scheme (PDF)</option><option value="supplementary">Supplementary (Formula Sheet)</option><option value="schema">Topic Classification Schema (CSV)</option></select></div>
                            {newRes.type !== 'schema' && (<div className="grid grid-cols-2 gap-2"><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Board</label><select value={newRes.board} onChange={e=>setNewRes({...newRes,board:e.target.value})} className="w-full p-2 rounded border text-xs"><option value="AQA">AQA</option><option value="Edexcel">Edexcel</option><option value="OCR">OCR</option><option value="CIE">CIE</option></select></div><div><label className="block text-xs font-bold text-slate-500 mb-1">Subject</label><select value={newRes.subject} onChange={e=>setNewRes({...newRes,subject:e.target.value})} className="w-full p-2 rounded border text-xs"><option value="PHYSICS">Physics</option><option value="CHEMISTRY">Chemistry</option></select></div></div>)}
                            {newRes.type !== 'schema' && (<div className="grid grid-cols-2 gap-2"><select value={newRes.year} onChange={e=>setNewRes({...newRes,year:e.target.value})} className="p-2 rounded border text-xs">{[2018,2019,2020,2021,2022,2023,2024,2025].map(y=><option key={y} value={y}>{y}</option>)}</select><select value={newRes.paper} onChange={e=>setNewRes({...newRes,paper:e.target.value})} className="w-full p-2 rounded border text-xs"><option value="P1">Paper 1</option><option value="P2">Paper 2</option></select></div>)}
                        </div>
                        <div className="border-2 border-dashed rounded p-8 text-center relative cursor-pointer hover:bg-white mt-4"><input type="file" onChange={handleResUpload} className="absolute inset-0 opacity-0"/>{newRes.file ? <div className="flex flex-col items-center"><FileText className="w-8 h-8 text-green-600 mb-2" /><div className="text-xs text-green-600 font-bold">{newRes.fileName}</div></div> : <div className="text-slate-400 flex flex-col items-center">{newRes.type === 'schema' ? <FileSpreadsheet className="w-8 h-8 mb-2"/> : <Upload className="w-8 h-8 mb-2" />}<span className="text-xs">Upload {newRes.type === 'schema' ? '.csv file' : 'PDF'}</span></div>}</div>
                        <button onClick={newRes.type === 'schema' ? undefined : addRes} className="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700 mt-2">{newRes.type === 'schema' ? 'Schema Loaded Automatically' : 'Save Resource'}</button>
                    </>
                )}
            </div>
            <div className="flex-1 bg-white p-6 flex flex-col">
                <div className="flex justify-between mb-4">
                    <h3 className="font-bold">Library ({customQuestions.length})</h3>
                    <div className="flex gap-2">
                        <button onClick={classifyAllQuestions} disabled={bulkProcessing || customQuestions.length === 0} className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition">{bulkProcessing ? <Loader2 className="w-3 h-3 animate-spin"/> : <Brain className="w-3 h-3"/>} Refine All Topics</button>
                        <label className="cursor-pointer bg-slate-100 px-3 py-1 rounded text-xs font-bold flex items-center gap-1"><Upload className="w-3 h-3"/> Import <input type="file" onChange={importDB} className="hidden"/></label>
                        <button onClick={exportDB} className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded text-xs font-bold flex items-center gap-1"><Download className="w-3 h-3"/> Export</button>
                    </div>
                </div>
                <div className="flex gap-2 mb-4 p-2 bg-slate-50 rounded-lg border border-slate-100"><div className="flex items-center gap-2 flex-1"><Filter className="w-3 h-3 text-slate-400" /><select value={libFilter.subject} onChange={e => setLibFilter({...libFilter, subject: e.target.value})} className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none"><option value="ALL">All Subjects</option><option value="PHYSICS">Physics</option><option value="CHEMISTRY">Chemistry</option></select></div><div className="w-px bg-slate-200"></div><select value={libFilter.year} onChange={e => setLibFilter({...libFilter, year: e.target.value})} className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none"><option value="ALL">All Years</option>{[2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}</select><div className="w-px bg-slate-200"></div><select value={libFilter.paper} onChange={e => setLibFilter({...libFilter, paper: e.target.value})} className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none"><option value="ALL">All Papers</option><option value="P1">Paper 1</option><option value="P2">Paper 2</option></select></div>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {/* Paper Resources & Schemas */}
                    {Object.entries(paperResources).map(([key, res]) => (
                        <div key={key} className={`p-3 rounded-lg border flex gap-4 items-center ${res.type === 'schema' ? 'bg-purple-50 border-purple-200' : 'bg-amber-50 border-amber-200'}`}>
                            <div className={`w-10 h-10 rounded flex items-center justify-center ${res.type === 'schema' ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                                {res.type === 'schema' ? <FileSpreadsheet className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                            </div>
                            <div className="flex-1">
                                <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${res.type === 'schema' ? 'text-purple-800' : 'text-amber-800'}`}>{res.type === 'schema' ? 'Topic Schema' : 'Global Resource'}</div>
                                <div className="text-sm font-bold text-slate-700">{res.fileName}</div>
                            </div>
                            <button onClick={() => { const newRes = {...paperResources}; delete newRes[key]; setPaperResources(newRes); }} className="text-slate-400 hover:text-red-600 p-2"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    ))}

                    {filteredQuestions.length === 0 && Object.keys(paperResources).length === 0 && <div className="text-center text-xs text-slate-400 mt-10">Library is empty</div>}
                    
                    {filteredQuestions.map((q, i) => (
                        <div key={i} className="flex gap-3 p-2 border rounded hover:bg-slate-50">
                            <div className="w-12 h-12 bg-gray-200 rounded overflow-hidden"><img src={getImageData(q.questionImg[0])} className="w-full h-full object-cover"/></div>
                            <div className="flex-1">
                                <div className="flex gap-1 mb-1 items-center"><span className="text-[10px] bg-slate-200 text-slate-700 px-1 rounded">{q.board}</span><span className="text-[10px] bg-indigo-100 text-indigo-800 px-1 rounded">{q.subject}</span><div className="flex items-center gap-1 bg-green-100 text-green-800 px-1 rounded"><span className="text-[10px]">{q.topic}</span><button onClick={() => reclassifyQuestion(q.id)} className="hover:bg-green-200 rounded p-0.5" title="Re-classify Topic">{reclassifying === q.id ? <Loader2 className="w-2 h-2 animate-spin"/> : <Brain className="w-2 h-2"/>}</button></div></div>
                                <div className="text-xs text-slate-500">{q.year} {q.paper} • {q.marks} Marks • {q.lines || 4} Lines</div>
                            </div>
                            <button onClick={()=>setCustomQuestions(p=>p.filter(item=>item.id!==q.id))} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

const ExamMode = ({ examData, paperResources, onExit, onComplete }) => {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [txt, setTxt] = useState("");
  const [showExp, setShowExp] = useState(false);
  const [marking, setMarking] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [chat, setChat] = useState(false);

  const q = examData.questions[idx];
  
  const resKey = `${q.board || 'AQA'}-${examData.board === 'AQA' ? 'PHYSICS' : 'CHEMISTRY'}-${q.year || examData.year}-${q.paper || examData.paperCode}-scheme`;
  const globalRes = paperResources?.[resKey];

  useEffect(() => { setTxt(""); setShowExp(false); setMarking(false); }, [idx]);

  const submitText = async () => {
    if (!txt.trim()) return;
    if (q.type === 'image') {
      setMarking(true);
      try {
        const fb = await evaluateAnswerWithGemini(q.questionImg, q.schemeImg, globalRes?.file, txt, q.marks);
        setAnswers(p => ({ ...p, [idx]: { val: txt, feedback: fb, marksAwarded: 0, isCorrect: null } }));
        setShowExp(true);
      } catch (e) { alert("AI Error"); }
      setMarking(false);
    } else {
      setAnswers(p => ({ ...p, [idx]: { val: txt, marksAwarded: 0, isCorrect: null } }));
      setShowExp(true);
    }
  };

  const verify = (correct) => {
    const awarded = correct ? q.marks : 0;
    setAnswers(p => ({ ...p, [idx]: { ...p[idx], isCorrect: correct, marksAwarded: awarded } }));
  };

  const next = () => {
    if (idx < examData.questions.length - 1) setIdx(p => p + 1);
    else {
        setIsDone(true);
        if (onComplete) onComplete(answers, examData);
    }
  };

  if (isDone) {
    const score = Object.values(answers).reduce((a, x) => a + (x.marksAwarded || 0), 0);
    const total = examData.questions.reduce((a, x) => a + x.marks, 0);
    return (
        <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center">
            <div className="bg-white p-8 rounded-3xl shadow-xl max-w-lg w-full text-center">
                <Award className="w-16 h-16 text-indigo-600 mx-auto mb-4"/>
                <h2 className="text-3xl font-bold mb-2">Practice Complete!</h2>
                <div className="text-5xl font-extrabold text-indigo-600 mb-2">{Math.round((score/total)*100)}%</div>
                <p className="text-slate-500 mb-6">You scored {score}/{total} marks</p>
                <button onClick={onExit} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">Back to Atlas</button>
            </div>
        </div>
    );
  }

  // Styles for the ruled textarea
  const lineH = 32; // Line height in pixels
  const ruledLines = q.lines || 4; // Default to 4 lines if not set
  const areaHeight = ruledLines * lineH;
  
  const ruledStyle = {
    lineHeight: `${lineH}px`,
    backgroundImage: `repeating-linear-gradient(transparent, transparent ${lineH-1}px, #e2e8f0 ${lineH-1}px, #e2e8f0 ${lineH}px)`,
    backgroundAttachment: 'local',
    height: `${areaHeight}px`,
    minHeight: `${areaHeight}px`,
    paddingTop: '6px' // Align text with lines
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <header className="bg-white p-4 border-b flex justify-between items-center sticky top-0 z-10">
            <button onClick={onExit} className="text-slate-500 font-bold flex gap-2 items-center"><ArrowLeft className="w-4 h-4"/> Exit</button>
            <div className="text-sm font-bold">{examData.title} <span className="text-slate-400">Q{idx+1}/{examData.questions.length}</span></div>
            <button onClick={()=>setChat(!chat)} className="p-2 bg-indigo-50 text-indigo-600 rounded-full"><MessageCircle className="w-4 h-4"/></button>
        </header>
        <main className="flex-1 max-w-3xl mx-auto w-full p-4 pb-32">
            <div className="bg-white p-6 rounded-2xl shadow-sm border mb-4">
                <div className="flex justify-between mb-4"><span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded">{q.topic || 'General'}</span><span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded">{q.marks} Marks</span></div>
                {q.type === 'image' ? (
                    <div className="space-y-2">
                        {Array.isArray(q.questionImg) ? q.questionImg.map((img,i)=><img key={i} src={getImageData(img)} className="w-full rounded border"/>) : <img src={getImageData(q.questionImg)} className="w-full rounded border"/>}
                    </div>
                ) : <h2 className="text-lg font-medium">{q.text}</h2>}
            </div>
            {!showExp ? (
                <div className="bg-white p-4 rounded-2xl border shadow-sm">
                    <div className="relative w-full border border-gray-200 rounded-xl overflow-hidden bg-white mb-2">
                        {/* Ruled Textarea */}
                        <textarea 
                            value={txt} 
                            onChange={e=>setTxt(e.target.value)} 
                            disabled={marking} 
                            placeholder="Write your answer here..." 
                            className="w-full p-3 resize-none outline-none text-base text-slate-700 block"
                            style={ruledStyle}
                        />
                    </div>
                    <button onClick={submitText} disabled={marking||!txt} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2">{marking?<Loader2 className="animate-spin w-4 h-4"/>:<PenTool className="w-4 h-4"/>} Submit Answer</button>
                </div>
            ) : (
                <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg animate-in slide-in-from-bottom-4">
                    {answers[idx]?.feedback && <div className="bg-indigo-900/50 p-4 rounded-xl mb-4 text-sm text-indigo-100 font-serif border border-indigo-700">{answers[idx].feedback}</div>}
                    <div className="flex justify-between items-center mb-4"><span className="text-xs font-bold uppercase text-slate-400">Self Verify</span></div>
                    <div className="flex gap-2 mb-6">
                        <button onClick={()=>verify(false)} className={`flex-1 py-2 rounded font-bold text-sm flex gap-2 justify-center items-center ${answers[idx]?.isCorrect===false?'bg-red-500':'bg-slate-700'}`}><XCircle className="w-4 h-4"/> 0 Marks</button>
                        <button onClick={()=>verify(true)} className={`flex-1 py-2 rounded font-bold text-sm flex gap-2 justify-center items-center ${answers[idx]?.isCorrect===true?'bg-green-500':'bg-slate-700'}`}><CheckCircle className="w-4 h-4"/> Full Marks</button>
                    </div>
                    {q.type!=='image' && <div className="text-sm opacity-80 font-mono mb-4">{q.explanation}</div>}
                    {q.type==='image' && <img src={getImageData(q.schemeImg)} className="w-full rounded mb-4 bg-white"/>}
                    <button onClick={next} className="w-full bg-white text-slate-900 py-3 rounded-xl font-bold flex justify-center items-center gap-2">Next <ChevronRight className="w-4 h-4"/></button>
                </div>
            )}
        </main>
        <AskMedly isOpen={chat} onClose={()=>setChat(false)} context={q}/>
    </div>
  );
};

const Dashboard = ({ onSelectExam, onOpenStudio, customDB = [], paperResources, userStats }) => {
  const [tab, setTab] = useState('papers'); // 'papers' or 'topics'
  const [subject, setSubject] = useState(null);

  // Extract unique topics from DB for a subject
  const getTopics = (subjCode) => {
    const board = subjCode === 'AQA-PHYSICS' ? 'PHYSICS' : 'CHEMISTRY';
    // Fix: Resolve text function for static questions
    const staticQs = Object.values(STATIC_TOPICS_DB[board]).flat().map(q => ({
        ...q, 
        source: 'static',
        text: typeof q.text === 'function' ? q.text('Practice') : q.text // Resolve function
    }));
    const customQs = customDB.filter(q => q.subject === board).map(q => ({...q, source: 'custom'}));
    const allQs = [...staticQs, ...customQs];
    
    // Group
    const topicMap = {};
    allQs.forEach(q => {
        const t = q.topic || 'Uncategorized';
        if(!topicMap[t]) topicMap[t] = [];
        topicMap[t].push(q);
    });
    return topicMap;
  };

  const startTopicTest = (topicName, questions) => {
    onSelectExam({
        id: `practice-${topicName}`,
        title: `${topicName} Practice`,
        board: 'Practice',
        year: 'Mixed',
        questions: questions.sort(() => 0.5 - Math.random()) // Shuffle
    });
  };

  const generatePaper = (y, pNum) => {
    const board = subject === 'AQA-PHYSICS' ? 'PHYSICS' : 'CHEMISTRY';
    const pCode = pNum === 1 ? 'P1' : 'P2';
    
    // Static Qs need function execution fix
    const sQs = (STATIC_TOPICS_DB[board][pCode] || []).map((q,i)=>({
        ...q, 
        id:`s-${y}-${i}`, 
        year:y, 
        paper:pCode,
        text: typeof q.text === 'function' ? q.text(y) : q.text
    }));
    
    const cQs = customDB.filter(q => q.subject === board && q.year === y && q.paper === pCode);
    const all = [...sQs, ...cQs];
    if(!all.length) return alert("No questions.");
    onSelectExam({ id: `${board}-${y}-${pCode}`, title: `${board} ${y} Paper ${pNum}`, board: board === 'PHYSICS'?'AQA':'Edexcel', year: y, paperCode: pCode, questions: all });
  };

  if (subject) {
    const topics = getTopics(subject);
    const subjName = SUBJECTS_DB[subject].name;
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-5xl mx-auto">
            <button onClick={()=>setSubject(null)} className="mb-4 flex items-center text-slate-500 font-bold"><ArrowLeft className="w-4 h-4 mr-2"/> Subjects</button>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-6">{subjName}</h1>
            
            <div className="flex gap-4 mb-8 border-b">
                <button onClick={()=>setTab('papers')} className={`pb-2 px-4 font-bold ${tab==='papers'?'text-indigo-600 border-b-2 border-indigo-600':'text-slate-400'}`}>Past Papers</button>
                <button onClick={()=>setTab('topics')} className={`pb-2 px-4 font-bold ${tab==='topics'?'text-indigo-600 border-b-2 border-indigo-600':'text-slate-400'}`}>Topic Mastery</button>
            </div>

            {tab === 'papers' ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {SUBJECTS_DB[subject].years.map(y => (
                        <div key={y} className="bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition">
                            <div className="text-2xl font-bold text-slate-800 mb-2">{y}</div>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={()=>generatePaper(y,1)} className="bg-slate-50 hover:bg-indigo-600 hover:text-white py-2 rounded text-sm font-bold border">Paper 1</button>
                                <button onClick={()=>generatePaper(y,2)} className="bg-slate-50 hover:bg-indigo-600 hover:text-white py-2 rounded text-sm font-bold border">Paper 2</button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(topics).map(([tName, qs]) => {
                        const stats = userStats[tName] || { correct: 0, total: 0 };
                        const pct = stats.total > 0 ? Math.round((stats.correct/stats.total)*100) : 0;
                        return (
                            <div key={tName} className="bg-white p-6 rounded-xl border shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-lg text-slate-800">{tName}</h3>
                                        <span className="text-xs bg-slate-100 px-2 py-1 rounded font-bold text-slate-500">{qs.length} Qs</span>
                                    </div>
                                    <div className="w-full bg-gray-100 h-2 rounded-full mb-1 overflow-hidden">
                                        <div className="bg-green-500 h-full transition-all duration-1000" style={{width: `${pct}%`}}></div>
                                    </div>
                                    <div className="text-xs text-slate-400 font-bold mb-4">{pct}% Mastery ({stats.correct}/{stats.total} Marks)</div>
                                </div>
                                <button onClick={()=>startTopicTest(tName, qs)} className="w-full bg-indigo-50 text-indigo-700 font-bold py-3 rounded-lg hover:bg-indigo-100 transition flex items-center justify-center gap-2">
                                    <Target className="w-4 h-4"/> Practice Topic
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center pt-20">
        <h1 className="text-4xl font-extrabold mb-8">Exam Atlas</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
            {Object.entries(SUBJECTS_DB).map(([k, d]) => (
                <button key={k} onClick={()=>setSubject(k)} className="bg-white p-8 rounded-3xl shadow-sm border hover:border-indigo-500 hover:shadow-xl transition text-left relative overflow-hidden group">
                    <div className={`w-14 h-14 bg-${d.color}-100 rounded-2xl flex items-center justify-center mb-4 text-${d.color}-600`}><d.icon className="w-8 h-8"/></div>
                    <h2 className="text-2xl font-bold mb-2">{d.name}</h2>
                    <p className="text-slate-500">Past Papers & Topic Mastery</p>
                    <ChevronRight className="absolute bottom-8 right-8 w-6 h-6 text-slate-300 group-hover:text-indigo-600 transition"/>
                </button>
            ))}
        </div>
        <button onClick={onOpenStudio} className="mt-12 flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full font-bold hover:bg-slate-700 transition shadow-lg">
            <PenTool className="w-4 h-4"/> Teacher Studio
        </button>
    </div>
  );
};

const App = () => {
  const [view, setView] = useState('dash'); // dash, exam
  const [examData, setExamData] = useState(null);
  const [studio, setStudio] = useState(false);
  const [customDB, setCustomDB] = useState([]);
  const [resDB, setResDB] = useState({});
  const [topicSchema, setTopicSchema] = useState({});
  const [userStats, setUserStats] = useState({}); // { TopicName: { correct: 10, total: 20 } }

  // 1. LOAD FROM LOCAL STORAGE ON MOUNT
  useEffect(() => {
    const savedDB = localStorage.getItem('medly_customDB');
    const savedRes = localStorage.getItem('medly_resDB');
    const savedSchema = localStorage.getItem('medly_topicSchema');
    const savedStats = localStorage.getItem('medly_userStats');

    if (savedDB) setCustomDB(JSON.parse(savedDB));
    if (savedRes) setResDB(JSON.parse(savedRes));
    if (savedSchema) setTopicSchema(JSON.parse(savedSchema));
    if (savedStats) setUserStats(JSON.parse(savedStats));
  }, []);

  // 2. SAVE TO LOCAL STORAGE WHENEVER STATE CHANGES
  useEffect(() => { 
      try {
          localStorage.setItem('medly_customDB', JSON.stringify(customDB)); 
      } catch (e) {
          console.warn("Quota exceeded for customDB");
      }
  }, [customDB]);
  
  useEffect(() => { 
      try {
          localStorage.setItem('medly_resDB', JSON.stringify(resDB)); 
      } catch (e) {
          console.warn("Quota exceeded for resDB");
      }
  }, [resDB]);
  
  useEffect(() => { localStorage.setItem('medly_topicSchema', JSON.stringify(topicSchema)); }, [topicSchema]);
  useEffect(() => { localStorage.setItem('medly_userStats', JSON.stringify(userStats)); }, [userStats]);

  const handleExamComplete = (answers, examInfo) => {
    // Update stats based on results
    const newStats = { ...userStats };
    examInfo.questions.forEach((q, idx) => {
        const t = q.topic || 'General';
        const earned = answers[idx]?.marksAwarded || 0;
        const possible = q.marks || 0;
        if (!newStats[t]) newStats[t] = { correct: 0, total: 0 };
        newStats[t].correct += earned;
        newStats[t].total += possible;
    });
    setUserStats(newStats);
  };

  return (
    <>
      {studio && <TeacherStudio customQuestions={customDB} setCustomQuestions={setCustomDB} paperResources={resDB} setPaperResources={setResDB} topicSchema={topicSchema} setTopicSchema={setTopicSchema} onClose={()=>setStudio(false)} />}
      {view === 'exam' && examData ? (
        <ExamMode examData={examData} paperResources={resDB} onExit={()=>setView('dash')} onComplete={handleExamComplete} />
      ) : (
        <Dashboard onSelectExam={(d)=>{setExamData(d); setView('exam');}} onOpenStudio={()=>setStudio(true)} customDB={customDB} paperResources={resDB} userStats={userStats} />
      )}
    </>
  );
};

export default App;
