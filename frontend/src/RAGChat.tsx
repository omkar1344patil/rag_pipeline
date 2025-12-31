import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";


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
  const [showSettings, setShowSettings] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [docUrl, setDocUrl] = useState<string>("");
  const [docContent, setDocContent] = useState<string>("");
  const [isPdf, setIsPdf] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value);
  const [apiKeyOption, setApiKeyOption] = useState<"default" | "custom">("default");
  const [customApiKey, setCustomApiKey] = useState("");
  const [readme, setReadme] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    configure();
    fetch("/README.md")
      .then((res) => res.text())
      .then(setReadme)
      .catch(() => setReadme("# README\n\nPlace a README.md file in the public folder."));
  }, []);

  const configure = async (apiKey?: string) => {
    try {
      const body: any = { mode: "personal_api", model_name: selectedModel };
      if (apiKey) body.api_key = apiKey;
      await fetch(`${API_URL}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.error("Config error:", e);
    }
  };

  const uploadFile = async (filename: string, file?: File) => {
    setLoading(true);
    const formData = new FormData();
    const isPdfFile = filename.toLowerCase().endsWith(".pdf");
    setIsPdf(isPdfFile);

    if (file) {
      formData.append("files", file);
      if (isPdfFile) {
        setDocUrl(URL.createObjectURL(file));
        setDocContent("");
      } else {
        setDocContent(await file.text());
        setDocUrl("");
      }
    } else {
      try {
        const res = await fetch(`/${filename}`);
        const blob = await res.blob();
        formData.append("files", blob, filename);
        if (isPdfFile) {
          setDocUrl(`/${filename}`);
          setDocContent("");
        } else {
          setDocContent(await blob.text());
          setDocUrl("");
        }
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
    setDocContent("");
    setDocUrl("");
    setShowDoc(false);
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
      // Trim whitespace from answer
      const answer = (data.answer || data.detail || "").trim();
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Error getting response" }]);
    }
    setLoading(false);
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4285f4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{ background: "#fff", padding: "20px 40px", position: "relative", textAlign: "center", marginTop: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#1a1a1a" }}>Omkar's Retrieval Augmented Generation (RAG) Project</h1>
        <div style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 32 }}>
          <button onClick={() => document.getElementById("readme-section")?.scrollIntoView({ behavior: "smooth" })} style={{ background: "none", border: "none", fontSize: 15, fontWeight: 600, cursor: "pointer", color: "#333" }}>Readme</button>
          <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "none", fontSize: 15, fontWeight: 600, cursor: "pointer", color: "#333" }}>Settings</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px" }}>
        
        {/* What is RAG Section */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 32, marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16, marginTop: 0 }}>What is RAG?</h2>
          <p style={{ color: "#333", fontSize: 15, fontWeight: 500, lineHeight: 1.8, marginTop: 32, marginBottom: 16 }}>
            RAG stands for Retrieval-Augmented Generation.
          </p>
          <p style={{ color: "#333", fontSize: 15, fontWeight: 500, lineHeight: 1.8, marginBottom: 16 }}>
            Basically, it's when an AI system looks something up before answering, kind of like how you would lookup company-specific policies something to get the correct information before responding to a client.
          </p>
          <p style={{ color: "#333", fontSize: 15, fontWeight: 500, lineHeight: 1.8, marginBottom: 16 }}>
            Imagine you have a confidential document which is 1000 pages long with access restricted within your company and your job is to find specific information from the document. Technically, you can't just feed this document into any random AI and conduct your research due to data privacy concerns. Although, you can feed it into a RAG which works on your company's private hosted AI model.
          </p>
          <p style={{ color: "#333", fontSize: 15, fontWeight: 500, lineHeight: 1.8, margin: 0 }}>
            Instead of just relying on what any base LLM already knows, A RAG searches through documents or databases to find relevant information, then uses that to give a specific answer. This way the output more accurate and up-to-date, rather than the AI just guessing based on old random knowledge. It's pretty straightforward, try it out below by uploading a document or using a sample document, then ask a question based on something in that document.
          </p>
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          {/* Left Column */}
          <div style={{ flex: 1 }}>
            {/* Upload Section */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 32, marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>Upload Document</h2>
              <p style={{ color: "#555", fontSize: 15, fontWeight: 500, marginBottom: 24 }}>Drag sample files into the upload area or upload your own document</p>

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
                      padding: "12px 18px",
                      background: "#fff",
                      borderRadius: 8,
                      cursor: "grab",
                      border: "1.5px solid #e0e0e0",
                      fontSize: 14,
                      fontWeight: 600,
                      transition: "all 0.2s",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.borderColor = "#4285f4")}
                    onMouseOut={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")}
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
                  setDragOver(false);
                  const filename = e.dataTransfer.getData("filename");
                  if (filename) uploadFile(filename);
                  else if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0].name, e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "#4285f4" : "#ccc"}`,
                  borderRadius: 12,
                  padding: "40px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "#f0f7ff" : "#fafafa",
                  transition: "all 0.2s",
                }}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv" onChange={handleFileSelect} style={{ display: "none" }} />
                <p style={{ margin: 0, color: dragOver ? "#4285f4" : "#555", fontWeight: 600, fontSize: 15 }}>
                  {loading ? "Uploading & Indexing..." : dragOver ? "Drop to upload!" : "Upload your own document"}
                </p>
                <p style={{ margin: "8px 0 0", color: "#888", fontSize: 14, fontWeight: 500 }}>or drag sample files here</p>
              </div>

              {/* Status */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, padding: "14px 18px", background: "#fafafa", borderRadius: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: loadedFile ? "#1a73e8" : "#666" }}>
                  {loadedFile ? (<><strong style={{ color: "#34a853" }}>✓</strong> {loadedFile} loaded and indexed</>) : ("No file loaded")}
                </span>
                {loadedFile && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowDoc(!showDoc)} style={{ background: "#4285f4", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      {showDoc ? "Hide Doc" : "View Doc"}
                    </button>
                    <button onClick={clearFile} title="Clear this file from vectorstore" style={{ background: "#fff", border: "1.5px solid #ddd", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#555" }}>
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Chat Section */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>Chat</h2>

              <div style={{ height: 350, overflowY: "auto", marginBottom: 20, padding: 16, background: "#fafafa", borderRadius: 8 }}>
                {messages.length === 0 && (
                  <p style={{ color: "#888", textAlign: "center", marginTop: 120, fontWeight: 500 }}>
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
                      maxWidth: "80%",
                      fontSize: 14,
                      fontWeight: 500,
                      lineHeight: 1.6,
                      boxShadow: m.role === "assistant" ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                    }}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {loading && messages.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div style={{ background: "#fff", padding: "12px 16px", borderRadius: 16, color: "#888", fontSize: 14, fontWeight: 500 }}>Thinking...</div>
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
                  style={{ flex: 1, padding: "14px 18px", borderRadius: 10, border: "1.5px solid #ddd", fontSize: 14, fontWeight: 500, outline: "none" }}
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
                    fontWeight: 600,
                    cursor: loadedFile ? "pointer" : "not-allowed",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Document Viewer */}
          {showDoc && (
            <div style={{ width: 450, background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #eee" }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Document</h3>
                <button onClick={() => setShowDoc(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#666", fontWeight: 700, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ height: 600 }}>
                {isPdf ? (
                  <iframe
                    src={docUrl}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    title="PDF Preview"
                  />
                ) : (
                  <div style={{ padding: 20, height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
                    <pre style={{ margin: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#333" }}>
                      {docContent || "No content to display"}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* README Section */}
        <div id="readme-section" style={{ background: "#fff", borderRadius: 12, padding: 32, marginTop: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>README</h2>
          <div style={{ color: "#444", lineHeight: 1.8, fontSize: 15, fontWeight: 500 }}>
            <ReactMarkdown>{readme}</ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowSettings(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, maxWidth: 450, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: 24, fontWeight: 700 }}>Settings</h2>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Model</label>
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 14, fontWeight: 500, background: "#fff" }}>
                {MODELS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
              </select>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>API Key</label>
              <select value={apiKeyOption} onChange={(e) => setApiKeyOption(e.target.value as "default" | "custom")} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 14, fontWeight: 500, background: "#fff", marginBottom: 12 }}>
                <option value="default">Default (Environment Variable)</option>
                <option value="custom">Custom API Key</option>
              </select>
              {apiKeyOption === "custom" && (
                <input type="password" value={customApiKey} onChange={(e) => setCustomApiKey(e.target.value)} placeholder="Enter your API key" style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 14, fontWeight: 500, boxSizing: "border-box" }} />
              )}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setShowSettings(false)} style={{ flex: 1, background: "#f1f1f1", color: "#333", border: "none", borderRadius: 8, padding: "12px 24px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveSettings} style={{ flex: 1, background: "#4285f4", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", cursor: "pointer", fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}