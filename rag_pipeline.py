"""
RAG Pipeline with Pinecone Vector Store
Supports both Personal API (cloud-based LLMs) and Local LLM (Ollama) options.

Required packages:
    pip install langchain langchain-pinecone langchain-ollama langchain-community pinecone-client pypdf requests

Environment variables:
    PERSONAL_API_KEY: API key for cloud LLM provider
    PINECONE_API_KEY: API key for Pinecone vector store

    
"""

PINECONE_API_KEY='pcsk_3EoXE9_6GmUz4Q7xq6NzibfawFCr2zbzvrK61KAWRMTtueckR3fJUM9jduTnMgugJwqeby'
OPENROUTER_API_KEY='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'

from langchain_pinecone import PineconeVectorStore
from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaLLM
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_classic.chains import create_retrieval_chain
from langchain_community.document_loaders import TextLoader, PyPDFLoader
from langchain_core.language_models.llms import LLM
from langchain_core.prompts import ChatPromptTemplate
from pinecone import Pinecone
from typing import Optional, List, Any
import requests
import json
import os
from datetime import datetime


class PersonalAPILLM(LLM):
    """Custom LLM wrapper for Personal API (cloud-based LLM providers)"""
    
    model: str = "google/gemma-3-27b-it:free"
    api_key: str = ""
    api_base_url: str = "https://openrouter.ai/api/v1/chat/completions"
    temperature: float = 0.3
    max_tokens: int = 2000
    
    @property
    def _llm_type(self) -> str:
        return "personal_api"
    
    def _call(
        self,
        prompt: str,
        stop: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> str:
        """Call the API endpoint"""
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "http://localhost:8501",
            "X-Title": "RAG Pipeline",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens
        }
        
        response = requests.post(
            url=self.api_base_url,
            headers=headers,
            data=json.dumps(data),
            timeout=60
        )
        
        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code} - {response.text}")
        
        result = response.json()
        return result["choices"][0]["message"]["content"]


class PineconeInferenceEmbeddings(Embeddings):
    """Custom embeddings using Pinecone Inference API"""
    
    def __init__(self, pc: Pinecone, model: str = "multilingual-e5-large"):
        self.pc = pc
        self.model = model
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed a list of documents using Pinecone inference"""
        response = self.pc.inference.embed(
            model=self.model,
            inputs=texts,
            parameters={
                "input_type": "passage",
                "truncate": "END"
            }
        )
        return [item['values'] for item in response.data]
    
    def embed_query(self, text: str) -> List[float]:
        """Embed a query using Pinecone inference"""
        response = self.pc.inference.embed(
            model=self.model,
            inputs=[text],
            parameters={
                "input_type": "query",
                "truncate": "END"
            }
        )
        return response.data[0]['values']


class BaseRAG:
    """Base class with shared RAG functionality"""
    
    # Pinecone configuration
    PINECONE_INDEX_NAME = "rag-pipeline"
    PINECONE_HOST = "https://rag-pipeline-girkty0.svc.aped-4627-b74a.pinecone.io"
    
    def __init__(self, debug: bool = False):
        self.debug = debug
        self.vectorstore = None
        self.qa_chain = None
        self.retriever = None
        self.pc = None
        self.index = None
        
        # Initialize Pinecone first (needed for embeddings)
        self._init_pinecone()
        
        # Initialize embeddings using Pinecone inference
        self.log("Loading embedding model (Pinecone Inference API)...")
        self.embeddings = PineconeInferenceEmbeddings(
            pc=self.pc,
            model="multilingual-e5-large"
        )
        self.log("✓ Embedding model configured (Pinecone Inference API)")
    
    def _init_pinecone(self):
        """Initialize Pinecone client and index"""
        api_key = PINECONE_API_KEY
        if not api_key:
            raise ValueError("PINECONE_API_KEY environment variable required")
        
        self.log("Connecting to Pinecone...")
        self.pc = Pinecone(api_key=api_key)
        self.index = self.pc.Index(
            name=self.PINECONE_INDEX_NAME,
            host=self.PINECONE_HOST
        )
        self.log(f"✓ Connected to Pinecone index: {self.PINECONE_INDEX_NAME}")
    
    def log(self, message: str):
        """Print debug messages"""
        if self.debug:
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] {message}")
    
    def load_documents(self, file_paths: List[str]):
        """Load documents from various formats"""
        self.log(f"Loading {len(file_paths)} document(s)...")
        documents = []
        
        for path in file_paths:
            if path.lower().endswith('.pdf'):
                loader = PyPDFLoader(path)
            else:
                loader = TextLoader(path)
            
            docs = loader.load()
            documents.extend(docs)
        
        self.log(f"✓ Loaded {len(documents)} document(s)")
        return documents
    
    def create_vectorstore(
        self,
        documents,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        namespace: str = ""
    ):
        """Create/update Pinecone vector store from documents"""
        self.log(f"Splitting documents (chunk_size={chunk_size}, overlap={chunk_overlap})...")
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )
        
        splits = text_splitter.split_documents(documents)
        self.log(f"  Split into {len(splits)} chunks")
        
        self.log("Upserting to Pinecone...")
        self.vectorstore = PineconeVectorStore.from_documents(
            documents=splits,
            embedding=self.embeddings,
            index_name=self.PINECONE_INDEX_NAME,
            namespace=namespace
        )
        
        self.log(f"✓ Vector store created/updated in Pinecone")
    
    def load_existing_vectorstore(self, namespace: str = ""):
        """Load existing Pinecone vector store"""
        self.log("Loading existing Pinecone vector store...")
        
        self.vectorstore = PineconeVectorStore(
            index=self.index,
            embedding=self.embeddings,
            namespace=namespace
        )
        
        self.log("✓ Loaded existing vector store")
        return True
    
    def clear_vectorstore(self, namespace: str = ""):
        """Clear all vectors from Pinecone index (or specific namespace)"""
        self.log("Clearing Pinecone vector store...")
        
        try:
            if namespace:
                self.index.delete(delete_all=True, namespace=namespace)
                self.log(f"✓ Cleared namespace: {namespace}")
            else:
                self.index.delete(delete_all=True)
                self.log("✓ Cleared all vectors from index")
            
            self.vectorstore = None
            self.qa_chain = None
            return True
        except Exception as e:
            self.log(f"Error clearing vector store: {e}")
            return False
    
    def setup_qa_chain(self, k: int = 5):
        """Setup QA chain with retrieval"""
        if self.vectorstore is None:
            raise ValueError("Vector store not initialized. Load or create one first.")
        
        self.log(f"Setting up QA chain (k={k})...")
        
        self.retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": k}
        )
        
        system_prompt = (
            "Use the given context to answer the question. "
            "If you don't know the answer, say you don't know. "
            "Don't assume anything. "
            "Be concise while using proper sentences and accurate. "
            "Show logic and brief explanation behind your reasoning if it's a complex question only.\n\n"
            "Context: {context}"
        )
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{input}"),
        ])
        
        question_answer_chain = create_stuff_documents_chain(self.llm, prompt)
        self.qa_chain = create_retrieval_chain(self.retriever, question_answer_chain)
        
        self.log("✓ QA chain setup complete")
    
    def query(self, question: str) -> dict:
        """Query the RAG system"""
        if self.qa_chain is None:
            raise ValueError("QA chain not initialized. Run setup_qa_chain() first.")
        
        self.log(f"Querying: '{question[:50]}...'")
        
        result = self.qa_chain.invoke({"input": question})
        
        return {
            "answer": result["answer"],
            "sources": result.get("context", [])
        }
    
    def get_index_stats(self) -> dict:
        """Get statistics about the Pinecone index"""
        stats = self.index.describe_index_stats()
        return stats


class PersonalAPIRAG(BaseRAG):
    """RAG with Personal API (cloud-based LLM)"""
    
    def __init__(
        self,
        model_name: str = "google/gemma-3-27b-it:free",
        api_key: Optional[str] = None,
        api_base_url: str = "https://openrouter.ai/api/v1/chat/completions",
        debug: bool = False
    ):
        super().__init__(debug)
        
        self.log("=" * 60)
        self.log("INITIALIZING PERSONAL API RAG")
        self.log("=" * 60)
        
        if api_key is None:
            api_key = OPENROUTER_API_KEY
        
        # if not api_key:
        #     raise ValueError("Personal API key required (set PERSONAL_API_KEY env var)")
        
        self.log(f"Connecting to LLM ({model_name})...")
        self.llm = PersonalAPILLM(
            model=model_name,
            api_key=api_key,
            api_base_url=api_base_url,
            temperature=0.3,
            max_tokens=2000
        )
        
        self.log(f"✓ LLM connected: {model_name}")
        self.log("=" * 60)


class LocalRAG(BaseRAG):
    """RAG with local Ollama models"""
    
    def __init__(
        self,
        model_name: str = "phi3:mini",
        base_url: str = "http://localhost:11434",
        debug: bool = False
    ):
        super().__init__(debug)
        
        self.log("=" * 60)
        self.log("INITIALIZING LOCAL RAG")
        self.log("=" * 60)
        
        self.log(f"Connecting to Ollama ({model_name})...")
        self.llm = OllamaLLM(
            model=model_name,
            base_url=base_url,
            temperature=0.1
        )
        
        self.log(f"✓ Ollama connected: {model_name}")
        self.log("=" * 60)


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    # Example 1: Using Personal API
    print("\n=== Testing Personal API RAG ===")
    
    try:
        rag = PersonalAPIRAG(
            model_name="google/gemma-3-27b-it:free",
            debug=True
        )
        
        # Load and index documents
        docs = rag.load_documents(["/Users/omkar/Projects/rag_pipeline/frontend/public/grades.csv"])
        rag.create_vectorstore(docs)
        rag.setup_qa_chain(k=5)
        
        # Query
        response = rag.query("What is this document about?")
        print(f"\nAnswer: {response['answer']}")
        
        # Get index stats
        stats = rag.get_index_stats()
        print(f"\nIndex Stats: {stats}")
        
    except Exception as e:
        print(f"Personal API RAG Error: {e}")
    
    # # Example 2: Using Local Ollama
    # print("\n\n=== Testing Local RAG ===")
    
    # try:
    #     local_rag = LocalRAG(
    #         model_name="phi3:mini",
    #         debug=True
    #     )
        
    #     # Load existing vector store (reuse indexed documents)
    #     local_rag.load_existing_vectorstore()
    #     local_rag.setup_qa_chain(k=5)
        
    #     # Query
    #     response = local_rag.query("What is this document about?")
    #     print(f"\nAnswer: {response['answer']}")
        
    # except Exception as e:
    #     print(f"Local RAG Error: {e}")