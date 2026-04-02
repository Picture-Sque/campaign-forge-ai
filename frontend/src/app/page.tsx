"use client";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

type InputMode = 'text' | 'file' | 'url';
type ChatLog = { agent: string; message: string };
type ActiveAgent = 'None' | 'Researcher' | 'Copywriter' | 'Editor';

export default function AgentRoom() {
  const [mode, setMode] = useState<InputMode>('text');
  const [sourceText, setSourceText] = useState("Cymonic DataShield v2.0 Release Notes. Core Features: End-to-end AES-256 encryption, automated compliance reporting, and real-time threat detection. Technical Specs: Integrates with AWS, Azure, and GCP via REST API. Max latency: 50ms. Target Audience: Enterprise CISOs and IT Security Managers.");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [finalState, setFinalState] = useState<any>(null);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent>('None');
  const [previewMode, setPreviewMode] = useState<'Desktop' | 'Mobile'>('Desktop');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs]);

  const readFile = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setSourceText(e.target?.result as string || "");
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setFinalState(null);
    setActiveAgent('None');
    setChatLogs([{ agent: 'User', message: 'Initiating campaign pipeline...' }]);

    const payload: Record<string, string> = {};
    if (mode === 'url') {
      payload.source_url = sourceUrl;
    } else {
      payload.source_text = sourceText;
    }

    try {
      const response = await fetch("http://localhost:8000/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || "";
          for (const part of parts) {
            if (part.startsWith('data: ')) {
              try {
                const data = JSON.parse(part.substring(6));
                if (data.agent === 'System' && data.message === 'Done') {
                  setFinalState(data.final_state);
                  setActiveAgent('None');
                } else {
                  setChatLogs(prev => [...prev, data]);
                  if (['Researcher', 'Copywriter', 'Editor'].includes(data.agent)) {
                     setActiveAgent(data.agent as ActiveAgent);
                  }
                }
              } catch (e) { console.error("Parse error", e); }
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
      setChatLogs(prev => [...prev, { agent: 'System', message: 'Error connecting to backend.' }]);
      setActiveAgent('None');
    }
    setLoading(false);
  };

  const handleCopyClipboard = () => {
    if (!finalState?.drafts) return;
    const content = `[SEO BLOG POST]\n${finalState.drafts.blog}\n\n[SOCIAL THREAD]\n${finalState.drafts.social_thread}\n\n[EMAIL TEASER]\n${finalState.drafts.email_teaser}`;
    navigator.clipboard.writeText(content);
    alert("Campaign copied to clipboard!");
  };

  const handleDownloadZip = async () => {
    if (!finalState?.drafts) return;
    const zip = new JSZip();
    zip.file("blog.txt", finalState.drafts.blog);
    zip.file("social_thread.txt", finalState.drafts.social_thread);
    zip.file("email_teaser.txt", finalState.drafts.email_teaser);
    
    if (finalState.fact_sheet) {
       zip.file("facts.json", JSON.stringify(finalState.fact_sheet, null, 2));
    }
    
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "CampaignForge_Assets.zip");
  };

  const tabClass = (m: InputMode) =>
    `px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${mode === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans flex flex-col md:flex-row">
      {/* Left Panel */}
      <div className="w-full md:w-1/3 border-r border-gray-800 p-8 flex flex-col bg-gray-900 shadow-2xl z-20">
        <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 mb-1">CampaignForge</h1>
        <p className="text-gray-500 mb-6 text-sm tracking-wide">Autonomous Content Factory</p>

        {/* Input Mode Tabs */}
        <div className="flex gap-2 mb-5 bg-gray-800/50 p-1.5 rounded-xl">
          <button className={tabClass('text')} onClick={() => setMode('text')}>Text</button>
          <button className={tabClass('file')} onClick={() => setMode('file')}>File</button>
          <button className={tabClass('url')} onClick={() => setMode('url')}>URL</button>
        </div>

        {/* Text Mode */}
        {mode === 'text' && (
          <>
            <label className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest">Raw Source Document</label>
            <textarea
              className="flex-grow w-full bg-gray-950/80 border border-gray-800 rounded-xl p-5 text-gray-300 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500 transition-all resize-none shadow-inner text-sm"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          </>
        )}

        {/* File Mode */}
        {mode === 'file' && (
          <div
            className={`flex-grow flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-600 bg-gray-950/40'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
            <div className="text-4xl mb-4">📄</div>
            {fileName ? (
              <>
                <p className="text-indigo-400 font-bold text-sm">{fileName}</p>
                <p className="text-gray-500 text-xs mt-1">File loaded — ready to deploy</p>
              </>
            ) : (
              <>
                <p className="text-gray-400 font-semibold text-sm">Drop a .txt or .md file here</p>
                <p className="text-gray-600 text-xs mt-1">or click to browse</p>
              </>
            )}
          </div>
        )}

        {/* URL Mode */}
        {mode === 'url' && (
          <div className="flex flex-col flex-grow">
            <label className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest">Webpage URL</label>
            <input
              type="url"
              placeholder="https://example.com/product-page"
              className="w-full bg-gray-950/80 border border-gray-800 rounded-xl p-4 text-gray-300 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500 transition-all text-sm"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
            <p className="text-xs text-gray-600 mt-3">The backend will scrape the page content and extract key product facts automatically.</p>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || (mode === 'url' && !sourceUrl) || (mode !== 'url' && !sourceText)}
          className="mt-6 w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25 disabled:opacity-40 flex justify-center items-center gap-3"
        >
          {loading ? (
            <><span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />Executing LangGraph...</>
          ) : "Deploy Agents"}
        </button>
      </div>

      {/* Right Panel - Feed & Side-by-Side Outputs */}
      <div className="w-full md:w-2/3 flex flex-col bg-gray-950 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 blur-[150px] pointer-events-none rounded-full" />

        <div className="flex-1 overflow-y-auto p-8 lg:p-12 relative z-10 w-full max-w-7xl mx-auto flex flex-col">
          
          {/* THE AGENT ROOM */}
          <div className="flex items-center gap-3 mb-6 border-b border-gray-800/50 pb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)] animate-pulse" />
            <h2 className="text-lg font-bold text-gray-200 uppercase tracking-widest">Active Agent Room</h2>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            {['Researcher', 'Copywriter', 'Editor'].map((agent) => {
              const isActive = activeAgent === agent;
              const isPast = ['Copywriter', 'Editor'].includes(activeAgent) && agent === 'Researcher' || activeAgent === 'Editor' && agent === 'Copywriter' || finalState !== null;
              const icons = { Researcher: '🕵️', Copywriter: '✍️', Editor: '🧐' };
              
              return (
                <div key={agent} className={`flex-1 p-5 rounded-2xl border transition-all duration-700 flex items-center gap-4 ${isActive ? 'bg-indigo-900/40 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.25)]' : (isPast ? 'bg-gray-800/60 border-gray-700/50' : 'bg-gray-900/30 border-gray-800/40 opacity-50')}`}>
                  <div className={`text-3xl bg-gray-950 p-3 rounded-xl shadow-inner ${isActive ? 'animate-bounce' : ''}`}>{icons[agent as keyof typeof icons]}</div>
                  <div>
                    <h3 className={`font-bold text-sm tracking-wide uppercase ${isActive ? 'text-indigo-400' : (isPast ? 'text-gray-300' : 'text-gray-600')}`}>{agent}</h3>
                    <p className={`text-xs mt-1 ${isActive ? 'text-indigo-300' : 'text-gray-500'}`}>
                      {isActive ? (
                        <span className="flex items-center gap-2">
                           <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" /> Thinking...
                        </span>
                      ) : (
                        isPast ? 'Complete ✅' : 'Standby'
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Terminal Action Feed */}
          <div className="space-y-4 mb-10 max-h-48 overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
            {chatLogs.length === 0 && (
              <div className="text-gray-600/70 text-center mt-6 italic font-light tracking-wide">Awaiting system deployment...</div>
            )}
            {chatLogs.map((log, i) => (
              <div key={i} className={`p-4 rounded-xl shadow-sm border border-gray-800/80 backdrop-blur-sm ${log.agent === 'User' ? 'bg-gray-800/40 mr-12' : log.agent === 'Editor' ? 'bg-rose-900/10 border-rose-900/40 ml-12' : 'bg-indigo-900/10 ml-12'}`}>
                <div className={`text-[10px] font-black mb-1.5 uppercase tracking-widest ${log.agent === 'User' ? 'text-gray-500' : log.agent === 'Editor' ? 'text-rose-500' : log.agent === 'Researcher' ? 'text-amber-500' : 'text-blue-500'}`}>
                  {log.agent}
                </div>
                <div className="text-gray-200 font-mono text-xs leading-relaxed">{log.message}</div>
              </div>
            ))}
            <div ref={chatEndRef} className="h-2" />
          </div>

          {/* FINAL RESULTS: Side-by-Side View */}
          {finalState?.drafts && (
            <div className="animate-in fade-in slide-in-from-bottom-12 duration-700 flex flex-col flex-1 border-t border-gray-800/50 pt-10">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <h3 className="text-2xl font-black text-gray-100 uppercase tracking-widest">Final Campaign Build</h3>
                
                <div className="flex items-center gap-3">
                  {/* Responsive Output Toggle */}
                  <div className="flex bg-gray-900 rounded-xl p-1 border border-gray-800">
                    <button 
                      onClick={() => setPreviewMode('Desktop')} 
                      className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${previewMode === 'Desktop' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                      💻 Desktop
                    </button>
                    <button 
                      onClick={() => setPreviewMode('Mobile')} 
                      className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${previewMode === 'Mobile' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                      📱 Mobile
                    </button>
                  </div>
                </div>
              </div>

              {/* TWO COLUMN GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                
                {/* Left Column: Raw Source */}
                <div className="flex flex-col h-full w-full">
                  <div className="bg-gray-950/50 border border-gray-800/80 rounded-3xl p-6 shadow-xl h-full backdrop-blur-sm">
                    <h4 className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-gray-800/50 pb-3">
                      📄 Processed Source Text
                    </h4>
                    <div className="text-gray-400 text-xs leading-loose whitespace-pre-wrap font-mono overflow-y-auto max-h-[600px] pr-2 scrollbar-thin scrollbar-thumb-gray-800">
                      {finalState.source_text || sourceText}
                    </div>
                  </div>
                </div>

                {/* Right Column: Generated Artifacts & Warnings */}
                <div className={`flex flex-col space-y-6 ${previewMode === 'Mobile' ? 'items-center' : ''}`}>
                  {/* Ambiguity Warning Card */}
                  {finalState.fact_sheet?.ambiguous_statements?.length > 0 && (
                    <div className={`w-full ${previewMode === 'Mobile' ? 'max-w-[375px]' : ''} bg-amber-950/30 border border-amber-500/40 rounded-2xl p-6 shadow-[0_0_20px_rgba(245,158,11,0.15)] transition-all duration-500`}>
                      <h4 className="text-xs font-bold text-amber-500 mb-3 uppercase tracking-wider flex items-center gap-2">
                        ⚠️ Ambiguities Flagged in Source
                      </h4>
                      <ul className="text-amber-200/90 text-sm list-disc list-outside ml-5 space-y-2">
                        {finalState.fact_sheet.ambiguous_statements.map((statement: string, idx: number) => (
                          <li key={idx} className="leading-relaxed">{statement}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Drafts container */}
                  <div className={`w-full bg-transparent flex flex-col gap-6 ${previewMode === 'Mobile' ? 'items-center' : ''}`}>
                    <div className={`w-full ${previewMode === 'Mobile' ? 'max-w-[375px]' : ''} bg-gray-900 border border-gray-800/60 rounded-2xl p-6 shadow-xl hover:border-indigo-500/30 transition-all duration-500`}>
                      <h4 className="text-xs font-bold text-indigo-400 mb-4 uppercase tracking-wider">SEO Blog Post</h4>
                      <p className="text-gray-300 whitespace-pre-wrap text-[13px] leading-relaxed font-light">{finalState.drafts.blog}</p>
                    </div>
                    
                    <div className={`w-full ${previewMode === 'Mobile' ? 'max-w-[375px]' : ''} bg-gray-900 border border-gray-800/60 rounded-2xl p-6 shadow-xl hover:border-blue-500/30 transition-all duration-500`}>
                      <h4 className="text-xs font-bold text-blue-400 mb-4 uppercase tracking-wider">Social Thread</h4>
                      <p className="text-gray-300 whitespace-pre-wrap text-[13px] leading-relaxed font-light">{finalState.drafts.social_thread}</p>
                    </div>
                    
                    <div className={`w-full ${previewMode === 'Mobile' ? 'max-w-[375px]' : ''} bg-gray-900 border border-gray-800/60 rounded-2xl p-6 shadow-xl hover:border-emerald-500/30 transition-all duration-500`}>
                      <h4 className="text-xs font-bold text-emerald-400 mb-4 uppercase tracking-wider">Email Teaser</h4>
                      <p className="text-gray-300 whitespace-pre-wrap text-[13px] leading-relaxed font-light">{finalState.drafts.email_teaser}</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
