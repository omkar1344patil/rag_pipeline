import React, { useState, useRef, useEffect } from "react";

const API_URL = "http://localhost:8000";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SAMPLE_FILES = [
  { name: "grades.csv", icon: "📊" },
  { name: "sample_pdf.pdf", icon: "📄" },
  { name: "sampletxt.txt", icon: "📝" },
];

const MODELS = [
  { value: "google/gemma-3-27b-it:free", label: "Gemma 3 27B (Free)" },
  { value: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B (Free)" },
  { value: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B (Free)" },
];

export default function RAGChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showReadme, setShowReadme] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value);
  const [apiKeyOption, setApiKeyOption] = useState<"default" | "custom">("default");
  const [customApiKey, setCustomApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    configure();
  }, []);

  const configure = async (apiKey?: string) => {
    try {
      const body: any = { mode: "personal_api", model_name: selectedModel };
      if (apiKey) body.api_key = apiKey;
      const res = await fetch(`${API_URL}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) setConfigured(true);
    } catch (e) {
      console.error("Config error:", e);
    }
  };

  const uploadFile = async (filename: string, file?: File) => {
    setLoading(true);
    const formData = new FormData();
    
    if (file) {
      formData.append("files", file);
    } else {
      // For sample files, fetch from public folder
      try {
        const res = await fetch(`/${filename}`);
        const blob = await res.blob();
        formData.append("files", blob, filename);
      } catch (e) {
        alert("Could not load sample file");
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch(`${API_URL}/documents/upload`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setLoadedFile(filename);
        setMessages([{ role: "assistant", content: `Ready! Ask me anything about "${filename}"` }]);
      } else {
        alert("Upload failed");
      }
    } catch (e) {
      alert("Upload error");
    }
    setLoading(false);
  };

  const clearFile = async () => {
    try {
      await fetch(`${API_URL}/documents/clear`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
    } catch (e) {}
    setMessages([]);
    setLoadedFile(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || !loadedFile) return;
    const userMsg = input;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMsg }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.answer || data.detail }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Error getting response" }]);
    }
    setLoading(false);
  };

  const handleDrop = (e: React.DragEvent, filename: string) => {
    e.preventDefault();
    setDragOver(false);
    uploadFile(filename);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file.name, file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file.name, file);
  };

  const saveSettings = () => {
    const key = apiKeyOption === "custom" ? customApiKey : undefined;
    configure(key);
    setShowSettings(false);
  };

  const Paperclip = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4285f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #eee", padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Retrieval Augmented Generation (RAG)</h1>
        <div style={{ display: "flex", gap: 32 }}>
          <button onClick={() => setShowReadme(true)} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "#333" }}>Readme</button>
          <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "#333" }}>Settings</button>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px" }}>
        {/* Upload Section */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 32, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Upload Document</h2>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>Drag sample files into the upload area or upload your own document</p>
          
          {/* Sample Files */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            {SAMPLE_FILES.map((file) => (
              <div
                key={file.name}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("filename", file.name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "#f8f9fa",
                  borderRadius: 8,
                  cursor: "grab",
                  border: "1px solid #e9ecef",
                  fontSize: 14,
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = "#4285f4")}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = "#e9ecef")}
              >
                <Paperclip />
                {file.name}
              </div>
            ))}
          </div>

          {/* Upload Area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              const filename = e.dataTransfer.getData("filename");
              if (filename) {
                handleDrop(e, filename);
              } else {
                handleFileDrop(e);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#4285f4" : "#ddd"}`,
              borderRadius: 12,
              padding: "40px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "#f0f7ff" : "#fafafa",
              transition: "all 0.2s",
            }}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv" onChange={handleFileSelect} style={{ display: "none" }} />
            <p style={{ margin: 0, color: dragOver ? "#4285f4" : "#666", fontWeight: 500 }}>
              {loading ? "Uploading & Indexing..." : dragOver ? "Drop to upload!" : "Upload your own document"}
            </p>
            <p style={{ margin: "8px 0 0", color: "#999", fontSize: 13 }}>or drag sample files here</p>
          </div>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, padding: "12px 16px", background: "#f8f9fa", borderRadius: 8 }}>
            <span style={{ fontSize: 14, color: loadedFile ? "#1a73e8" : "#666" }}>
              {loadedFile ? (
                <><strong style={{ color: "#34a853" }}>✓</strong> {loadedFile} loaded and indexed</>
              ) : (
                "No file loaded"
              )}
            </span>
            {loadedFile && (
              <button
                onClick={clearFile}
                title="Clear this file from vectorstore"
                style={{ background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer", color: "#666" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Chat Section */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Chat</h2>
          
          <div style={{ height: 350, overflowY: "auto", marginBottom: 20, padding: 16, background: "#f8f9fa", borderRadius: 8 }}>
            {messages.length === 0 && (
              <p style={{ color: "#999", textAlign: "center", marginTop: 120 }}>
                {loadedFile ? "Ask a question about your document" : "Upload a document to start chatting"}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{
                  background: m.role === "user" ? "#4285f4" : "#fff",
                  color: m.role === "user" ? "#fff" : "#333",
                  padding: "12px 16px",
                  borderRadius: 16,
                  maxWidth: "75%",
                  fontSize: 14,
                  lineHeight: 1.5,
                  boxShadow: m.role === "assistant" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                  whiteSpace: "pre-wrap",
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && messages.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ background: "#fff", padding: "12px 16px", borderRadius: 16, color: "#999", fontSize: 14 }}>Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={loadedFile ? "Type your question..." : "Upload a document first"}
              disabled={!loadedFile}
              style={{ flex: 1, padding: "14px 18px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, outline: "none" }}
            />
            <button
              onClick={sendMessage}
              disabled={!loadedFile || loading}
              style={{
                background: loadedFile ? "#4285f4" : "#ccc",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "14px 28px",
                fontSize: 14,
                fontWeight: 500,
                cursor: loadedFile ? "pointer" : "not-allowed",
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Readme Modal */}
      {showReadme && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowReadme(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, maxWidth: 600, width: "90%", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: 24, fontWeight: 600 }}>README</h2>
            <div style={{ color: "#444", lineHeight: 1.8 }}>
              <h3 style={{ color: "#4285f4" }}>RAG Pipeline</h3>
              <p>A Retrieval-Augmented Generation system that allows you to chat with your documents.</p>
              <h4>How to use:</h4>
              <ol><li>Upload a document (PDF, TXT, or CSV)</li><li>Wait for indexing to complete</li><li>Ask questions about your document</li></ol>
              <h4>Features:</h4>
              <ul><li>Supports PDF, TXT, and CSV files</li><li>Powered by Pinecone vector database</li><li>Multiple LLM model options</li></ul>
              <h4>Tech Stack:</h4>
              <p>LangChain • Pinecone • FastAPI • React</p>
            </div>
            <button onClick={() => setShowReadme(false)} style={{ marginTop: 20, background: "#4285f4", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", cursor: "pointer", fontWeight: 500 }}>Close</button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowSettings(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, maxWidth: 450, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: 24, fontWeight: 600 }}>Settings</h2>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 500, fontSize: 14 }}>Model</label>
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, background: "#fff" }}>
                {MODELS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
              </select>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 500, fontSize: 14 }}>API Key</label>
              <select value={apiKeyOption} onChange={(e) => setApiKeyOption(e.target.value as "default" | "custom")} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, background: "#fff", marginBottom: 12 }}>
                <option value="default">Default (Environment Variable)</option>
                <option value="custom">Custom API Key</option>
              </select>
              {apiKeyOption === "custom" && (
                <input type="password" value={customApiKey} onChange={(e) => setCustomApiKey(e.target.value)} placeholder="Enter your API key" style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
              )}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setShowSettings(false)} style={{ flex: 1, background: "#f1f1f1", color: "#333", border: "none", borderRadius: 8, padding: "12px 24px", cursor: "pointer", fontWeight: 500 }}>Cancel</button>
              <button onClick={saveSettings} style={{ flex: 1, background: "#4285f4", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", cursor: "pointer", fontWeight: 500 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}