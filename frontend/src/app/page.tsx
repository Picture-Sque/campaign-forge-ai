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
  const [showReasoning, setShowReasoning] = useState(false);
  const [activeTab, setActiveTab] = useState<'assets' | 'data'>('assets');

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
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const response = await fetch(`${backendUrl}/stream`, {
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

  // Per-output copy handlers
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

  const handleCopy = (label: string, content: string) => {
    navigator.clipboard.writeText(content);
    alert(`${label} copied to clipboard!`);
  };

  // ── SOCIAL THREAD PARSER ──
  const parseSocialThread = (text: string): string[] => {
    if (!text) return [];

    // Strategy 1: split on inline numbering like "1/5", "2/5", "3/7", etc.
    const inlineNumbered = /(?=\b\d+\/\d+\b)/;
    const inlineParts = text.split(inlineNumbered).map(s => s.trim()).filter(Boolean);
    if (inlineParts.length > 1) return inlineParts;

    // Strategy 2: split on "Post N:" or "Post N" labels
    const labelParts = text.split(/Post \d+[:\s]*/gm).map(s => s.trim()).filter(Boolean);
    if (labelParts.length > 1) return labelParts;

    // Strategy 3: split on double (or more) newlines
    const newlineParts = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    if (newlineParts.length > 1) return newlineParts;

    // Fallback: return the whole thing as one post
    return [text.trim()];
  };

  const tabClass = (m: InputMode) =>
    `px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${mode === m ? 'bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white shadow-[0_0_12px_rgba(247,147,26,0.4)]' : 'text-[#94A3B8] hover:text-white'}`;

  // Agent color tokens for the terminal feed
  const agentColor: Record<string, string> = {
    User:       'text-[#94A3B8]',
    Researcher: 'text-[#F7931A]',
    Copywriter: 'text-[#FFD600]',
    Editor:     'text-[#EA580C]',
    System:     'text-[#94A3B8]',
  };

  const agentBg: Record<string, string> = {
    User:       'bg-white/5 border-white/10 mr-12',
    Researcher: 'bg-[#F7931A]/5 border-[#F7931A]/20 ml-12',
    Copywriter: 'bg-[#FFD600]/5 border-[#FFD600]/15 ml-12',
    Editor:     'bg-[#EA580C]/5 border-[#EA580C]/20 ml-12',
    System:     'bg-white/5 border-white/10 ml-12',
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-[#030304] text-white font-[family-name:var(--font-inter)] flex flex-col md:flex-row bg-grid-pattern">

      {/* ── LEFT PANEL ── */}
      <div className="w-full md:w-1/3 h-full border-r border-white/10 p-6 md:p-8 flex flex-col bg-[#0F1115]/80 backdrop-blur-md shadow-2xl z-20 overflow-y-auto">

        {/* Logo */}
        <div className="mb-8">
          <h1
            className="text-3xl md:text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-[#F7931A] to-[#FFD600]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            CampaignForge
          </h1>
          <div className="h-0.5 w-12 bg-gradient-to-r from-[#F7931A] to-[#FFD600] rounded-full mb-3 shadow-[0_0_8px_rgba(247,147,26,0.6)]" />
          <p className="text-[#94A3B8] text-sm tracking-wide">Autonomous Content Factory</p>
        </div>

        {/* Input Mode Tabs */}
        <div className="flex gap-2 mb-6 bg-black/30 p-1.5 rounded-xl border border-white/10">
          <button className={tabClass('text')} onClick={() => setMode('text')}>Text</button>
          <button className={tabClass('file')} onClick={() => setMode('file')}>File</button>
          <button className={tabClass('url')}  onClick={() => setMode('url')}>URL</button>
        </div>

        {/* Text Mode */}
        {mode === 'text' && (
          <>
            <label className="text-xs font-bold text-[#94A3B8] mb-3 uppercase tracking-widest block">
              Raw Source Document
            </label>
            <textarea
              className="flex-grow w-full bg-black/50 border border-white/10 hover:border-white/20 focus:border-[#F7931A] focus:ring-1 focus:ring-[#F7931A] rounded-xl p-4 md:p-5 text-[#94A3B8] transition-all resize-none shadow-inner text-sm leading-relaxed outline-none"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          </>
        )}

        {/* File Mode */}
        {mode === 'file' && (
          <div
            className={`flex-grow flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${isDragging ? 'border-[#F7931A] bg-[#F7931A]/10' : 'border-white/10 hover:border-white/20 bg-black/20'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
            <div className="text-4xl mb-4">📄</div>
            {fileName ? (
              <>
                <p className="text-[#F7931A] font-bold text-sm" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>{fileName}</p>
                <p className="text-[#94A3B8] text-xs mt-1">File loaded — ready to deploy</p>
              </>
            ) : (
              <>
                <p className="text-[#94A3B8] font-semibold text-sm">Drop a .txt or .md file here</p>
                <p className="text-white/30 text-xs mt-1">or click to browse</p>
              </>
            )}
          </div>
        )}

        {/* URL Mode */}
        {mode === 'url' && (
          <div className="flex flex-col flex-grow">
            <label className="text-xs font-bold text-[#94A3B8] mb-3 uppercase tracking-widest block">
              Webpage URL
            </label>
            <input
              type="url"
              placeholder="https://example.com/product-page"
              className="w-full bg-black/50 border border-white/10 hover:border-white/20 focus:border-[#F7931A] focus:ring-1 focus:ring-[#F7931A] rounded-xl p-4 md:p-5 text-[#94A3B8] transition-all text-sm leading-relaxed outline-none"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
            <p className="text-xs text-white/30 mt-4">The backend will scrape the page content and extract key product facts automatically.</p>
          </div>
        )}

        {/* Deploy Button */}
        <button
          onClick={handleGenerate}
          disabled={loading || (mode === 'url' && !sourceUrl) || (mode !== 'url' && !sourceText)}
          className="mt-8 w-full bg-gradient-to-r from-[#EA580C] to-[#F7931A] hover:from-[#F7931A] hover:to-[#FFD600] active:scale-95 text-white font-bold py-3.5 md:py-4 px-6 rounded-full transition-all shadow-[0_0_20px_-5px_rgba(247,147,26,0.5)] hover:shadow-[0_0_30px_-3px_rgba(247,147,26,0.8)] disabled:opacity-30 disabled:cursor-not-allowed flex justify-center items-center gap-3 touch-manipulation text-base md:text-lg"
          style={{ fontFamily: 'var(--font-inter)' }}
        >
          {loading ? (
            <><span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" /><span>Executing LangGraph...</span></>
          ) : (
            <><span>⚡</span><span>Deploy Agents</span></>
          )}
        </button>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-full md:w-2/3 h-full flex flex-col bg-[#030304] relative overflow-y-auto">

        {/* Atmospheric Orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#F7931A]/8 blur-[180px] rounded-full" />
          <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-[#FFD600]/5 blur-[150px] rounded-full opacity-60 animate-float" />
        </div>

        <div className="p-8 lg:p-12 relative z-10 w-full max-w-7xl mx-auto flex flex-col">

          {/* ── ACTIVE AGENT ROOM ── */}
          <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F7931A] shadow-[0_0_10px_rgba(247,147,26,0.9)] animate-pulse" />
            <h2
              className="text-lg font-bold text-white uppercase tracking-widest"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              Active Agent Room
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            {['Researcher', 'Copywriter', 'Editor'].map((agent) => {
              const isActive = activeAgent === agent;
              const isPast =
                (['Copywriter', 'Editor'].includes(activeAgent) && agent === 'Researcher') ||
                (activeAgent === 'Editor' && agent === 'Copywriter') ||
                finalState !== null;
              const icons = { Researcher: '🕵️', Copywriter: '✍️', Editor: '🧐' };

              return (
                <div
                  key={agent}
                  className={`flex-1 p-5 rounded-2xl border transition-all duration-700 flex items-center gap-4 ${
                    isActive
                      ? 'bg-[#0F1115] border-[#F7931A] active-agent-glow'
                      : isPast
                      ? 'bg-[#0F1115] border-white/10'
                      : 'bg-[#0F1115]/40 border-white/5 opacity-40'
                  }`}
                >
                  <div className={`text-3xl bg-black/50 p-3 rounded-xl shadow-inner ${isActive ? 'animate-bounce' : ''}`}>
                    {icons[agent as keyof typeof icons]}
                  </div>
                  <div>
                    <h3
                      className={`font-bold text-sm tracking-wide uppercase ${isActive ? 'text-[#F7931A]' : isPast ? 'text-white' : 'text-white/30'}`}
                      style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                    >
                      {agent}
                    </h3>
                    <p className={`text-xs mt-1 ${isActive ? 'text-[#F7931A]/80' : 'text-[#94A3B8]'}`}
                       style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                      {isActive ? (
                        <span className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-[#F7931A] rounded-full animate-ping" /> Thinking...
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

          {/* ── TERMINAL FEED ── */}
          <div className="rounded-2xl border border-white/10 bg-black overflow-hidden mb-10">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#0F1115]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F7931A]/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFD600]/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
              <span className="ml-2 text-[10px] text-[#94A3B8] uppercase tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                Agent Feed
              </span>
            </div>
            <div
              className="space-y-3 p-4 max-h-56 overflow-y-auto"
              style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              {chatLogs.length === 0 && (
                <div className="text-white/20 text-center mt-4 italic text-xs tracking-widest">
                  &gt; Awaiting system deployment...
                </div>
              )}
              {chatLogs.map((log, i) => (
                <div key={i} className={`p-3 rounded-xl border text-xs leading-relaxed ${agentBg[log.agent] ?? 'bg-white/5 border-white/10 ml-12'}`}>
                  <div className={`text-[10px] font-black mb-1.5 uppercase tracking-widest ${agentColor[log.agent] ?? 'text-[#94A3B8]'}`}>
                    {log.agent}
                  </div>
                  <div className="text-[#94A3B8]">{log.message}</div>
                </div>
              ))}
              <div ref={chatEndRef} className="h-1" />
            </div>
          </div>

          {/* ── FINAL RESULTS ── */}
          {finalState?.drafts && (
            <div className="animate-in fade-in slide-in-from-bottom-12 duration-700 flex flex-col flex-1 border-t border-white/10 pt-10">

              <div className="flex flex-col gap-5 mb-8">
                <h3
                  className="text-2xl font-black text-white uppercase tracking-widest"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Final Campaign Build
                </h3>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 flex-wrap">

                  {/* ── CONFIDENCE GAUGE ── */}
                  {finalState.confidence_score > 0 && (() => {
                    const score = finalState.confidence_score;
                    const isHigh = score >= 90;
                    const color = isHigh
                      ? {
                          text:   'text-[#FFD600]',
                          border: 'border-[#FFD600]/40',
                          bg:     'bg-[#FFD600]/5',
                          glow:   'shadow-[0_0_16px_rgba(255,214,0,0.25)]',
                          bar:    'bg-[#FFD600]',
                          label:  'text-[#FFD600]/80',
                        }
                      : {
                          text:   'text-[#EA580C]',
                          border: 'border-[#EA580C]/40',
                          bg:     'bg-[#EA580C]/5',
                          glow:   'shadow-[0_0_16px_rgba(234,88,12,0.2)]',
                          bar:    'bg-[#EA580C]',
                          label:  'text-[#EA580C]/80',
                        };
                    return (
                      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${color.border} ${color.bg} ${color.glow} transition-all duration-500`}>
                        <div className="flex flex-col items-center min-w-[36px]">
                          <span className={`text-lg font-black leading-none ${color.text}`} style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                            {score}<span className="text-xs font-bold">%</span>
                          </span>
                          <span className={`text-[8px] font-bold uppercase tracking-widest mt-0.5 ${color.label}`}>Confidence</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${color.text}`}>Editor Score</span>
                          <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${color.bar}`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <span className={`text-[8px] ${color.label}`}>{isHigh ? 'Perfect Match ✓' : 'Approved ✓'}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Export buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyClipboard}
                      className="px-3 md:px-4 py-2.5 bg-gradient-to-r from-[#EA580C] to-[#F7931A] hover:from-[#F7931A] hover:to-[#FFD600] text-white text-xs font-bold rounded-full transition-all shadow-[0_0_12px_rgba(247,147,26,0.3)] hover:shadow-[0_0_18px_rgba(247,147,26,0.5)] touch-manipulation"
                    >
                      📋 Copy All
                    </button>
                    <button
                      onClick={handleDownloadZip}
                      className="px-3 md:px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#F7931A]/40 text-white text-xs font-bold rounded-full transition-all touch-manipulation"
                    >
                      ⬇️ Download
                    </button>
                  </div>
                </div>
              </div>

              {/* ── TAB NAVIGATION ── */}
              <div className="flex mb-8 bg-[#0F1115] p-1.5 rounded-2xl border border-white/10 w-fit" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                <button
                  onClick={() => setActiveTab('assets')}
                  className={`px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300 ${
                    activeTab === 'assets'
                      ? 'bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white shadow-[0_0_20px_-5px_rgba(247,147,26,0.5)]'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  ✦ Campaign Assets
                </button>
                <button
                  onClick={() => setActiveTab('data')}
                  className={`px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300 ${
                    activeTab === 'data'
                      ? 'bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white shadow-[0_0_20px_-5px_rgba(247,147,26,0.5)]'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  ⬡ Data &amp; Source
                </button>
              </div>

              {/* ── TAB 1: CAMPAIGN ASSETS ── */}
              {activeTab === 'assets' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">

                  {/* SEO Blog Post */}
                  <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5 md:p-6 shadow-lg hover:shadow-[0_0_20px_-5px_rgba(247,147,26,0.25)] hover:border-[#F7931A]/30 transition-all duration-500 flex flex-col h-full">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-4 border-b border-white/10">
                      <h4
                        className="text-xs font-bold text-[#F7931A] uppercase tracking-wider"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        SEO Blog Post
                      </h4>
                      <button
                        className="w-full sm:w-auto px-4 py-2.5 text-xs rounded-full bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white hover:from-[#F7931A] hover:to-[#FFD600] transition-all font-bold shadow-md hover:shadow-[0_0_12px_rgba(247,147,26,0.4)] touch-manipulation"
                        onClick={() => handleCopy('SEO Blog Post', finalState.drafts.blog)}
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-[#94A3B8] whitespace-pre-wrap text-[13px] md:text-sm leading-relaxed flex-grow break-words">
                      {finalState.drafts.blog}
                    </p>
                  </div>

                  {/* Social Thread */}
                  <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5 md:p-6 shadow-lg hover:shadow-[0_0_20px_-5px_rgba(255,214,0,0.2)] hover:border-[#FFD600]/25 transition-all duration-500 flex flex-col h-full">
                    <h4
                      className="text-xs font-bold text-[#FFD600] mb-4 pb-4 border-b border-white/10 uppercase tracking-wider"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    >
                      Social Thread
                    </h4>
                    <div className="flex flex-col gap-4">
                      {parseSocialThread(finalState.drafts.social_thread || '').map((post: string, idx: number) => (
                        <div
                          key={idx}
                          className="bg-[#0F1115] border border-white/10 rounded-xl p-5 hover:shadow-[0_0_18px_-4px_rgba(255,214,0,0.2)] hover:border-[#FFD600]/25 transition-all duration-300 flex flex-col gap-3"
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="text-[11px] font-black text-[#F7931A] uppercase tracking-widest"
                              style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                            >
                              Post {idx + 1}
                            </span>
                            <button
                              className="px-3 py-1 text-xs rounded-full bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white hover:from-[#F7931A] hover:to-[#FFD600] transition-all font-bold shadow-md touch-manipulation"
                              onClick={() => handleCopy(`Post ${idx + 1}`, post)}
                            >
                              Copy
                            </button>
                          </div>
                          <p
                            className="text-[#94A3B8] text-[12px] md:text-[13px] leading-relaxed whitespace-pre-wrap break-words"
                            style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                          >
                            {post}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Email Teaser */}
                  <div className="bg-[#0F1115] border border-white/10 rounded-2xl p-5 md:p-6 shadow-lg hover:shadow-[0_0_20px_-5px_rgba(234,88,12,0.25)] hover:border-[#EA580C]/30 transition-all duration-500 flex flex-col h-full">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-4 border-b border-white/10">
                      <h4
                        className="text-xs font-bold text-[#EA580C] uppercase tracking-wider"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        Email Teaser
                      </h4>
                      <button
                        className="w-full sm:w-auto px-4 py-2.5 text-xs rounded-full bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white hover:from-[#F7931A] hover:to-[#FFD600] transition-all font-bold shadow-md hover:shadow-[0_0_12px_rgba(247,147,26,0.4)] touch-manipulation"
                        onClick={() => handleCopy('Email Teaser', finalState.drafts.email_teaser)}
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-[#94A3B8] whitespace-pre-wrap text-[13px] md:text-sm leading-relaxed flex-grow break-words">
                      {finalState.drafts.email_teaser}
                    </p>
                  </div>

                </div>
              )}

              {/* ── TAB 2: DATA & SOURCE ── */}
              {activeTab === 'data' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">

                  {/* Fact Sheet (spans 2 columns) */}
                  {finalState.fact_sheet && (
                    <div className="col-span-1 lg:col-span-2 bg-[#0F1115] border border-[#F7931A]/20 rounded-3xl p-5 md:p-6 shadow-[0_0_30px_-10px_rgba(247,147,26,0.3)] hover:border-[#F7931A]/35 backdrop-blur-sm transition-all duration-500">
                      <h4
                        className="text-xs font-bold text-[#F7931A] mb-5 uppercase tracking-widest flex items-center gap-2 border-b border-white/10 pb-3"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        🧠 Extracted Fact Sheet
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {finalState.fact_sheet.value_proposition && (
                          <div className="col-span-full bg-[#F7931A]/8 border border-[#F7931A]/20 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-[#F7931A] uppercase tracking-widest mb-2">⚡ Value Proposition</p>
                            <p className="text-white text-sm leading-relaxed">{finalState.fact_sheet.value_proposition}</p>
                          </div>
                        )}
                        {finalState.fact_sheet.target_audience && (
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-[#FFD600] uppercase tracking-widest mb-2">🎯 Target Audience</p>
                            <p className="text-[#94A3B8] text-sm leading-relaxed">{finalState.fact_sheet.target_audience}</p>
                          </div>
                        )}
                        {finalState.fact_sheet.key_benefits?.length > 0 && (
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-[#F7931A] uppercase tracking-widest mb-2">✅ Key Benefits</p>
                            <ul className="space-y-1.5">
                              {finalState.fact_sheet.key_benefits.map((b: string, i: number) => (
                                <li key={i} className="text-[#94A3B8] text-xs flex gap-2"><span className="text-[#F7931A] mt-0.5">•</span>{b}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {finalState.fact_sheet.core_features?.length > 0 && (
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-[#EA580C] uppercase tracking-widest mb-2">🔧 Core Features</p>
                            <ul className="space-y-1.5">
                              {finalState.fact_sheet.core_features.map((f: string, i: number) => (
                                <li key={i} className="text-[#94A3B8] text-xs flex gap-2"><span className="text-[#EA580C] mt-0.5">•</span>{f}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {finalState.fact_sheet.technical_specs?.length > 0 && (
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-[#FFD600] uppercase tracking-widest mb-2">⚙️ Technical Specs</p>
                            <ul className="space-y-1.5">
                              {finalState.fact_sheet.technical_specs.map((s: string, i: number) => (
                                <li key={i} className="text-[#94A3B8] text-xs flex gap-2"><span className="text-[#FFD600] mt-0.5">•</span>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Ambiguities (spans 2 columns) */}
                  {finalState.fact_sheet?.ambiguous_statements?.length > 0 && (
                    <div className="col-span-1 lg:col-span-2 bg-[#EA580C]/5 border border-[#EA580C]/30 rounded-2xl p-5 md:p-6 shadow-lg transition-all duration-500">
                      <h4
                        className="text-xs font-bold text-[#EA580C] mb-3 uppercase tracking-wider flex items-center gap-2"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        ⚠️ Ambiguities Flagged in Source
                      </h4>
                      <ul className="text-[#EA580C]/80 text-sm list-disc list-outside ml-5 space-y-2">
                        {finalState.fact_sheet.ambiguous_statements.map((statement: string, idx: number) => (
                          <li key={idx} className="leading-relaxed">{statement}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Processed Source Text (spans 2 columns) */}
                  <div className="col-span-1 lg:col-span-2 bg-black/40 border border-white/10 rounded-3xl p-5 md:p-6 shadow-lg hover:border-white/20 backdrop-blur-sm transition-all duration-500">
                    <h4
                      className="text-xs font-bold text-[#94A3B8] mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-white/10 pb-3"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    >
                      📄 Processed Source Text
                    </h4>
                    <div
                      className="text-[#94A3B8]/70 text-xs leading-loose whitespace-pre-wrap overflow-y-auto max-h-[400px] pr-2"
                      style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                    >
                      {finalState.source_text || sourceText}
                    </div>
                  </div>

                  {/* Chain-of-Thought (spans 2 columns) */}
                  {finalState.drafts.justification && (
                    <div className="col-span-1 lg:col-span-2">
                      <button
                        onClick={() => setShowReasoning(prev => !prev)}
                        className="w-full flex items-center justify-between px-5 py-4 md:py-5 rounded-2xl border border-[#F7931A]/20 bg-[#F7931A]/5 hover:bg-[#F7931A]/10 active:bg-[#F7931A]/15 hover:border-[#F7931A]/40 text-[#F7931A] hover:text-[#FFD600] transition-all duration-300 touch-manipulation"
                      >
                        <span className="flex items-center gap-2.5 text-xs md:text-sm font-bold uppercase tracking-widest">
                          <span className={`transition-transform duration-300 text-lg ${showReasoning ? 'scale-110' : ''}`}>🧠</span>
                          {showReasoning ? 'Hide AI Chain-of-Thought' : 'View AI Chain-of-Thought'}
                        </span>
                        <span className={`text-lg md:text-xl font-thin transition-transform duration-300 inline-block ${showReasoning ? 'rotate-180' : ''}`}>⌄</span>
                      </button>

                      {showReasoning && (
                        <div className="mt-4 bg-black/60 border border-[#F7931A]/15 rounded-2xl p-5 md:p-6 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
                          <p className="text-[10px] md:text-xs font-black text-[#F7931A] uppercase tracking-widest mb-4 flex items-center gap-2"
                             style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-[#F7931A] animate-pulse" />
                            Copywriter Reasoning Log
                          </p>
                          <p
                            className="text-[#94A3B8] text-xs leading-relaxed whitespace-pre-wrap break-words"
                            style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                          >
                            {finalState.drafts.justification}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
