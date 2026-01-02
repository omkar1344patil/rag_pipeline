"""
FastAPI Backend for RAG Pipeline
Endpoints for document management, querying, and vector store operations.

Run with: uvicorn api:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import os
import tempfile
import shutil
from datetime import datetime

from rag_pipeline import PersonalAPIRAG, LocalRAG, BaseRAG

# ============================================================================
# Pydantic Models (Request/Response schemas)
# ============================================================================

class ConfigureRequest(BaseModel):
    """Request model for configuring the RAG system"""
    mode: str = Field(..., description="'personal_api' or 'local'")
    model_name: Optional[str] = Field(None, description="Model name to use")
    api_key: Optional[str] = Field(None, description="API key for personal_api mode")
    api_base_url: Optional[str] = Field(None, description="Custom API base URL")

class QueryRequest(BaseModel):
    """Request model for querying the RAG system"""
    question: str = Field(..., description="Question to ask")
    k: int = Field(5, description="Number of documents to retrieve")

class QueryResponse(BaseModel):
    """Response model for queries"""
    answer: str
    sources: List[dict] = []
    processing_time: float

class StatusResponse(BaseModel):
    """Response model for status checks"""
    initialized: bool
    mode: Optional[str]
    model_name: Optional[str]
    vector_count: int
    index_name: str

class ClearRequest(BaseModel):
    """Request model for clearing vector store"""
    namespace: str = Field("", description="Namespace to clear (empty = all)")
    confirm: bool = Field(False, description="Confirmation flag")

class UploadResponse(BaseModel):
    """Response model for document uploads"""
    message: str
    documents_loaded: int
    chunks_created: int
    processing_time: float


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="RAG Pipeline API",
    description="API for RAG (Retrieval-Augmented Generation) with Pinecone vector store",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global RAG instance
rag_instance: Optional[BaseRAG] = None


# ============================================================================
# Helper Functions
# ============================================================================

def get_rag():
    """Get current RAG instance or raise error"""
    if rag_instance is None:
        raise HTTPException(
            status_code=400,
            detail="RAG not initialized. Call /configure first."
        )
    return rag_instance


# ============================================================================
# Endpoints
# ============================================================================

@app.get("/")
@app.head("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "message": "RAG Pipeline API is running",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/configure", response_model=dict)
async def configure(config: ConfigureRequest):
    """
    Initialize/configure the RAG system.
    
    - **mode**: 'personal_api' for cloud LLM or 'local' for Ollama
    - **model_name**: Model to use (e.g., 'google/gemma-3-27b-it:free' or 'phi3:mini')
    - **api_key**: Required for personal_api mode
    """
    global rag_instance
    
    try:
        if config.mode == "personal_api":
            api_key = config.api_key or os.environ.get("PERSONAL_API_KEY")
            if not api_key:
                raise HTTPException(
                    status_code=400,
                    detail="API key required for personal_api mode"
                )
            
            rag_instance = PersonalAPIRAG(
                model_name=config.model_name or "google/gemma-3-27b-it:free",
                api_key=api_key,
                api_base_url=config.api_base_url or "https://openrouter.ai/api/v1/chat/completions",
                debug=True
            )
            
        elif config.mode == "local":
            rag_instance = LocalRAG(
                model_name=config.model_name or "phi3:mini",
                debug=True
            )
            
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mode: {config.mode}. Use 'personal_api' or 'local'"
            )
        
        return {
            "status": "success",
            "message": f"RAG initialized in {config.mode} mode",
            "model": config.model_name or ("google/gemma-3-27b-it:free" if config.mode == "personal_api" else "phi3:mini")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/status", response_model=StatusResponse)
async def get_status():
    """Get current RAG system status"""
    if rag_instance is None:
        return StatusResponse(
            initialized=False,
            mode=None,
            model_name=None,
            vector_count=0,
            index_name=BaseRAG.PINECONE_INDEX_NAME
        )
    
    try:
        stats = rag_instance.get_index_stats()
        vector_count = stats.get("total_vector_count", 0)
    except:
        vector_count = 0
    
    mode = "personal_api" if isinstance(rag_instance, PersonalAPIRAG) else "local"
    model_name = rag_instance.llm.model if hasattr(rag_instance.llm, 'model') else "unknown"
    
    return StatusResponse(
        initialized=True,
        mode=mode,
        model_name=model_name,
        vector_count=vector_count,
        index_name=rag_instance.PINECONE_INDEX_NAME
    )


@app.post("/documents/upload", response_model=UploadResponse)
async def upload_documents(
    files: List[UploadFile] = File(...),
    chunk_size: int = Form(1000),
    chunk_overlap: int = Form(200),
    namespace: str = Form("")
):
    """
    Upload and index documents.
    
    - **files**: PDF or text files to upload
    - **chunk_size**: Size of text chunks (default: 1000)
    - **chunk_overlap**: Overlap between chunks (default: 200)
    - **namespace**: Pinecone namespace (optional)
    """
    rag = get_rag()
    start_time = datetime.now()
    
    temp_dir = tempfile.mkdtemp()
    temp_files = []
    
    try:
        # Save uploaded files temporarily
        for file in files:
            temp_path = os.path.join(temp_dir, file.filename)
            with open(temp_path, "wb") as f:
                content = await file.read()
                f.write(content)
            temp_files.append(temp_path)
        
        # Load documents
        documents = rag.load_documents(temp_files)
        
        # Create vector store
        rag.create_vectorstore(
            documents,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            namespace=namespace
        )
        
        # Setup QA chain
        rag.setup_qa_chain(k=5)
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Get chunk count from index stats
        stats = rag.get_index_stats()
        chunks_created = stats.get("total_vector_count", 0)
        
        return UploadResponse(
            message="Documents uploaded and indexed successfully",
            documents_loaded=len(documents),
            chunks_created=chunks_created,
            processing_time=processing_time
        )
        
    finally:
        # Cleanup temp files
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/documents/load-existing")
async def load_existing(namespace: str = ""):
    """
    Load existing vectors from Pinecone (skip re-indexing).
    
    - **namespace**: Pinecone namespace to load from
    """
    rag = get_rag()
    
    try:
        rag.load_existing_vectorstore(namespace=namespace)
        rag.setup_qa_chain(k=5)
        
        stats = rag.get_index_stats()
        
        return {
            "status": "success",
            "message": "Loaded existing vector store",
            "vector_count": stats.get("total_vector_count", 0)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/documents/clear")
async def clear_documents(request: ClearRequest):
    """
    Clear vectors from Pinecone index.
    
    - **namespace**: Specific namespace to clear (empty = all vectors)
    - **confirm**: Must be True to proceed
    """
    if not request.confirm:
        raise HTTPException(
            status_code=400,
            detail="Set 'confirm: true' to proceed with clearing"
        )
    
    rag = get_rag()
    
    success = rag.clear_vectorstore(namespace=request.namespace)
    
    if success:
        return {
            "status": "success",
            "message": f"Cleared vectors from namespace: '{request.namespace}'" if request.namespace else "Cleared all vectors"
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to clear vector store")


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """
    Query the RAG system.
    
    - **question**: Your question
    - **k**: Number of relevant documents to retrieve (default: 5)
    """
    rag = get_rag()
    
    if rag.qa_chain is None:
        raise HTTPException(
            status_code=400,
            detail="QA chain not initialized. Upload documents first or call /documents/load-existing"
        )
    
    start_time = datetime.now()
    
    try:
        # Update k if different from default
        if request.k != 5:
            rag.setup_qa_chain(k=request.k)
        
        result = rag.query(request.question)
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # Format sources
        sources = []
        for doc in result.get("sources", []):
            sources.append({
                "content": doc.page_content[:500] + "..." if len(doc.page_content) > 500 else doc.page_content,
                "metadata": doc.metadata
            })
        
        return QueryResponse(
            answer=result["answer"],
            sources=sources,
            processing_time=processing_time
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/index/stats")
async def get_index_stats():
    """Get Pinecone index statistics"""
    rag = get_rag()
    
    try:
        stats = rag.get_index_stats()
        return {
            "status": "success",
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models/available")
async def get_available_models():
    """Get list of suggested models for each mode"""
    return {
        "personal_api": [
            {"name": "google/gemma-3-27b-it:free", "description": "Free Gemma 3 27B"},
            {"name": "meta-llama/llama-3.2-3b-instruct:free", "description": "Free Llama 3.2 3B"},
            {"name": "mistralai/mistral-7b-instruct:free", "description": "Free Mistral 7B"},
            {"name": "qwen/qwen-2-7b-instruct:free", "description": "Free Qwen 2 7B"},
        ],
        "local": [
            {"name": "phi3:mini", "description": "Microsoft Phi-3 Mini (3.8B)"},
            {"name": "llama3.2:3b", "description": "Meta Llama 3.2 (3B)"},
            {"name": "mistral:7b", "description": "Mistral 7B"},
            {"name": "gemma2:2b", "description": "Google Gemma 2 (2B)"},
        ]
    }


# ============================================================================
# Run with: uvicorn api:app --reload --port 8000
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)