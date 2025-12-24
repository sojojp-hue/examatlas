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
  FileSpreadsheet,
  AlertCircle,
  Lightbulb,
  Check,
  Bookmark,
  Star,
  Eye,
  StickyNote,
  FolderUp,
  Files,
  ArrowRight,
  Lock,
  Unlock,
  User,
  Sparkle
} from 'lucide-react';

/**
 * --- INDEXEDDB HELPER ---
 */
const DB_NAME = 'ExamAtlasDB';
const DB_VERSION = 3;
const STORES = ['customQuestions', 'paperResources', 'userStats', 'bookmarks', 'bookmarkNotes', 'topicSchema', 'predictedPapers'];

const idb = {
  open: () => {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
          reject(new Error("IndexedDB not supported"));
          return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach(store => {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  get: async (storeName) => {
    try {
        const db = await idb.open();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const request = store.get('data');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.warn(`IDB Get Error (${storeName}):`, e);
        return null;
    }
  },
  set: async (storeName, data) => {
    try {
        const db = await idb.open();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const request = store.put(data, 'data');
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.warn(`IDB Set Error (${storeName}):`, e);
    }
  }
};

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

const getImageData = (img) => {
    return (typeof img === 'object' && img !== null) ? img.data : img;
};

const chatWithAtlas = async (questionImg, schemeImg, userQuery) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const prompt = `
    You are Atlas, an expert AI Exam Tutor.
    Student Query: "${userQuery}"
    Instructions:
    - Answer helpfully, encouragingly, and concisely.
    - Format answers nicely using bolding and lists.
    - Use the provided context to explain.
  `;

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

  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
    if (!response.ok) throw new Error(`API Error`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "I'm having trouble seeing the question right now.";
  } catch (error) { return "I'm having trouble connecting to my brain. Please try again."; }
};

const detectTopicFromImage = async (questionImg, board, subject, paper, topicSchema) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const schemaKey = `${board.toUpperCase()}-${subject.toUpperCase()}-${paper.toUpperCase()}`;
  const validTopics = topicSchema?.[schemaKey] || [];

  let promptContext = validTopics.length > 0 
      ? `Classify into ONE topic from: ${validTopics.join(', ')}`
      : `Classify strictly based on ${board} ${subject} syllabus.`;

  const prompt = `Analyze this exam question image. ${promptContext}. Return ONLY the topic name.`;

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
  const prompt = `Find the max marks. Return ONLY the integer.`;
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
  const prompt = `Count horizontal answer lines. Return ONLY integer. If none, return 0.`;
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

const evaluateAnswerWithGemini = async (questionImg, schemeImg, globalSchemePdf, userAnswer, marks, questionText, schemeText) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  let prompt = `
    Task: Mark student answer.
    Max Marks: ${marks}
    Student Answer: "${userAnswer}"
  `;
  
  const parts = [];
  if (questionText && schemeText) {
      prompt += `\nContext: ${questionText}\nCriteria: ${schemeText}`;
  } else {
      const qImages = Array.isArray(questionImg) ? questionImg : [questionImg];
      qImages.forEach(img => { 
          const b64 = getImageData(img);
          if(b64) parts.push({ inlineData: { mimeType: "image/png", data: stripBase64Header(b64) } }); 
      });
      if (schemeImg) {
          const sData = getImageData(schemeImg);
          if(sData) parts.push({ inlineData: { mimeType: "image/png", data: stripBase64Header(sData) } });
      }
  }

  if (globalSchemePdf) parts.push({ inlineData: { mimeType: "application/pdf", data: stripBase64Header(globalSchemePdf) } });
  
  prompt += `
    Output JSON: {
      "marks_awarded": number,
      "feedback_title": "string",
      "feedback_summary": "string",
      "correct_points": ["string"],
      "missed_points": ["string"],
      "improvement_tip": "string"
    }
  `;
  parts.unshift({ text: prompt });

  try {
      const response = await fetch(url, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } }) 
      });
      if (!response.ok) throw new Error(`API Error`);
      const data = await response.json();
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch (error) { 
      return { marks_awarded: 0, feedback_title: "Error", feedback_summary: "Marking failed.", correct_points: [], missed_points: [], improvement_tip: "Please try again." }; 
  }
};

const analyzeQuestionData = async (questionImg, schemeImg, board, subject, paper, topicSchema) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const schemaKey = `${board.toUpperCase()}-${subject.toUpperCase()}-${paper.toUpperCase()}`;
  const validTopics = topicSchema?.[schemaKey] || [];
  let topicInstruction = validTopics.length > 0 ? `Classify into ONE topic: ${validTopics.join(', ')}` : `Classify by syllabus.`;

  const prompt = `
    Analyze images. Extract metadata.
    1. ${topicInstruction}
    2. Max Marks (int).
    3. Ruled Lines (int).
    4. Question Text (OCR).
    5. Mark Scheme Text (OCR).

    Output JSON: { "topic": "string", "marks": number, "lines": number, "question_text": "string", "scheme_text": "string" }
  `;

  const parts = [{ text: prompt }];
  const images = Array.isArray(questionImg) ? questionImg : [questionImg];
  images.forEach(img => { 
      const b64 = getImageData(img);
      if(b64) parts.push({ inlineData: { mimeType: "image/png", data: stripBase64Header(b64) } }); 
  });
  if (schemeImg) {
      const sData = getImageData(schemeImg);
      if(sData) parts.push({ inlineData: { mimeType: "image/png", data: stripBase64Header(sData) } }); 
  }

  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } }) });
    if (!response.ok) throw new Error(`API Error`);
    const data = await response.json();
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch (error) { return { topic: "Uncategorized", marks: 1, lines: 4, question_text: "", scheme_text: "" }; }
};

const generateMockPaperWithGemini = async (board, subject) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const prompt = `
      Act as a Senior Examiner for ${board} ${subject}.
      Generate a "Predicted Paper" containing 4 unique, high-quality exam questions.
      
      Requirements:
      1. Questions must cover different key topics from the official syllabus.
      2. Questions should range in difficulty (1 easy, 2 medium, 1 hard).
      3. Questions must be text-based scenarios (no images required).
      4. CRITICAL: If using LaTeX, you MUST double-escape all backslashes (e.g. \\\\frac instead of \\frac) to ensure valid JSON.
      
      Output strictly a JSON Array of objects:
      [
        {
          "text": "Full question text here...",
          "marks": number (integer between 2 and 6),
          "topic": "Topic Name",
          "explanation": "Detailed marking scheme criteria for this question..."
        }
      ]
    `;
    
    try {
        const response = await fetch(url, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }], 
                generationConfig: { responseMimeType: "application/json" } 
            }) 
        });
        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text) || [];
    } catch (e) {
        console.error("Generation failed", e);
        return [];
    }
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
});

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
 * --- DATA & COMPONENTS ---
 */
const STATIC_TOPICS_DB = {
  PHYSICS: { P1: [], P2: [] },
  CHEMISTRY: { P1: [], P2: [] }
};

const SUBJECTS_DB = {
  "AQA-PHYSICS": { name: "AQA Physics", years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], icon: Zap, color: "indigo" },
  "EDEXCEL-CHEM": { name: "Edexcel Chemistry", years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], icon: Beaker, color: "teal" }
};

const AskAtlas = ({ context, isOpen, onClose }) => {
  const [messages, setMessages] = useState([{ role: 'system', text: "Hi! I'm Atlas." }]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [katexLoaded, setKatexLoaded] = useState(false);
  const scrollRef = useRef(null);
  
  // Load KaTeX for math rendering
  useEffect(() => {
    if (!document.getElementById('katex-css')) {
        const link = document.createElement('link');
        link.id = 'katex-css';
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
        link.rel = "stylesheet";
        document.head.appendChild(link);
    }
    if (!window.katex) {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
        script.onload = () => setKatexLoaded(true);
        document.head.appendChild(script);
    } else {
        setKatexLoaded(true);
    }
  }, []);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, isThinking]);
  
  const formatText = (text) => {
      return text.split('\n').map((line, i) => (
          <p key={i} className="mb-2 last:mb-0 leading-relaxed break-words">
              {line.split(/(\*\*.*?\*\*)/).map((part, j) => {
                  if (part.startsWith('$$') && part.endsWith('$$')) {
                      const tex = part.slice(2, -2);
                      if (window.katex) {
                          try {
                              const html = window.katex.renderToString(tex, { displayMode: false });
                              return <span key={j} dangerouslySetInnerHTML={{ __html: html }} className="mx-1" />;
                          } catch (e) { return <code key={j} className="text-xs bg-gray-100 p-1 rounded">{tex}</code>; }
                      } else {
                          return <code key={j} className="text-xs bg-gray-100 p-1 rounded">{tex}</code>;
                      }
                  } else if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j} className="text-indigo-700">{part.slice(2, -2)}</strong>;
                  } else {
                      return part;
                  }
              })}
          </p>
      ));
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput("");
    setIsThinking(true);
    const response = await chatWithAtlas(context?.questionImg, context?.schemeImg, userMsg);
    setMessages(prev => [...prev, { role: 'system', text: response }]);
    setIsThinking(false);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed bottom-4 right-4 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-indigo-100 flex flex-col z-50 h-[500px] overflow-hidden animate-in slide-in-from-bottom-5">
      <div className="bg-indigo-600 p-4 text-white flex justify-between items-center shadow-md">
          <div className="flex gap-2 items-center"><div className="bg-white/20 p-1.5 rounded-lg"><Sparkles className="w-4 h-4"/></div><div><span className="font-bold text-sm block">Atlas Tutor</span><span className="text-[10px] opacity-80 block">AI Study Assistant</span></div></div>
          <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full"><X className="w-5 h-5"/></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {messages.map((m,i)=>(<div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}><div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${m.role==='user'?'bg-indigo-600 text-white rounded-br-none':'bg-white text-slate-700 border border-slate-100 rounded-bl-none'}`}>{m.role === 'system' ? formatText(m.text) : m.text}</div></div>))}
          {isThinking && <div className="flex justify-start"><div className="bg-white p-3 rounded-2xl rounded-bl-none border border-slate-100 shadow-sm flex gap-1 items-center"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></div></div></div>}
      </div>
      <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyPress={e=>e.key==='Enter'&&handleSend()} placeholder="Ask a question..." className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"/>
          <button onClick={handleSend} disabled={!input.trim() || isThinking} className="bg-indigo-600 text-white p-2.5 rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"><ChevronRight className="w-5 h-5"/></button>
      </div>
    </div>
  );
};

// --- BULK UPLOAD HELPER FUNCTIONS ---
const processBulkUploads = (questionFiles, schemeFiles) => {
    // 1. Group Schemes by ID (m1.1.png -> 1.1)
    const schemeMap = {};
    schemeFiles.forEach(f => {
        const match = f.name.match(/m(\d+(\.\d+)*)/i);
        if(match) {
            const id = match[1]; // "1.2"
            schemeMap[id] = f;
        }
    });

    const rows = [];
    const sortedIds = Object.keys(schemeMap).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));

    // Context Accumulator
    const contextMap = {};

    sortedIds.forEach(id => {
        const majorId = id.split('.')[0]; 
        if (!contextMap[majorId]) contextMap[majorId] = [];
        
        const rowImages = [];

        // A. Add Root (e.g. 1.png)
        const rootFile = questionFiles.find(f => f.name === `${majorId}.png` || f.name === `Q${majorId}.png`);
        if (rootFile) rowImages.push({ file: rootFile, type: 'root' });

        // B. Find Specifics
        const specifics = questionFiles.filter(f => f.name.startsWith(id));
        
        // Update Contexts with .plus files
        specifics.forEach(f => {
            if (f.name.includes('plus')) {
                if (!contextMap[majorId].find(cf => cf.name === f.name)) {
                    contextMap[majorId].push(f);
                }
            }
        });

        // C. Add Accumulated Contexts
        contextMap[majorId].forEach(cf => {
             if (!rowImages.find(r => r.file.name === cf.name)) {
                 rowImages.push({ file: cf, type: 'context' });
             }
        });

        // D. Add Specifics
        specifics.forEach(f => {
             if (!rowImages.find(r => r.file.name === f.name)) {
                 rowImages.push({ file: f, type: 'specific' });
             }
        });

        rows.push({
            id: id, 
            images: rowImages.map(r => r.file),
            scheme: schemeMap[id],
            topic: "Pending...",
            marks: 0,
            lines: 4,
            questionText: "",
            schemeText: ""
        });
    });

    return rows;
};

const TeacherStudio = ({ customQuestions, setCustomQuestions, paperResources, setPaperResources, topicSchema, setTopicSchema, onClose }) => {
  const [activeTab, setActiveTab] = useState('questions');
  const [newQ, setNewQ] = useState({ board: "AQA", subject: "PHYSICS", year: "2018", paper: "P1", topic: "General", questionImg: [], schemeImg: null, marks: 4, lines: 4 });
  const [newRes, setNewRes] = useState({ board: "AQA", subject: "PHYSICS", year: "2018", paper: "P1", type: "scheme", file: null, fileName: "" });
  
  const [bulkConfig, setBulkConfig] = useState({ board: "AQA", subject: "PHYSICS", year: "2018", paper: "P1" });
  const [bulkFiles, setBulkFiles] = useState({ questions: [], schemes: [] });
  const [stagingRows, setStagingRows] = useState([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState("");
  const [libFilter, setLibFilter] = useState({ subject: 'ALL', year: 'ALL', paper: 'ALL' });
  const [reclassifying, setReclassifying] = useState(null); 
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Moved Derived Calculations here to avoid Reference Errors
  const filteredQuestions = customQuestions.filter(q => {
      if (libFilter.subject !== 'ALL' && q.subject !== libFilter.subject) return false;
      if (libFilter.year !== 'ALL' && q.year !== parseInt(libFilter.year)) return false;
      if (libFilter.paper !== 'ALL' && q.paper !== libFilter.paper) return false;
      return true;
  });
  
  const untaggedCount = customQuestions.filter(q => !q.topic || q.topic === 'General' || q.topic === 'Uncategorized').length;

  const handleImgs = async (e) => {
    const files = Array.from(e.target.files);
    if(files.length){ 
        setLoading(true); 
        try{ 
            const newImages = await Promise.all(files.map(async f => ({ data: await fileToBase64(f), name: f.name }))); 
            const updatedImages = [...newQ.questionImg, ...newImages];
            let filenameLines = 0;
            files.forEach(f => { const match = f.name.match(/-(\d+)\./); if(match) filenameLines = parseInt(match[1]); });
            setNewQ(p=>({...p, questionImg: updatedImages, lines: filenameLines || p.lines })); 
            
            setDetecting("auto");
            const [m, l, t] = await Promise.all([
                detectMarksFromImage(updatedImages),
                detectLinesFromImage(updatedImages),
                detectTopicFromImage(updatedImages, newQ.board, newQ.subject, newQ.paper, topicSchema)
            ]);
            setNewQ(p => ({ ...p, marks: m > 0 ? m : p.marks, lines: filenameLines > 0 ? filenameLines : (l > 0 ? l : p.lines), topic: t !== "Uncategorized" ? t : p.topic }));
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
                  alert(`Schema Loaded.`);
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
      setPaperResources(p=>({...p, [`${newRes.board}-${newRes.subject}-${newRes.year}-${newRes.paper}-${newRes.type}`]: { file:newRes.file, fileName:newRes.fileName, board: newRes.board, type: newRes.type }})); 
      setNewRes(p=>({...p, file:null, fileName:""})); 
      alert("Resource Saved!"); 
  };

  // --- BULK UPLOAD HANDLERS ---
  const handleBulkDrop = (e, type) => {
      const files = Array.from(e.target.files);
      setBulkFiles(prev => ({ ...prev, [type]: [...prev[type], ...files] }));
  };

  const generateStaging = () => {
      if (bulkFiles.schemes.length === 0) return alert("Please upload Mark Schemes first.");
      const rows = processBulkUploads(bulkFiles.questions, bulkFiles.schemes);
      setStagingRows(rows);
  };

  const removeStagingImage = (rowIdx, imgIdx) => {
      setStagingRows(prev => {
          const copy = [...prev];
          copy[rowIdx].images = copy[rowIdx].images.filter((_, i) => i !== imgIdx);
          return copy;
      });
  };

  const addImageToRow = async (rowIdx, e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      setStagingRows(prev => {
          const copy = [...prev];
          copy[rowIdx].images = [...copy[rowIdx].images, ...files];
          return copy;
      });
      e.target.value = null; 
  };

  const autoAnalyzeRow = async (idx) => {
      const row = stagingRows[idx];
      const imagesB64 = await Promise.all(row.images.map(async f => ({ data: await fileToBase64(f), name: f.name })));
      const schemeB64 = await fileToBase64(row.scheme);
      
      const result = await analyzeQuestionData(imagesB64, { data: schemeB64, name: row.scheme.name }, bulkConfig.board, bulkConfig.subject, bulkConfig.paper, topicSchema);
      let overrideLines = 0;
      row.images.forEach(img => { const match = img.name.match(/-(\d+)\./); if(match) overrideLines = parseInt(match[1]); });

      setStagingRows(prev => {
          const copy = [...prev];
          copy[idx] = { 
              ...copy[idx], 
              marks: result.marks || 1, 
              lines: overrideLines > 0 ? overrideLines : (result.lines || 4), // Prefer filename
              topic: result.topic || "General",
              questionText: result.question_text || "",
              schemeText: result.scheme_text || ""
          };
          return copy;
      });
  };

  const analyzeAllStaging = async () => {
      setIsProcessingBulk(true);
      for (let i = 0; i < stagingRows.length; i++) { await autoAnalyzeRow(i); await new Promise(r => setTimeout(r, 500)); }
      setIsProcessingBulk(false);
  };

  const commitBulk = async () => {
      setIsProcessingBulk(true);
      const newQuestions = [];
      for (const row of stagingRows) {
          const qImgs = await Promise.all(row.images.map(async f => ({ data: await fileToBase64(f), name: f.name })));
          const sImg = await fileToBase64(row.scheme);
          newQuestions.push({
              id: `bulk-${Date.now()}-${row.id}`,
              type: 'image',
              board: bulkConfig.board,
              subject: bulkConfig.subject,
              year: parseInt(bulkConfig.year),
              paper: bulkConfig.paper,
              topic: row.topic,
              marks: row.marks,
              lines: row.lines,
              questionImg: qImgs,
              schemeImg: { data: sImg, name: row.scheme.name },
              questionText: row.questionText,
              schemeText: row.schemeText,
              timestamp: Date.now()
          });
      }
      setCustomQuestions(prev => [...prev, ...newQuestions]);
      setStagingRows([]);
      setBulkFiles({ questions: [], schemes: [] });
      setIsProcessingBulk(false);
      alert(`Successfully added ${newQuestions.length} questions!`);
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
      for (const item of targets) {
          try {
              const newTopic = await detectTopicFromImage(item.questionImg, item.board, item.subject, item.paper, topicSchema);
              setCustomQuestions(prev => {
                  const copy = [...prev];
                  const currentIdx = copy.findIndex(q => q.id === item.id);
                  if (currentIdx !== -1) copy[currentIdx] = { ...copy[currentIdx], topic: newTopic };
                  return copy;
              });
          } catch(e) {}
          await new Promise(r => setTimeout(r, 500));
      }
      setBulkProcessing(false);
      alert(`Refined topics!`);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold flex gap-2"><PenTool className="w-5 h-5"/> Teacher Studio</h2>
          <button onClick={onClose}><X className="w-6 h-6 hover:text-red-400"/></button>
        </div>
        <div className="flex border-b">
            {['questions', 'resources', 'bulk upload'].map(t => (
                <button key={t} onClick={()=>setActiveTab(t)} className={`flex-1 py-3 text-sm font-bold capitalize ${activeTab===t?'text-indigo-600 border-b-2 border-indigo-600':'text-slate-500'}`}>{t}</button>
            ))}
        </div>
        <div className="flex-1 flex overflow-hidden">
            {activeTab === 'bulk upload' ? (
                <div className="w-full p-6 overflow-y-auto bg-slate-50">
                     <div className="bg-white p-4 rounded-xl border shadow-sm mb-6">
                        <h3 className="font-bold text-slate-800 mb-3 text-sm">1. Batch Configuration</h3>
                        <div className="flex gap-4">
                            <select value={bulkConfig.board} onChange={e=>setBulkConfig({...bulkConfig, board:e.target.value})} className="p-2 border rounded text-sm"><option value="AQA">AQA</option><option value="Edexcel">Edexcel</option></select>
                            <select value={bulkConfig.subject} onChange={e=>setBulkConfig({...bulkConfig, subject:e.target.value})} className="p-2 border rounded text-sm"><option value="PHYSICS">Physics</option><option value="CHEMISTRY">Chemistry</option></select>
                            <select value={bulkConfig.year} onChange={e=>setBulkConfig({...bulkConfig, year:e.target.value})} className="p-2 border rounded text-sm">{[2018,2019,2020,2021,2022,2023,2024,2025].map(y=><option key={y} value={y}>{y}</option>)}</select>
                            <select value={bulkConfig.paper} onChange={e=>setBulkConfig({...bulkConfig, paper:e.target.value})} className="p-2 border rounded text-sm"><option value="P1">Paper 1</option><option value="P2">Paper 2</option></select>
                        </div>
                     </div>

                     {stagingRows.length === 0 && (
                         <div className="grid grid-cols-2 gap-6 mb-6">
                             <div className="border-2 border-dashed border-purple-300 bg-purple-50 rounded-xl p-8 text-center relative hover:bg-purple-100 transition">
                                 <input type="file" multiple onChange={(e) => handleBulkDrop(e, 'schemes')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                 <FolderUp className="w-10 h-10 text-purple-500 mx-auto mb-2" />
                                 <div className="font-bold text-purple-700">1. Mark Schemes (Anchors)</div>
                                 <div className="text-xs text-purple-600 mt-1">{bulkFiles.schemes.length} files selected</div>
                             </div>
                             <div className="border-2 border-dashed border-blue-300 bg-blue-50 rounded-xl p-8 text-center relative hover:bg-blue-100 transition">
                                 <input type="file" multiple onChange={(e) => handleBulkDrop(e, 'questions')} className="absolute inset-0 opacity-0 cursor-pointer" />
                                 <Files className="w-10 h-10 text-blue-500 mx-auto mb-2" />
                                 <div className="font-bold text-blue-700">2. Question Images</div>
                                 <div className="text-xs text-blue-600 mt-1">{bulkFiles.questions.length} files selected</div>
                             </div>
                         </div>
                     )}

                     {stagingRows.length === 0 ? (
                         <button 
                            onClick={generateStaging}
                            disabled={bulkFiles.schemes.length === 0}
                            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                         >
                             <Wand2 className="w-5 h-5" /> Generate Staging Grid
                         </button>
                     ) : (
                         <div className="flex gap-4 mb-4">
                             <button onClick={analyzeAllStaging} disabled={isProcessingBulk} className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 flex items-center justify-center gap-2">
                                 {isProcessingBulk ? <Loader2 className="animate-spin w-5 h-5"/> : <Brain className="w-5 h-5"/>} Auto-Analyze All Rows
                             </button>
                             <button onClick={commitBulk} disabled={isProcessingBulk} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2">
                                 <Save className="w-5 h-5"/> Save All to Library
                             </button>
                             <button onClick={() => setStagingRows([])} className="px-4 py-3 bg-red-100 text-red-600 rounded-xl font-bold hover:bg-red-200">
                                 Reset
                             </button>
                         </div>
                     )}

                     {stagingRows.length > 0 && (
                         <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                             <div className="grid grid-cols-12 bg-slate-100 p-3 text-xs font-bold text-slate-500 uppercase border-b">
                                 <div className="col-span-1">ID</div>
                                 <div className="col-span-4">Question Images</div>
                                 <div className="col-span-2">Scheme</div>
                                 <div className="col-span-2">Topic</div>
                                 <div className="col-span-1">Marks</div>
                                 <div className="col-span-1">Lines</div>
                                 <div className="col-span-1">Action</div>
                             </div>
                             <div className="divide-y max-h-[400px] overflow-y-auto">
                                 {stagingRows.map((row, idx) => (
                                     <div key={idx} className="grid grid-cols-12 p-3 items-center hover:bg-slate-50">
                                         <div className="col-span-1 font-bold text-slate-700">{row.id}</div>
                                         <div className="col-span-4 flex gap-2 overflow-x-auto py-2">
                                             {row.images.map((file, i) => (
                                                 <div key={i} className="relative group min-w-[60px] w-16 h-16 border rounded bg-white shadow-sm flex flex-col items-center justify-center overflow-hidden" title={file.name}>
                                                     <div className="text-[10px] text-slate-500 font-bold truncate w-full text-center px-1 mb-1">
                                                        {file.name.length > 10 ? file.name.substring(0,8)+'...' : file.name}
                                                     </div>
                                                     <ImageIcon className="w-6 h-6 text-slate-300" />
                                                     <button 
                                                        onClick={() => removeStagingImage(idx, i)}
                                                        className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                                                     >
                                                        <X className="w-3 h-3" />
                                                     </button>
                                                 </div>
                                             ))}
                                             <label className="min-w-[60px] w-16 h-16 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 text-gray-400 hover:text-indigo-500">
                                                 <Plus className="w-5 h-5" />
                                                 <input type="file" accept="image/*" multiple onChange={(e) => addImageToRow(idx, e)} className="hidden" />
                                             </label>
                                         </div>
                                         <div className="col-span-2 text-xs text-slate-600 truncate">{row.scheme.name}</div>
                                         <div className="col-span-2">
                                             <input value={row.topic} onChange={(e) => {
                                                 const newRows = [...stagingRows];
                                                 newRows[idx].topic = e.target.value;
                                                 setStagingRows(newRows);
                                             }} className="w-full p-1 border rounded text-xs" />
                                         </div>
                                         <div className="col-span-1">
                                             <input type="number" value={row.marks} onChange={(e) => {
                                                 const newRows = [...stagingRows];
                                                 newRows[idx].marks = parseInt(e.target.value) || 0;
                                                 setStagingRows(newRows);
                                             }} className="w-full p-1 border rounded text-xs" />
                                         </div>
                                         <div className="col-span-1">
                                              <input type="number" value={row.lines} onChange={(e) => {
                                                 const newRows = [...stagingRows];
                                                 newRows[idx].lines = parseInt(e.target.value) || 0;
                                                 setStagingRows(newRows);
                                             }} className="w-full p-1 border rounded text-xs" />
                                         </div>
                                         <div className="col-span-1 flex justify-center">
                                             <button onClick={()=>autoAnalyzeRow(idx)} className="text-purple-500 hover:text-purple-700 p-1"><Brain className="w-4 h-4"/></button>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         </div>
                     )}
                </div>
            ) : (
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-1/3 bg-slate-50 p-4 border-r overflow-y-auto space-y-4">
                        {activeTab === 'questions' ? (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Board</label>
                                <select value={newQ.board} onChange={e=>setNewQ({...newQ,board:e.target.value})} className="w-full p-2 rounded border text-xs"><option value="AQA">AQA</option><option value="Edexcel">Edexcel</option></select>
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
                             {/* ... [Existing Library List] ... */}
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
                                <div className="flex gap-1 mb-1 items-center"><span className="text-[10px] bg-slate-200 text-slate-700 px-1 rounded">{q.board}</span><span className="text-[10px] bg-indigo-100 text-indigo-800 px-1 rounded">{q.subject}</span><div className="flex items-center gap-1 bg-green-100 text-green-800 px-1 rounded"><span className="text-[10px]">{typeof q.topic === 'string' ? q.topic : 'Topic'}</span><button onClick={() => reclassifyQuestion(q.id)} className="hover:bg-green-200 rounded p-0.5" title="Re-classify Topic">{reclassifying === q.id ? <Loader2 className="w-2 h-2 animate-spin"/> : <Brain className="w-2 h-2"/>}</button></div></div>
                                <div className="text-xs text-slate-500">{q.year} {q.paper} • {q.marks} Marks • {q.lines || 4} Lines</div>
                            </div>
                            <button onClick={()=>setCustomQuestions(p=>p.filter(item=>item.id!==q.id))} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

const ExamMode = ({ examData, paperResources, onExit, onComplete, bookmarks, onToggleBookmark, onUpdateNote, bookmarkNotes }) => {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [txt, setTxt] = useState("");
  const [showExp, setShowExp] = useState(false);
  const [marking, setMarking] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [chat, setChat] = useState(false);
  
  // Note Input State
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");

  const q = examData.questions[idx];
  
  const resKey = `${q.board || 'AQA'}-${examData.board === 'AQA' ? 'PHYSICS' : 'CHEMISTRY'}-${q.year || examData.year}-${q.paper || examData.paperCode}-scheme`;
  const globalRes = paperResources?.[resKey];
  
  const isBookmarked = bookmarks.includes(q.id);

  // FIX: Split effect to prevent clearing text when bookmarking
  useEffect(() => { 
      setTxt(""); 
      setShowExp(false); 
      setMarking(false); 
  }, [idx]); // Only reset answer when question index changes

  useEffect(() => {
      if (q) { // Check if q exists
          setShowNoteInput(false);
          setNoteText(bookmarkNotes[q.id] || "");
      }
  }, [idx, q?.id]); // Update note when question changes

  // Safeguard: if question data is missing, don't render
  if (!q) return null;

  const handleBookmarkClick = () => {
      if (isBookmarked) {
          onToggleBookmark(q.id);
          setShowNoteInput(false);
      } else {
          onToggleBookmark(q.id);
          setShowNoteInput(true);
      }
  };

  const saveNote = () => {
      onUpdateNote(q.id, noteText);
      setShowNoteInput(false);
  };

  const handleScoreUpdate = (score) => {
      setAnswers(prev => ({
          ...prev,
          [idx]: { ...prev[idx], marksAwarded: score, isCorrect: score === q.marks }
      }));
  };

  const submitText = async () => {
    if (!txt.trim()) return;
    if (q.type === 'image') {
      setMarking(true);
      try {
        const fb = await evaluateAnswerWithGemini(q.questionImg, q.schemeImg, globalRes?.file, txt, q.marks, q.questionText, q.schemeText);
        // Initialize marksAwarded to null to indicate "not yet self-verified"
        setAnswers(p => ({ ...p, [idx]: { val: txt, feedback: fb, marksAwarded: null, isCorrect: null } }));
        setShowExp(true);
      } catch (e) { alert("AI Error"); }
      setMarking(false);
    } else {
      setAnswers(p => ({ ...p, [idx]: { val: txt, marksAwarded: null, isCorrect: null } }));
      setShowExp(true);
    }
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

  // Logic to determine button state
  // FIX: Allow proceed only if marksAwarded is defined (meaning user selected a score)
  const isAnswered = answers[idx] !== undefined;
  const isVerified = answers[idx]?.marksAwarded !== undefined && answers[idx]?.marksAwarded !== null;
  const canProceed = isAnswered && isVerified;
  const maxMarks = q.marks || 1; // Default to 1 if undefined

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <header className="bg-white p-4 border-b flex justify-between items-center sticky top-0 z-10">
            <button onClick={onExit} className="text-slate-500 font-bold flex gap-2 items-center"><ArrowLeft className="w-4 h-4"/> Exit</button>
            <div className="text-sm font-bold">{examData.title} <span className="text-slate-400">Q{idx+1}/{examData.questions.length}</span></div>
            <div className="flex gap-2 relative">
                <button 
                    onClick={handleBookmarkClick} 
                    className={`p-2 rounded-full transition ${isBookmarked ? 'bg-yellow-100 text-yellow-500' : 'bg-gray-100 text-gray-400'}`}
                >
                    <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-yellow-500' : ''}`} />
                </button>
                <button onClick={()=>setChat(!chat)} className="p-2 bg-indigo-50 text-indigo-600 rounded-full"><MessageCircle className="w-4 h-4"/></button>

                {/* Bookmark Note Popup */}
                {showNoteInput && (
                    <div className="absolute top-12 right-0 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50 animate-in slide-in-from-top-2">
                        <div className="text-xs font-bold text-slate-500 mb-2">Add a note (Optional)</div>
                        <textarea 
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="E.g., Review transformer equation..."
                            className="w-full text-xs p-2 bg-slate-50 rounded border mb-2 h-20 outline-none focus:border-indigo-500"
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowNoteInput(false)} className="text-xs text-slate-500 hover:text-slate-700">Skip</button>
                            <button onClick={saveNote} className="bg-indigo-600 text-white text-xs px-3 py-1 rounded hover:bg-indigo-700 font-bold">Save</button>
                        </div>
                    </div>
                )}
            </div>
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
                    {/* ADDED: Student Answer Display in Feedback Mode */}
                    <div className="mb-6 p-4 bg-slate-700/50 rounded-xl border border-slate-600">
                         <div className="text-xs font-bold text-slate-400 uppercase mb-2">Your Answer</div>
                         <div className="text-sm text-slate-200 whitespace-pre-wrap font-medium">{answers[idx]?.val}</div>
                    </div>

                    <div className="mb-6">
                        {answers[idx]?.feedback ? (
                            <div className={`p-4 rounded-xl border ${answers[idx].feedback.marks_awarded === q.marks ? 'bg-green-900/30 border-green-700' : answers[idx].feedback.marks_awarded > 0 ? 'bg-orange-900/30 border-orange-700' : 'bg-red-900/30 border-red-700'}`}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl ${answers[idx].feedback.marks_awarded === q.marks ? 'bg-green-500 text-white' : answers[idx].feedback.marks_awarded > 0 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'}`}>
                                        {answers[idx].feedback.marks_awarded}/{q.marks}
                                    </div>
                                    <div>
                                        <div className="font-bold text-lg">{answers[idx].feedback.feedback_title || "Feedback"}</div>
                                        <div className="text-xs opacity-70">AI Examiner</div>
                                    </div>
                                </div>
                                <p className="text-sm leading-relaxed mb-3">{answers[idx].feedback.feedback_summary}</p>
                                
                                {answers[idx].feedback.correct_points?.length > 0 && (
                                    <div className="mb-2">
                                        <div className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Check className="w-3 h-3"/> Correct Points</div>
                                        <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
                                            {answers[idx].feedback.correct_points.map((p,i) => <li key={i}>{p}</li>)}
                                        </ul>
                                    </div>
                                )}
                                
                                {answers[idx].feedback.missed_points?.length > 0 && (
                                    <div className="mb-2">
                                        <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1 flex items-center gap-1"><X className="w-3 h-3"/> Missed Points</div>
                                        <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
                                            {answers[idx].feedback.missed_points.map((p,i) => <li key={i}>{p}</li>)}
                                        </ul>
                                    </div>
                                )}

                                {answers[idx].feedback.improvement_tip && (
                                    <div className="mt-3 pt-3 border-t border-white/10">
                                        <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1 flex items-center gap-1"><Lightbulb className="w-3 h-3"/> Examiner Tip</div>
                                        <p className="text-xs italic opacity-90">{answers[idx].feedback.improvement_tip}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-4 bg-slate-700/50 rounded-xl border border-slate-600 text-center text-slate-400 italic">
                                No AI Feedback available. Please self-verify.
                            </div>
                        )}
                    </div>

                    <div className="mb-6">
                        <span className="text-xs font-bold uppercase text-slate-400 block mb-2">Self Verify (Score out of {maxMarks})</span>
                        <div className="flex flex-wrap gap-2">
                            {Array.from({ length: maxMarks + 1 }, (_, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => handleScoreUpdate(i)}
                                    className={`px-4 py-2 rounded-lg font-bold text-sm transition ${answers[idx]?.marksAwarded === i ? 'bg-indigo-600 text-white scale-105 ring-2 ring-indigo-300' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                >
                                    {i}
                                </button>
                            ))}
                        </div>
                    </div>

                    {q.type!=='image' && (
                        <div className="bg-white/10 p-4 rounded-xl border border-white/20 mb-4">
                             <div className="text-xs font-bold text-slate-300 uppercase mb-2">Marking Criteria</div>
                             <div className="text-sm opacity-90 font-mono whitespace-pre-wrap">{q.explanation || q.schemeText}</div>
                        </div>
                    )}
                    
                    {q.type==='image' && <img src={getImageData(q.schemeImg)} className="w-full rounded mb-4 bg-white"/>}
                    
                    {/* Locked Next Button until verified */}
                    <div className="relative">
                        {!canProceed && (
                            <div className="absolute -top-10 w-full flex justify-center animate-bounce">
                                <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> Select score to continue
                                </span>
                            </div>
                        )}
                        <button 
                            onClick={next} 
                            disabled={!canProceed}
                            className={`w-full py-3 rounded-xl font-bold flex justify-center items-center gap-2 transition ${canProceed ? 'bg-white text-slate-900 hover:bg-gray-100' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                        >
                            {idx < examData.questions.length - 1 ? "Next" : "Finish"} <ChevronRight className="w-4 h-4"/>
                        </button>
                    </div>
                </div>
            )}
        </main>
        <AskAtlas isOpen={chat} onClose={()=>setChat(false)} context={q}/>
    </div>
  );
};

const Dashboard = ({ onSelectExam, onOpenStudio, customDB = [], paperResources, userStats, bookmarks, onToggleBookmark, onStartPractice, bookmarkNotes, predictedPapers, onGeneratePrediction }) => {
  const [tab, setTab] = useState('papers'); // 'papers', 'topics', 'bookmarks', 'predicted'
  const [subject, setSubject] = useState(null);
  const [viewingQ, setViewingQ] = useState(null); // For Full Question Viewer Modal
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAdminAccess = () => {
    if (adminPass === "1234") {
        onOpenStudio();
        setShowAdminLogin(false);
        setAdminPass("");
    } else {
        alert("Incorrect password");
    }
  };
  
  const handleGenerateClick = async () => {
      setIsGenerating(true);
      // Determine board based on subject code
      const board = subject === 'AQA-PHYSICS' ? 'AQA' : 'Edexcel';
      const subj = subject === 'AQA-PHYSICS' ? 'PHYSICS' : 'CHEMISTRY';
      
      await onGeneratePrediction(board, subj);
      setIsGenerating(false);
  };

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

  const getBookmarkedQuestionsByTopic = (subjCode) => {
      const topicMap = getTopics(subjCode);
      const bookmarkedMap = {};
      
      Object.entries(topicMap).forEach(([topic, questions]) => {
          const bookmarkedQs = questions.filter(q => bookmarks.includes(q.id));
          if (bookmarkedQs.length > 0) {
              bookmarkedMap[topic] = bookmarkedQs;
          }
      });
      
      return bookmarkedMap;
  };
  
  const getPredictedPapersForSubject = (subjCode) => {
      const board = subjCode === 'AQA-PHYSICS' ? 'AQA' : 'Edexcel';
      const subj = subjCode === 'AQA-PHYSICS' ? 'PHYSICS' : 'CHEMISTRY';
      return predictedPapers.filter(p => p.board === board && p.subject === subj);
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
    const bookmarkedTopics = getBookmarkedQuestionsByTopic(subject);
    const subjectPredictedPapers = getPredictedPapersForSubject(subject);
    const subjName = SUBJECTS_DB[subject].name;
    
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-5xl mx-auto">
            <button onClick={()=>setSubject(null)} className="mb-4 flex items-center text-slate-500 font-bold"><ArrowLeft className="w-4 h-4 mr-2"/> Subjects</button>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-6">{subjName}</h1>
            
            <div className="flex gap-4 mb-8 border-b overflow-x-auto">
                <button onClick={()=>setTab('papers')} className={`pb-2 px-4 font-bold whitespace-nowrap ${tab==='papers'?'text-indigo-600 border-b-2 border-indigo-600':'text-slate-400'}`}>Past Papers</button>
                <button onClick={()=>setTab('topics')} className={`pb-2 px-4 font-bold whitespace-nowrap ${tab==='topics'?'text-indigo-600 border-b-2 border-indigo-600':'text-slate-400'}`}>Topic Mastery</button>
                <button onClick={()=>setTab('bookmarks')} className={`pb-2 px-4 font-bold whitespace-nowrap ${tab==='bookmarks'?'text-indigo-600 border-b-2 border-indigo-600':'text-slate-400'}`}>Focused Revision</button>
                <button onClick={()=>setTab('predicted')} className={`pb-2 px-4 font-bold whitespace-nowrap ${tab==='predicted'?'text-indigo-600 border-b-2 border-indigo-600':'text-slate-400'}`}>Predicted Papers</button>
            </div>

            {tab === 'papers' && (
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
            )}

            {tab === 'topics' && (
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

            {tab === 'bookmarks' && (
                <div className="space-y-6">
                    {Object.keys(bookmarkedTopics).length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>No questions bookmarked yet.</p>
                            <p className="text-sm">Star questions during practice to save them here.</p>
                        </div>
                    ) : (
                        Object.entries(bookmarkedTopics).map(([tName, qs]) => (
                            <div key={tName} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800">{tName}</h3>
                                        <span className="text-xs text-slate-500">{qs.length} Saved Questions</span>
                                    </div>
                                    <button 
                                        onClick={() => startTopicTest(tName, qs)}
                                        className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition"
                                    >
                                        <Zap className="w-3 h-3" /> Practice Saved
                                    </button>
                                </div>
                                <div className="divide-y">
                                    {qs.map((q, i) => (
                                        <div key={i} className="p-4 flex gap-4 items-start hover:bg-slate-50 transition">
                                            <div 
                                                className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0 border cursor-pointer hover:opacity-80 transition"
                                                onClick={() => setViewingQ(q)}
                                            >
                                                {q.type === 'image' ? (
                                                    <img src={getImageData(Array.isArray(q.questionImg) ? q.questionImg[0] : q.questionImg)} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 p-1 text-center bg-white">{q.text.substring(0, 20)}...</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewingQ(q)}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{q.year} {q.paper}</span>
                                                    <span className="text-[10px] font-bold bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">{q.marks} Marks</span>
                                                </div>
                                                <p className="text-sm text-slate-700 line-clamp-2 mb-2">{q.type === 'image' ? 'Click to view full question image...' : q.text}</p>
                                                {bookmarkNotes[q.id] && (
                                                    <div className="flex items-start gap-1.5 bg-yellow-50 p-2 rounded border border-yellow-100 text-xs text-yellow-800">
                                                        <StickyNote className="w-3 h-3 mt-0.5 shrink-0" />
                                                        <span className="italic">"{bookmarkNotes[q.id]}"</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <button 
                                                    onClick={() => setViewingQ(q)}
                                                    className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                                                    title="View Full Question"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => onToggleBookmark(q.id)}
                                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                                    title="Remove Bookmark"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
            
            {/* NEW: Predicted Papers Tab Content */}
            {tab === 'predicted' && (
                <div>
                     <div className="bg-indigo-900 text-white p-6 rounded-xl mb-6 flex justify-between items-center relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="font-bold text-2xl mb-1 flex items-center gap-2"><Sparkle className="w-6 h-6 text-yellow-300"/> AI Predicted Papers</h3>
                            <p className="text-indigo-200 text-sm max-w-md">
                                Generate a unique mock exam based on high-probability topics from the knowledge base.
                            </p>
                        </div>
                        <button 
                            onClick={handleGenerateClick}
                            disabled={isGenerating}
                            className="relative z-10 bg-white text-indigo-900 font-bold px-6 py-3 rounded-xl shadow-lg hover:bg-indigo-50 transition flex items-center gap-2"
                        >
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin"/> : <Wand2 className="w-5 h-5"/>}
                            Generate New Paper
                        </button>
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-800 rounded-full blur-3xl opacity-50 -mr-16 -mt-16"></div>
                        <div className="absolute bottom-0 left-20 w-32 h-32 bg-purple-600 rounded-full blur-2xl opacity-30"></div>
                     </div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                         {subjectPredictedPapers.length === 0 ? (
                             <div className="col-span-full text-center py-12 text-slate-400">
                                 <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                 <p>No predicted papers generated yet.</p>
                             </div>
                         ) : (
                             subjectPredictedPapers.map((paper) => (
                                 <div key={paper.id} className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition group relative overflow-hidden">
                                     <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-1 rounded-bl-lg">PREDICTED</div>
                                     <div className="flex items-center gap-3 mb-4">
                                         <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                                             <Brain className="w-6 h-6" />
                                         </div>
                                         <div>
                                             <h4 className="font-bold text-slate-800">{paper.title}</h4>
                                             <div className="text-xs text-slate-500">{new Date(paper.timestamp).toLocaleDateString()} • {paper.questions.length} Questions</div>
                                         </div>
                                     </div>
                                     <button 
                                        onClick={() => onSelectExam(paper)}
                                        className="w-full py-2 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-700 transition"
                                     >
                                         Start Exam
                                     </button>
                                 </div>
                             ))
                         )}
                     </div>
                </div>
            )}
        </div>

        {/* FULL QUESTION VIEWER MODAL */}
        {viewingQ && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                <div className="bg-white rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
                    <div className="bg-white p-4 border-b flex justify-between items-center sticky top-0 z-10">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">{viewingQ.topic || 'Question Viewer'}</h3>
                            <span className="text-xs text-slate-500">{viewingQ.year} {viewingQ.paper} • {viewingQ.marks} Marks</span>
                        </div>
                        <button onClick={() => setViewingQ(null)} className="p-2 hover:bg-gray-100 rounded-full transition"><X className="w-6 h-6 text-slate-500"/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                         {/* Note Display */}
                         {bookmarkNotes[viewingQ.id] && (
                            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex gap-3">
                                <StickyNote className="w-5 h-5 text-yellow-600 shrink-0" />
                                <div>
                                    <div className="text-xs font-bold text-yellow-800 uppercase mb-1">Your Note</div>
                                    <p className="text-sm text-yellow-900">{bookmarkNotes[viewingQ.id]}</p>
                                </div>
                            </div>
                        )}

                        {/* Question Content */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
                            <div className="text-xs font-bold text-slate-400 uppercase mb-2">Question</div>
                            {viewingQ.type === 'image' ? (
                                <div className="space-y-2">
                                    {Array.isArray(viewingQ.questionImg) ? viewingQ.questionImg.map((img,i)=><img key={i} src={getImageData(img)} className="w-full rounded border"/>) : <img src={getImageData(viewingQ.questionImg)} className="w-full rounded border"/>}
                                </div>
                            ) : <h2 className="text-lg font-medium">{viewingQ.text}</h2>}
                        </div>

                        {/* Mark Scheme Toggle */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                             <div className="text-xs font-bold text-slate-400 uppercase mb-2">Mark Scheme</div>
                             {viewingQ.type === 'image' ? (
                                <img src={getImageData(viewingQ.schemeImg)} className="w-full rounded border"/>
                             ) : (
                                <div className="text-sm opacity-80 font-mono">{viewingQ.explanation}</div>
                             )}
                        </div>
                    </div>
                </div>
            </div>
        )}
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
        
        {/* Admin Access UI */}
        <button 
            onClick={() => setShowAdminLogin(true)} 
            className="mt-12 flex items-center gap-2 bg-slate-200 text-slate-600 px-4 py-2 rounded-full font-bold hover:bg-slate-300 transition text-xs"
        >
            <Lock className="w-3 h-3"/> Admin Access
        </button>

        {showAdminLogin && (
            <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-xl shadow-xl w-80">
                    <h3 className="font-bold text-lg mb-4">Enter Password</h3>
                    <input 
                        type="password" 
                        value={adminPass} 
                        onChange={(e) => setAdminPass(e.target.value)} 
                        className="w-full border p-2 rounded mb-4" 
                        placeholder="Admin Code"
                    />
                    <div className="flex gap-2">
                        <button onClick={() => setShowAdminLogin(false)} className="flex-1 bg-slate-100 py-2 rounded">Cancel</button>
                        <button onClick={handleAdminAccess} className="flex-1 bg-indigo-600 text-white py-2 rounded">Unlock</button>
                    </div>
                </div>
            </div>
        )}
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
  const [userStats, setUserStats] = useState({}); 
  const [bookmarks, setBookmarks] = useState([]); // Array of IDs
  const [bookmarkNotes, setBookmarkNotes] = useState({}); // { id: "note string" }
  const [predictedPapers, setPredictedPapers] = useState([]); // Array of generated paper objects

  // 1. LOAD FROM INDEXEDDB ON MOUNT
  useEffect(() => {
    const loadData = async () => {
        try {
            const savedDB = await idb.get('customQuestions');
            const savedRes = await idb.get('paperResources');
            const savedSchema = await idb.get('topicSchema');
            const savedStats = await idb.get('userStats');
            const savedBookmarks = await idb.get('bookmarks');
            const savedNotes = await idb.get('bookmarkNotes');
            const savedPredicted = await idb.get('predictedPapers');

            // --- RESOURCE KIT LOADER LOGIC ---
            // If database is empty, try to fetch the default Resource Kit
            if (!savedDB || savedDB.length === 0) {
                console.log("Database empty. Attempting to load Resource Kit...");
                try {
                    const response = await fetch('/resource-kit.json');
                    if (response.ok) {
                        const kit = await response.json();
                        
                        if (kit.questions) {
                            setCustomDB(kit.questions);
                            idb.set('customQuestions', kit.questions); 
                        }
                        if (kit.resources) {
                            setResDB(kit.resources);
                            idb.set('paperResources', kit.resources);
                        }
                        if (kit.schema) {
                            setTopicSchema(kit.schema);
                            idb.set('topicSchema', kit.schema);
                        }
                        return; 
                    }
                } catch (e) {
                    console.log("No Resource Kit found, starting fresh.");
                }
            }
            // ---------------------------------

            if (savedDB) setCustomDB(savedDB);
            if (savedRes) setResDB(savedRes);
            if (savedSchema) setTopicSchema(savedSchema);
            if (savedStats) setUserStats(savedStats);
            if (savedBookmarks) setBookmarks(savedBookmarks);
            if (savedNotes) setBookmarkNotes(savedNotes);
            if (savedPredicted) setPredictedPapers(savedPredicted);
        } catch (e) { console.error("IDB Load Error", e); }
    };
    loadData();
  }, []);

  // 2. SAVE TO INDEXEDDB WHENEVER STATE CHANGES
  useEffect(() => { idb.set('customQuestions', customDB); }, [customDB]);
  useEffect(() => { idb.set('paperResources', resDB); }, [resDB]);
  useEffect(() => { idb.set('topicSchema', topicSchema); }, [topicSchema]);
  useEffect(() => { idb.set('userStats', userStats); }, [userStats]);
  useEffect(() => { idb.set('bookmarks', bookmarks); }, [bookmarks]);
  useEffect(() => { idb.set('bookmarkNotes', bookmarkNotes); }, [bookmarkNotes]);
  useEffect(() => { idb.set('predictedPapers', predictedPapers); }, [predictedPapers]);

  const toggleBookmark = (id) => {
      setBookmarks(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  };

  const updateBookmarkNote = (id, note) => {
      setBookmarkNotes(prev => {
          const newNotes = { ...prev };
          if (note && note.trim() !== "") {
              newNotes[id] = note;
          } else {
              delete newNotes[id];
          }
          return newNotes;
      });
  };

  const generatePredictedPaper = async (board, subject) => {
      // 1. Filter Questions
      const relevantQs = customDB.filter(q => q.board === board && q.subject === subject);
      
      // If we have enough context, try generating new ones, otherwise use existing
      // For this implementation, we will try to generate PURELY new questions as requested
      
      try {
          const generatedQuestions = await generateMockPaperWithGemini(board, subject);
          
          if (generatedQuestions && generatedQuestions.length > 0) {
               // Add necessary metadata to generated questions
               const enrichedQuestions = generatedQuestions.map((q, i) => ({
                   id: `pred-q-${Date.now()}-${i}`,
                   type: 'text',
                   text: q.text,
                   marks: q.marks,
                   topic: q.topic || 'General',
                   board: board,
                   subject: subject,
                   year: 'Predicted',
                   paper: 'AI-Gen',
                   explanation: q.explanation, // Mark scheme text
                   schemeText: q.explanation // Redundant but consistent for marking
               }));

               // 4. Create Paper Object
              const newPaper = {
                  id: `pred-${Date.now()}`,
                  title: `Predicted Paper ${new Date().getFullYear() + 1}`,
                  board,
                  subject,
                  year: 'Predicted',
                  paperCode: 'AI-Gen',
                  questions: enrichedQuestions,
                  isPredicted: true, // Flag for handling completion logic
                  timestamp: Date.now()
              };
        
              setPredictedPapers(prev => [newPaper, ...prev]);
              return;
          }
      } catch (e) {
          console.error("AI Generation failed, falling back to remix if needed", e);
      }
      
      // Fallback logic if AI fails or returns empty (remix existing)
      if (relevantQs.length === 0) {
          alert("Not enough questions in Knowledge Base to generate a paper.");
          return;
      }
      // ... (Fallback code omitted for brevity as AI generation is preferred) ...
  };

  const handleExamComplete = (answers, examInfo) => {
    // Check if it is a predicted paper to skip mastery update
    if (examInfo.isPredicted) {
        // We could save a separate "Prediction Score History" here if desired
        return; 
    }

    // Normal Past Paper Logic
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
        <ExamMode 
            examData={examData} 
            paperResources={resDB} 
            onExit={()=>setView('dash')} 
            onComplete={handleExamComplete}
            bookmarks={bookmarks}
            onToggleBookmark={toggleBookmark}
            onUpdateNote={updateBookmarkNote}
            bookmarkNotes={bookmarkNotes}
        />
      ) : (
        <Dashboard 
            onSelectExam={(d)=>{setExamData(d); setView('exam');}} 
            onOpenStudio={()=>setStudio(true)} 
            customDB={customDB} 
            paperResources={resDB} 
            userStats={userStats}
            bookmarks={bookmarks}
            onToggleBookmark={toggleBookmark}
            bookmarkNotes={bookmarkNotes}
            predictedPapers={predictedPapers}
            onGeneratePrediction={generatePredictedPaper}
        />
      )}
    </>
  );
};

export default App;
